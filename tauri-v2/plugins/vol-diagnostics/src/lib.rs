//! Ölçüm sondası köprüsü (diagnostics).
//!
//! Cihaz başında ölçüm yapan sonda uygulamasının (`devtools/deck-probe`)
//! native yarısıdır: ön yüzün gördüğü her şeyi tek kanallı bir JSONL kaydına
//! yazar. Kayıt, betiğin SSH üzerinden çektiği tek dosyadır — Deck'te uzaktan
//! çıkış yoktur, ölçüm ancak böyle bir kayıtla toplanır.
//!
//! Taşıdığı üç gözlem kanalı:
//!
//! - `report`: JS'in yazdığı her satır dosyaya eklenir ve `fsync`lenir —
//!   süreç ölürse o ana kadarki kanıt diskte kalır.
//! - Kapanış kaydı: kabuğun (`volstudio-tauri`) yayınladığı `vol:terminate`
//!   ve `vol:exiting` olayları kayda geçer; Steam'in "Oyundan çık"ının
//!   gönderdiği sinyal sırası bu kayıttan okunur.
//! - Uyku izleyici: `CLOCK_BOOTTIME − CLOCK_MONOTONIC` sıçraması uyku
//!   süresini verir; `performance.now()` uykuyu saymadığı için JS tarafındaki
//!   sıçrama bununla kıyaslanır.
//!
//! Ortam dökümü (`env_info`) izin listesiyle çalışır: oturum belirteci ya da
//! kişisel veri taşıyabilecek değişkenler kayda girmez.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Manager, Runtime,
};

/// Kayıt biçimi sürümü; ölçüm kayıtları bunu taşır ki okuyucu eski/yeni
/// şemayı ayırt edebilsin.
pub const RECORD_VERSION: u32 = 1;

/// Kimlik, yol ve oturum belirteci taşımayan tam değişken adları.
const ENV_ALLOWLIST: &[&str] = &[
    "steamdeck",
    "steamos",
    "steamgamepadui",
    "steamtenfoot",
    "steam_client_launch",
    "steam_display_refresh_limits",
    "steam_gamescope",
    "webkit_disable_dmabuf_renderer",
    "webkit_force_vblank_timer",
    "webkit_display_refresh_throttle_fps",
    "__nv_disable_explicit_sync",
    "gdk_backend",
    "xdg_session_type",
    "sdl_enable_steam_screen_keyboard",
    "vol_deck_measure",
    "vol_deck_haptics_probe",
    "vol_deck_scenario",
    "vol_deck_seed",
    "vol_deck_weather",
    "vol_deck_season",
    "vol_deck_quality",
    "pressure_vessel_architectures",
    "srt_urlopen_prefer_steam",
    "lang",
];

fn allowed_env_name(key: &str) -> bool {
    ENV_ALLOWLIST.contains(&key.to_lowercase().as_str())
}

fn measurement_requested(value: Option<&str>) -> bool {
    value == Some("1")
}

fn log_path(dir: &std::path::Path) -> PathBuf {
    let _ = std::fs::create_dir_all(dir);
    dir.join("diagnostics.jsonl")
}

fn append(dir: &std::path::Path, line: &str) {
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path(dir))
    {
        // Tek write çağrısı şart: writeln! satırı ve '\n'ı ayrı write'a
        // böler; sinyal işleyici ile JS `report` aynı anda yazarsa iki
        // kayıt tek satırda birleşir. O_APPEND + tek write_all kaydı atomik tutar.
        let _ = file.write_all(format!("{line}\n").as_bytes());
        let _ = file.sync_data();
    }
}

#[cfg(target_os = "linux")]
fn clock(id: libc::clockid_t) -> f64 {
    let mut ts = libc::timespec {
        tv_sec: 0,
        tv_nsec: 0,
    };
    unsafe { libc::clock_gettime(id, &mut ts) };
    ts.tv_sec as f64 + ts.tv_nsec as f64 / 1e9
}

/// Rust tarafından üretilen kayıt satırı: mono/boot/wall saatleri birlikte
/// yazılır ki uyku sıçraması ve JS saatleriyle kıyas yapılabilsin.
#[cfg(target_os = "linux")]
fn native(dir: &std::path::Path, kind: &str, extra: serde_json::Value) {
    let mut value = serde_json::json!({
        "v": RECORD_VERSION,
        "src": "rust",
        "type": kind,
        "mono": clock(libc::CLOCK_MONOTONIC),
        "boot": clock(libc::CLOCK_BOOTTIME),
        "wall": clock(libc::CLOCK_REALTIME),
    });
    if let (Some(target), Some(source)) = (value.as_object_mut(), extra.as_object()) {
        for (key, item) in source {
            target.insert(key.clone(), item.clone());
        }
    }
    append(dir, &value.to_string());
}

#[tauri::command]
fn report<R: Runtime>(app: AppHandle<R>, line: String) {
    if let Some(dir) = app.try_state::<DiagnosticsDir>() {
        append(&dir.0, &line);
    }
}

#[tauri::command]
fn env_info() -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for (key, value) in std::env::vars() {
        if allowed_env_name(&key) {
            map.insert(key, value.into());
        }
    }
    map.insert("pid".into(), std::process::id().into());
    serde_json::Value::Object(map)
}

/// Kayıt dizini bir kez çözülür ve state olarak saklanır.
struct DiagnosticsDir(PathBuf);

fn diagnostics_dir<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    if let Ok(custom) = std::env::var("VOL_DIAGNOSTICS_DIR") {
        return PathBuf::from(custom);
    }
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("/tmp/vol-diagnostics"))
}

/// Kapanış kaydı: sinyali ve boşaltma sonucunu kabuk (`volstudio-tauri`)
/// `vol:terminate` ve `vol:exiting` olarak yayınlar; burada yalnız kayda geçer.
#[cfg(target_os = "linux")]
fn record_shutdown<R: Runtime>(app: &AppHandle<R>, dir: PathBuf) {
    use tauri::Listener;
    let signal_dir = dir.clone();
    app.listen_any("vol:terminate", move |event| {
        let detail: serde_json::Value = serde_json::from_str(event.payload()).unwrap_or_default();
        native(&signal_dir, "signal", detail);
    });
    app.listen_any("vol:exiting", move |event| {
        let detail: serde_json::Value = serde_json::from_str(event.payload()).unwrap_or_default();
        native(&dir, "exit-after-grace", detail);
    });
}

/// Uyku izleyici: BOOTTIME uyku süresini de sayar, MONOTONIC saymaz —
/// ikisinin farkının sıçraması uyku uzunluğudur.
#[cfg(target_os = "linux")]
fn watch_suspend(dir: PathBuf) {
    std::thread::spawn(move || {
        let mut offset = clock(libc::CLOCK_BOOTTIME) - clock(libc::CLOCK_MONOTONIC);
        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let next = clock(libc::CLOCK_BOOTTIME) - clock(libc::CLOCK_MONOTONIC);
            if next - offset > 0.5 {
                native(
                    &dir,
                    "suspend-gap",
                    serde_json::json!({ "seconds": next - offset }),
                );
            }
            offset = next;
        }
    });
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    build(true)
}

/// Oyunda komut yüzeyini korur; kayıt, uyku ve kapanış kaydı yalnız
/// açık Deck ölçümünde kurulur. Sonda uygulaması `init()` ile sürekli kayıt alır.
pub fn init_for_measurement<R: Runtime>() -> TauriPlugin<R> {
    let enabled = measurement_requested(std::env::var("VOL_DECK_MEASURE").ok().as_deref());
    build(enabled)
}

fn build<R: Runtime>(enabled: bool) -> TauriPlugin<R> {
    Builder::new("vol-diagnostics")
        .invoke_handler(tauri::generate_handler![report, env_info])
        .setup(move |app, _api| {
            if !enabled {
                return Ok(());
            }
            let dir = diagnostics_dir(app);
            #[cfg(target_os = "linux")]
            {
                native(&dir, "start", serde_json::json!({}));
                record_shutdown(app, dir.clone());
                watch_suspend(dir.clone());
            }
            app.manage(DiagnosticsDir(dir));
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod privacy_tests {
    use super::{allowed_env_name, measurement_requested};

    #[test]
    fn game_recording_requires_exact_measurement_flag() {
        for value in [None, Some(""), Some("0"), Some("true"), Some("01")] {
            assert!(!measurement_requested(value));
        }
        assert!(measurement_requested(Some("1")));
    }

    #[test]
    fn environment_does_not_admit_paths_ids_or_prefix_secrets() {
        for key in [
            "HOME",
            "APPDIR",
            "SteamAppId",
            "SteamEnv",
            "SteamVirtualGamepadInfo",
            "VOL_DECK_TOKEN",
            "WEBKIT_SESSION_TOKEN",
            "XDG_SESSION_ID",
        ] {
            assert!(!allowed_env_name(key));
        }
        for key in [
            "VOL_DECK_MEASURE",
            "VOL_DECK_SCENARIO",
            "VOL_DECK_SEED",
            "VOL_DECK_WEATHER",
            "VOL_DECK_SEASON",
            "VOL_DECK_QUALITY",
            "STEAM_GAMESCOPE",
            "WEBKIT_FORCE_VBLANK_TIMER",
        ] {
            assert!(allowed_env_name(key));
        }
    }
}

#[cfg(all(test, target_os = "linux"))]
mod shutdown_tests {
    use super::*;
    use tauri::Emitter;

    #[test]
    fn kapanis_event_packeti_gercek_kayitta_kimlik_neden_ve_sinyali_korur() {
        let app = tauri::test::mock_app();
        let dir =
            std::env::temp_dir().join(format!("vol-diagnostics-shutdown-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("diagnostics.jsonl");
        if path.exists() {
            std::fs::remove_file(&path).unwrap();
        }
        record_shutdown(app.handle(), dir.clone());
        app.emit(
            "vol:terminate",
            serde_json::json!({
                "requestId": "shutdown-1", "reason": "signal", "signal": 15,
            }),
        )
        .unwrap();
        app.emit(
            "vol:exiting",
            serde_json::json!({
                "requestId": "shutdown-1", "reason": "signal", "signal": 15, "outcome": "failed",
            }),
        )
        .unwrap();
        let records: Vec<serde_json::Value> = std::fs::read_to_string(&path)
            .unwrap()
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert_eq!(records.len(), 2);
        assert_eq!(records[0]["requestId"], "shutdown-1");
        assert_eq!(records[0]["reason"], "signal");
        assert_eq!(records[0]["signal"], 15);
        assert_eq!(records[1]["requestId"], "shutdown-1");
        assert_eq!(records[1]["outcome"], "failed");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
