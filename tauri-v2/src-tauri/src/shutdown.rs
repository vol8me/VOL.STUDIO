//! Kapanış sözleşmesi: SIGTERM/SIGINT/SIGHUP ön yüze `vol:terminate` olarak
//! iletilir; JS bekleyen yazıları boşaltıp `vol_flush_done` çağırır. Kabuk en
//! çok `FLUSH_GRACE` bekler, `vol:exiting` yayınlar ve uygulamayı olağan çıkış
//! yolundan (RunEvent::Exit) 128+sinyal koduyla kapatır. Olay döngüsü takılırsa
//! süreç `EXIT_GRACE` sonunda doğrudan sonlanır.

use std::sync::mpsc::Sender;
use std::sync::Mutex;

/// JS'in boşaltmayı bitirdiğini bildiren tek atımlık kanal.
pub struct ShutdownGate(pub Mutex<Option<Sender<()>>>);

/// Sinyal gelmeden çağrılırsa (ör. sinyalsiz platform) etkisizdir.
#[tauri::command]
pub fn vol_flush_done(gate: tauri::State<'_, ShutdownGate>) {
    if let Some(sender) = gate
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .take()
    {
        let _ = sender.send(());
    }
}

/// Sinyalden kaynaklanan çıkış kodu (POSIX kabuk sözleşmesi).
pub fn exit_code(signal: i32) -> i32 {
    128 + signal
}

#[cfg(target_os = "linux")]
pub fn watch_signals<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use signal_hook::consts::{SIGHUP, SIGINT, SIGTERM};
    use std::time::Duration;
    use tauri::{Emitter, Manager};

    const FLUSH_GRACE: Duration = Duration::from_millis(1500);
    const EXIT_GRACE: Duration = Duration::from_secs(2);

    let Ok(mut signals) = signal_hook::iterator::Signals::new([SIGTERM, SIGINT, SIGHUP]) else {
        log::warn!("sinyal izleyici kurulamadı; kapanışta boşaltma yapılmaz");
        return;
    };
    let (sender, receiver) = std::sync::mpsc::channel::<()>();
    app.manage(ShutdownGate(Mutex::new(Some(sender))));
    let app = app.clone();
    std::thread::spawn(move || {
        let Some(signal) = signals.forever().next() else {
            return;
        };
        let _ = app.emit("vol:terminate", signal);
        let flushed = receiver.recv_timeout(FLUSH_GRACE).is_ok();
        let _ = app.emit(
            "vol:exiting",
            serde_json::json!({ "signal": signal, "flushed": flushed }),
        );
        let code = exit_code(signal);
        std::thread::spawn(move || {
            std::thread::sleep(EXIT_GRACE);
            std::process::exit(code);
        });
        app.exit(code);
    });
}

/// Sinyal izleyicisi olmayan platformlarda komut yine kayıtlıdır.
#[cfg(not(target_os = "linux"))]
pub fn watch_signals<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri::Manager;
    app.manage(ShutdownGate(Mutex::new(None)));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sinyal_cikis_kodu_posix_sozlesmesine_uyar() {
        assert_eq!(exit_code(15), 143);
        assert_eq!(exit_code(2), 130);
        assert_eq!(exit_code(1), 129);
    }

    #[test]
    fn kapi_tek_atimliktir() {
        let (sender, receiver) = std::sync::mpsc::channel::<()>();
        let gate = ShutdownGate(Mutex::new(Some(sender)));
        let take = || gate.0.lock().unwrap().take();
        assert!(take().map(|s| s.send(())).is_some());
        assert!(take().is_none());
        assert!(receiver.try_recv().is_ok());
    }
}
