//! Steam Input sanal kollarının arkasındaki gerçek aygıtlar. Steam oyuna
//! `SteamVirtualGamepadInfo` ile INI biçiminde bir dosya yolu verir; glif
//! ailesi bu bilgiyle Steamworks olmadan da gerçek kola göre seçilir.

/// Bir sanal kol yuvası. Ad bilgisi aygıt adıdır, kullanıcı verisi değildir.
#[derive(serde::Serialize, Debug, PartialEq, Eq)]
pub struct VirtualGamepad {
    pub slot: u32,
    pub name: String,
    pub vid: u32,
    pub pid: u32,
    #[serde(rename = "type")]
    pub kind: String,
}

fn hex(value: &str) -> Option<u32> {
    u32::from_str_radix(
        value
            .trim()
            .trim_start_matches("0x")
            .trim_start_matches("0X"),
        16,
    )
    .ok()
}

/// `[slot N]` bölümlerini sırasıyla okur; eksik alanlı bölüm atlanır.
pub fn parse_virtual_gamepads(text: &str) -> Vec<VirtualGamepad> {
    let mut pads = Vec::new();
    let mut current: Option<(u32, Vec<(String, String)>)> = None;
    let flush = |section: Option<(u32, Vec<(String, String)>)>, pads: &mut Vec<VirtualGamepad>| {
        let Some((slot, fields)) = section else {
            return;
        };
        let get = |key: &str| {
            fields
                .iter()
                .find(|(name, _)| name.eq_ignore_ascii_case(key))
                .map(|(_, value)| value.as_str())
        };
        if let (Some(vid), Some(pid)) = (get("VID").and_then(hex), get("PID").and_then(hex)) {
            pads.push(VirtualGamepad {
                slot,
                name: get("name").unwrap_or_default().to_string(),
                vid,
                pid,
                kind: get("type").unwrap_or_default().to_string(),
            });
        }
    };
    for line in text.lines().map(str::trim) {
        if let Some(header) = line
            .strip_prefix('[')
            .and_then(|rest| rest.strip_suffix(']'))
        {
            flush(current.take(), &mut pads);
            current = header
                .strip_prefix("slot ")
                .and_then(|slot| slot.trim().parse().ok())
                .map(|slot| (slot, Vec::new()));
        } else if let (Some((_, fields)), Some((key, value))) =
            (current.as_mut(), line.split_once('='))
        {
            fields.push((key.trim().to_string(), value.trim().to_string()));
        }
    }
    flush(current.take(), &mut pads);
    pads
}

/// Steam dışında (değişken yoksa) boş liste döner.
#[tauri::command]
pub fn steam_virtual_gamepads() -> Vec<VirtualGamepad> {
    std::env::var_os("SteamVirtualGamepadInfo")
        .and_then(|path| std::fs::read_to_string(path).ok())
        .map(|text| parse_virtual_gamepads(&text))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steam_dosyasi_yuva_yuva_okunur() {
        let text = "[slot 0]\nname=Steam Deck Controller\nVID=0x28de\nPID=0x1205\ntype=steam\n\n[slot 1]\nname=DualSense Wireless Controller\nVID=0x054c\nPID=0x0ce6\ntype=ps5\n";
        assert_eq!(
            parse_virtual_gamepads(text),
            vec![
                VirtualGamepad {
                    slot: 0,
                    name: "Steam Deck Controller".into(),
                    vid: 0x28de,
                    pid: 0x1205,
                    kind: "steam".into()
                },
                VirtualGamepad {
                    slot: 1,
                    name: "DualSense Wireless Controller".into(),
                    vid: 0x054c,
                    pid: 0x0ce6,
                    kind: "ps5".into()
                },
            ]
        );
    }

    #[test]
    fn eksik_ya_da_bozuk_bolum_atlanir() {
        let text =
            "[slot x]\nVID=0x1\nPID=0x2\n[slot 2]\nname=Yarım\nVID=zz\n[genel]\nVID=0x1\nPID=0x2\n";
        assert!(parse_virtual_gamepads(text).is_empty());
    }
}
