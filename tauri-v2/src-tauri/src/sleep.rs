#[cfg(target_os = "linux")]
use crate::flush::{wait_for_flush, FLUSH_GRACE};
use crate::flush::{FlushGate, FlushOutcome, FlushReason};
use std::sync::Mutex;

#[derive(Default)]
pub struct SuspendGate(pub Mutex<FlushGate>);

#[tauri::command]
pub fn vol_suspend_ready(
    gate: tauri::State<'_, SuspendGate>,
    request_id: String,
    reason: FlushReason,
    outcome: FlushOutcome,
) {
    gate.0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .acknowledge(&request_id, reason, outcome);
}

// logind dinleyicisi Linux'a özgüdür; diğer platformlarda karşılığı boş bir
// `watch_sleep` gövdesidir. İşaretlenmezse tip ve dönüştürücü Windows ve macOS
// derlemelerinde kullanılmaz kod olarak kalır.
#[cfg(any(target_os = "linux", test))]
#[derive(Debug, PartialEq, Eq)]
pub enum SleepStep {
    Suspending,
    Resumed,
}

#[cfg(any(target_os = "linux", test))]
pub fn step_of(prepare_for_sleep: bool) -> SleepStep {
    if prepare_for_sleep {
        SleepStep::Suspending
    } else {
        SleepStep::Resumed
    }
}

#[cfg(target_os = "linux")]
fn report_sleep_error<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    operation: &str,
    error: &dbus::Error,
) {
    use tauri::Emitter;
    log::warn!("uyku izleyici {operation} hatası: {error}");
    if let Err(emit_error) = app.emit(
        "vol:sleep-error",
        serde_json::json!({
            "operation": operation, "error": error.to_string(),
        }),
    ) {
        log::warn!("uyku izleyici hatası yayınlanamadı: {emit_error}");
    }
}

#[cfg(target_os = "linux")]
pub fn watch_sleep<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(error) = run_logind_loop(&app) {
            report_sleep_error(&app, "watch", &error);
        }
    });
}

#[cfg(target_os = "linux")]
fn run_logind_loop<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(), dbus::Error> {
    use dbus::blocking::Connection;
    use dbus::message::MatchRule;
    use std::time::{Duration, Instant};
    use tauri::{Emitter, Manager};

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
    let mut sleeping = false;
    loop {
        connection.process(Duration::from_millis(1000))?;
        while let Ok(start) = incoming.try_recv() {
            match step_of(start) {
                SleepStep::Suspending => {
                    if sleeping {
                        continue;
                    }
                    sleeping = true;
                    let gate = app.state::<SuspendGate>();
                    let Some((request, receiver)) = gate
                        .0
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner())
                        .begin(FlushReason::Suspend)
                    else {
                        continue;
                    };
                    let deadline = Instant::now() + FLUSH_GRACE;
                    if let Err(error) = app.emit("vol:suspending", &request) {
                        log::warn!("uyku boşaltma isteği yayınlanamadı: {error}");
                    }
                    let outcome = wait_for_flush(&receiver, deadline);
                    gate.0
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner())
                        .finish(&request.request_id);
                    if outcome == FlushOutcome::Success {
                        log::info!("uyku öncesi boşaltma tamamlandı: {}", request.request_id);
                    } else {
                        log::warn!(
                            "uyku öncesi boşaltma tamamlanamadı: {} {outcome:?}",
                            request.request_id
                        );
                    }
                    lock = None;
                }
                SleepStep::Resumed => {
                    sleeping = false;
                    if let Err(error) = app.emit("vol:resumed", ()) {
                        log::warn!("uyanış olayı yayınlanamadı: {error}");
                    }
                    if lock.is_none() {
                        match inhibit(&connection) {
                            Ok(fd) => lock = Some(fd),
                            Err(error) => report_sleep_error(app, "inhibit", &error),
                        }
                    }
                }
            }
        }
    }
}

#[cfg(not(target_os = "linux"))]
pub fn watch_sleep<R: tauri::Runtime>(_app: &tauri::AppHandle<R>) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logind_sinyali_adima_cevrilir() {
        assert_eq!(step_of(true), SleepStep::Suspending);
        assert_eq!(step_of(false), SleepStep::Resumed);
    }

    #[test]
    fn gec_onay_yeni_uyku_turunu_bitiremez() {
        let gate = SuspendGate::default();
        let mut state = gate.0.lock().unwrap();
        let (first, _) = state.begin(FlushReason::Suspend).unwrap();
        state.finish(&first.request_id);
        let (second, receiver) = state.begin(FlushReason::Suspend).unwrap();
        assert!(!state.acknowledge(
            &first.request_id,
            FlushReason::Suspend,
            FlushOutcome::Success
        ));
        assert!(receiver.try_recv().is_err());
        assert!(state.acknowledge(
            &second.request_id,
            FlushReason::Suspend,
            FlushOutcome::Success
        ));
        assert_eq!(receiver.try_recv().unwrap(), FlushOutcome::Success);
    }
}
