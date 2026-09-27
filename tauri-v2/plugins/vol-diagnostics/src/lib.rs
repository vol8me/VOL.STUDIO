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
//! - Sinyal izleyici: SIGTERM/SIGINT/SIGHUP sürece ve `vol:terminate` olayı
//!   olarak ön yüze yazılır; Steam'in "Oyundan çık"ının gönderdiği sinyal
//!   sırası bu kayıttan okunur.
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
    AppHandle, Emitter, Manager, Runtime,
};

/// Kayıt biçimi sürümü; ölçüm kayıtları bunu taşır ki okuyucu eski/yeni
/// şemayı ayırt edebilsin.
pub const RECORD_VERSION: u32 = 1;

/// `env_info` yanıtına dahil edilen değişken önekleri. Toptan `Steam*` kaydı
/// bilerek yoktur: oturum belirteçleri de aynı öneki taşır.
const ENV_ALLOWLIST: &[&str] = &[
    "steamdeck",
    "steamos",
    "steamgamepadui",
    "steamtenfoot",
    "steamappid",
    "steamgameid",
    "steamoverlaygameid",
    "steamvirtualgamepadinfo",
    "steam_client_launch",
    "steamenv",
    "steam_display_refresh_limits",
    "steam_gamescope",
    "webkit",
    "gamescope",
    "gdk_backend",
    "display",
    "wayland_display",
    "xdg_session",
    "sdl_enable_steam_screen_keyboard",
    // Repo-içi ölçüm bayrakları (`VOL_DECK_MEASURE` vb.) — kendi ad alanımız;
    // sır taşıyan değişkenler bu önekle adlandırılmaz.
    "vol_deck",
    "pressure_vessel_runtime",
    "pressure_vessel_architectures",
    "srt_urlopen_prefer_steam",
    "appdir",
    "home",
    "lang",
];

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
        // kayıt tek satırda birleşir (ölçüldü 2026-09-27, Deck SIGTERM
        // turu). O_APPEND + tek write_all kaydı atomik tutar.
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
        let lower = key.to_lowercase();
        if ENV_ALLOWLIST.iter().any(|prefix| lower.starts_with(prefix)) {
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

/// Flush kapısı: sinyal izleyici `vol:terminate` yayınladıktan sonra JS'in
/// `flush_done` komutunu bekler; süre dolarsa yine çıkar. Kanal tek atımlık
/// değil — sinyal bir kere işlenir, komut takılsa da kayıt düşer.
#[cfg(target_os = "linux")]
struct FlushGate(std::sync::mpsc::Sender<()>);

/// JS tarafı sinyal üzerine bekleyen yazma kuyruklarını boşalttıktan sonra
/// bunu çağırır; izleyici erken çıkar ya da süre sonunda kendisi çıkar.
/// Sinyal izleyici yalnız Linux'ta kurulur — diğer platformlarda no-op'tur
/// ki JS tarafı platform ayırmadan çağırabilsin.
#[tauri::command]
fn flush_done<R: Runtime>(#[allow(unused_variables)] app: AppHandle<R>) {
    #[cfg(target_os = "linux")]
    if let Some(gate) = app.try_state::<FlushGate>() {
        let _ = gate.0.send(());
    }
}

/// Sinyal izleyici: kayda yazar, `vol:terminate` yayınlar, JS'in flush'ını
/// en çok 1.5 sn bekler ve süreci bitirir. Yayın, JS tarafının sinyali
/// gördüğünü kanıtlaması içindir; süre sınırı Steam'in sessiz takılmalarını
/// raporda bırakır.
#[cfg(target_os = "linux")]
fn watch_signals<R: Runtime>(app: AppHandle<R>, dir: PathBuf) {
    use signal_hook::consts::{SIGHUP, SIGINT, SIGTERM, SIGUSR1};
    let Ok(mut signals) = signal_hook::iterator::Signals::new([SIGTERM, SIGINT, SIGHUP, SIGUSR1])
    else {
        return;
    };
    let (sender, receiver) = std::sync::mpsc::channel::<()>();
    app.manage(FlushGate(sender));
    std::thread::spawn(move || {
        for signal in signals.forever() {
            native(&dir, "signal", serde_json::json!({ "signal": signal }));
            let _ = app.emit("vol:terminate", signal);
            let flushed = receiver
                .recv_timeout(std::time::Duration::from_millis(1500))
                .is_ok();
            native(
                &dir,
                "exit-after-grace",
                serde_json::json!({ "signal": signal, "flushed": flushed }),
            );
            std::process::exit(0);
        }
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
    Builder::new("vol-diagnostics")
        .invoke_handler(tauri::generate_handler![report, env_info, flush_done])
        .setup(|app, _api| {
            let dir = diagnostics_dir(app);
            #[cfg(target_os = "linux")]
            {
                native(&dir, "start", serde_json::json!({}));
                watch_signals(app.clone(), dir.clone());
                watch_suspend(dir.clone());
            }
            app.manage(DiagnosticsDir(dir));
            Ok(())
        })
        .build()
}
