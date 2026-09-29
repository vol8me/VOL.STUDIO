//! Uyku sözleşmesi (Linux, logind): kabuk bir "delay" uyku kilidi tutar.
//! `PrepareForSleep(true)` gelince ön yüze `vol:suspending` yayınlanır, JS
//! bekleyen yazıları boşaltıp `vol_suspend_ready` çağırır; kabuk en çok
//! `FLUSH_GRACE` bekleyip kilidi bırakır ve sistem uyur. Uyanışta
//! (`PrepareForSleep(false)`) `vol:resumed` yayınlanır ve kilit yeniden alınır.
//! logind'in tanıdığı gecikme sınırı (Deck'te 5 sn) bekleme süresinden büyüktür.

use std::sync::mpsc::{Receiver, Sender};
use std::sync::Mutex;

/// Her uyku turunda JS'in boşaltmayı bitirdiğini bildiren kanal.
pub struct SuspendGate(pub Mutex<Option<Sender<()>>>);

#[tauri::command]
pub fn vol_suspend_ready(gate: tauri::State<'_, SuspendGate>) {
    if let Some(sender) = gate
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .as_ref()
    {
        let _ = sender.send(());
    }
}

/// Uyku olayı ne yapar: kilit bırakılmadan önce boşaltma mı, uyanış mı.
#[derive(Debug, PartialEq, Eq)]
pub enum SleepStep {
    Suspending,
    Resumed,
}

pub fn step_of(prepare_for_sleep: bool) -> SleepStep {
    if prepare_for_sleep {
        SleepStep::Suspending
    } else {
        SleepStep::Resumed
    }
}

/// Önceki turdan kalmış onayları atar; her tur kendi onayını bekler.
pub fn drain(receiver: &Receiver<()>) {
    while receiver.try_recv().is_ok() {}
}

#[cfg(target_os = "linux")]
pub fn watch_sleep<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri::Manager;
    let (sender, receiver) = std::sync::mpsc::channel::<()>();
    app.manage(SuspendGate(Mutex::new(Some(sender))));
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(error) = run_logind_loop(&app, &receiver) {
            log::warn!("uyku izleyici kurulamadı, uykudan önce boşaltma yapılmaz: {error}");
        }
    });
}

#[cfg(target_os = "linux")]
fn run_logind_loop<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    acks: &Receiver<()>,
) -> Result<(), dbus::Error> {
    use dbus::blocking::Connection;
    use dbus::message::MatchRule;
    use std::time::Duration;
    use tauri::Emitter;

    const FLUSH_GRACE: Duration = Duration::from_millis(1500);
    let connection = Connection::new_system()?;
    let inhibit = |connection: &Connection| -> Result<dbus::arg::OwnedFd, dbus::Error> {
        let proxy = connection.with_proxy(
            "org.freedesktop.login1",
            "/org/freedesktop/login1",
            Duration::from_secs(5),
        );
        let (fd,): (dbus::arg::OwnedFd,) = proxy.method_call(
            "org.freedesktop.login1.Manager",
            "Inhibit",
            (
                "sleep",
                "VOL.STUDIO",
                "Uykudan önce kayıt boşaltma",
                "delay",
            ),
        )?;
        Ok(fd)
    };
    let mut lock = Some(inhibit(&connection)?);
    let (events, incoming) = std::sync::mpsc::channel::<bool>();
    connection.add_match(
        MatchRule::new_signal("org.freedesktop.login1.Manager", "PrepareForSleep"),
        move |(start,): (bool,), _, _| {
            let _ = events.send(start);
            true
        },
    )?;
    loop {
        connection.process(Duration::from_millis(1000))?;
        while let Ok(start) = incoming.try_recv() {
            match step_of(start) {
                SleepStep::Suspending => {
                    drain(acks);
                    let _ = app.emit("vol:suspending", ());
                    let flushed = acks.recv_timeout(FLUSH_GRACE).is_ok();
                    log::info!("uyku öncesi boşaltma: {flushed}");
                    lock = None;
                }
                SleepStep::Resumed => {
                    let _ = app.emit("vol:resumed", ());
                    if lock.is_none() {
                        lock = inhibit(&connection).ok();
                    }
                }
            }
        }
    }
}

#[cfg(not(target_os = "linux"))]
pub fn watch_sleep<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri::Manager;
    app.manage(SuspendGate(Mutex::new(None)));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logind_sinyali_adima_cevrilir() {
        assert_eq!(step_of(true), SleepStep::Suspending);
        assert_eq!(step_of(false), SleepStep::Resumed);
    }

    #[test]
    fn eski_onaylar_yeni_turu_erken_bitirmez() {
        let (sender, receiver) = std::sync::mpsc::channel::<()>();
        sender.send(()).unwrap();
        sender.send(()).unwrap();
        drain(&receiver);
        assert!(receiver.try_recv().is_err());
    }
}
