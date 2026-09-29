//! Atomik kalıcılık komutları — `TauriStoreAdapter`'ın native yarısı.
//!
//! Yazma sırası: geçici dosya → fsync → eski kayıt `.bak` olur → rename →
//! dizin fsync'i. Herhangi bir anda diskte tam bir kayıt vardır: ya eski
//! ya yeni. Okuma, güncel kayıt bozuksa `.bak`'a düşer ve `recovered`
//! işaretini döner — ölçüm kaydına "kurtarıldı" diye geçer, sessizce
//! eski veri yutturulmaz.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Seri hâldeki kayıt + kurtarma işareti. `data` yoksa `null` döner.
#[derive(serde::Serialize)]
pub struct StoreRead {
    pub data: Option<String>,
    /// Güncel dosya bozuktu, yedekten okundu.
    pub recovered: bool,
}

fn store_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("veri dizini yok: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("veri dizini yaratılamadı: {error}"))?;
    Ok(dir)
}

/// Dosya adı tek parça olmalı: dizin ayracı ve `..` reddedilir ki komut
/// veri dizininin dışına yazamaz.
fn validate_name(name: &str) -> Result<(), String> {
    let ok = !name.is_empty()
        && name.len() <= 128
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        && !name.starts_with('.');
    if ok {
        Ok(())
    } else {
        Err(format!("geçersiz store adı: {name:?}"))
    }
}

fn read_raw(path: &Path) -> Option<Result<String, String>> {
    match File::open(path) {
        Ok(mut file) => {
            let mut data = String::new();
            Some(
                file.read_to_string(&mut data)
                    .map(|_| data)
                    .map_err(|error| format!("okuma: {error}")),
            )
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => Some(Err(format!("açma: {error}"))),
    }
}

/// JSON nesnesi olarak çözümlenebiliyor mu? Store kaydı hep nesne taşır;
/// yarım yazılmış ya da yabancı içerik bozuk sayılır.
fn parses_as_object(data: &str) -> bool {
    serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(data).is_ok()
}

fn read_in(dir: &Path, name: &str) -> Result<StoreRead, String> {
    let current = dir.join(name);
    let backup = dir.join(format!("{name}.bak"));

    match read_raw(&current) {
        Some(Ok(data)) if parses_as_object(&data) => {
            return Ok(StoreRead {
                data: Some(data),
                recovered: false,
            });
        }
        Some(Ok(_)) | Some(Err(_)) => {
            // Bozuk güncel kayıt: yedeğe düş, hatayı yutma.
        }
        None => {
            return Ok(StoreRead {
                data: None,
                recovered: false,
            })
        }
    }

    match read_raw(&backup) {
        Some(Ok(data)) if parses_as_object(&data) => Ok(StoreRead {
            data: Some(data),
            recovered: true,
        }),
        Some(Ok(_)) => Err("güncel ve yedek kayıt ikisi de bozuk".to_string()),
        Some(Err(_)) | None => Err("güncel kayıt bozuk ve yedek yok".to_string()),
    }
}

fn write_in(dir: &Path, name: &str, data: &str) -> Result<(), String> {
    let current = dir.join(name);
    let backup = dir.join(format!("{name}.bak"));
    let temp = dir.join(format!("{name}.tmp"));

    // Yeni kayıt önce geçiciye tam yazılır — yedek ancak yeni veri diskteyken
    // güncelin yerine geçer; yoksa yazma hatası kayıtsız bir pencere bırakır.
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&temp)
        .map_err(|error| format!("geçici açma: {error}"))?;
    file.write_all(data.as_bytes())
        .and_then(|()| file.sync_all())
        .map_err(|error| format!("yazma/fsync: {error}"))?;
    drop(file);

    // Önceki jenerasyon yedeğe taşınır — yeni kayıt düşerse geri dönüş var.
    if current.exists() {
        fs::rename(&current, &backup).map_err(|error| format!("yedek taşıma: {error}"))?;
    }
    fs::rename(&temp, &current).map_err(|error| format!("yerine koyma: {error}"))?;

    // Dizin girdisinin fsync'i: rename'in kalıcı olması bunu ister.
    File::open(dir)
        .and_then(|dir_file| dir_file.sync_all())
        .map_err(|error| format!("dizin fsync: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn vol_store_read(app: tauri::AppHandle, name: String) -> Result<StoreRead, String> {
    validate_name(&name)?;
    read_in(&store_dir(&app)?, &name)
}

#[tauri::command]
pub fn vol_store_write(app: tauri::AppHandle, name: String, data: String) -> Result<(), String> {
    validate_name(&name)?;
    if !parses_as_object(&data) {
        return Err("store kaydı JSON nesnesi olmalı".to_string());
    }
    write_in(&store_dir(&app)?, &name, &data)
}

#[cfg(test)]
mod store_tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "vol-store-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn yazi_ve_oku() {
        let dir = temp_dir();
        write_in(&dir, "a.json", r#"{"x":1}"#).unwrap();
        let read = read_in(&dir, "a.json").unwrap();
        assert_eq!(read.data.as_deref(), Some(r#"{"x":1}"#));
        assert!(!read.recovered);
    }

    #[test]
    fn yoksa_null_doner() {
        let dir = temp_dir();
        let read = read_in(&dir, "hic.json").unwrap();
        assert_eq!(read.data, None);
        assert!(!read.recovered);
    }

    #[test]
    fn bozuk_guncel_yedekten_kurtarilir() {
        let dir = temp_dir();
        write_in(&dir, "b.json", r#"{"v":1}"#).unwrap();
        write_in(&dir, "b.json", r#"{"v":2}"#).unwrap();
        // Günceli elle boz — yedekte bir önceki jenerasyon durur.
        fs::write(dir.join("b.json"), "{yari").unwrap();
        let read = read_in(&dir, "b.json").unwrap();
        assert!(read.recovered);
        assert_eq!(read.data.as_deref(), Some(r#"{"v":1}"#));
    }

    #[test]
    fn ikisi_de_bozuksa_hata_doner() {
        let dir = temp_dir();
        fs::write(dir.join("c.json"), "{yari").unwrap();
        fs::write(dir.join("c.json.bak"), "[[[").unwrap();
        assert!(read_in(&dir, "c.json").is_err());
    }

    #[test]
    fn ad_dogrulamasi_dizin_kacisini_reddeder() {
        for kotu in ["../x", "a/b", "a\\b", "", ".gizli", ".."] {
            assert!(validate_name(kotu).is_err(), "reddedilmeli: {kotu}");
        }
        for iyi in ["game-store.json", "a_b.json", "x.json"] {
            assert!(validate_name(iyi).is_ok(), "geçmeli: {iyi}");
        }
    }

    #[test]
    fn nesne_olmayan_kayit_bozuk_sayilir() {
        assert!(parses_as_object(r#"{"a":1}"#));
        assert!(!parses_as_object("[1,2]"));
        assert!(!parses_as_object("42"));
        assert!(!parses_as_object("{yari"));
    }
}
