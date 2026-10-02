use crate::flush::{
    wait_for_flush, FlushGate, FlushOutcome, FlushReason, FlushRequest, FLUSH_GRACE,
};
use std::sync::mpsc::Receiver;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

const EXIT_GRACE: Duration = Duration::from_secs(2);

#[derive(Default)]
pub struct ShutdownState {
    gate: FlushGate,
    started: bool,
}

impl ShutdownState {
    fn begin(&mut self, reason: FlushReason) -> Option<(FlushRequest, Receiver<FlushOutcome>)> {
        if self.started {
            return None;
        }
        self.started = true;
        self.gate.begin(reason)
    }
}

#[derive(Default)]
pub struct ShutdownGate(pub Mutex<ShutdownState>);

#[tauri::command]
pub fn vol_flush_done(
    gate: tauri::State<'_, ShutdownGate>,
    request_id: String,
    reason: FlushReason,
    outcome: FlushOutcome,
) {
    gate.0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .gate
        .acknowledge(&request_id, reason, outcome);
}

pub fn request_exit<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    reason: FlushReason,
    signal: Option<i32>,
) {
    let gate = app.state::<ShutdownGate>();
    let Some((request, receiver)) = gate
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .begin(reason)
    else {
        return;
    };
    let deadline = Instant::now() + FLUSH_GRACE;
    let code = signal.map(exit_code).unwrap_or(0);
    std::thread::spawn(move || {
        std::thread::sleep(FLUSH_GRACE + EXIT_GRACE);
        std::process::exit(code);
    });
    let app = app.clone();
    std::thread::spawn(move || {
        let mut packet = serde_json::to_value(&request).expect("boşaltma isteği serileştirilemedi");
        if let Some(signal) = signal {
            packet["signal"] = signal.into();
        }
        if let Err(error) = app.emit("vol:terminate", packet) {
            log::warn!("kapanış boşaltma isteği yayınlanamadı: {error}");
        }
        let outcome = wait_for_flush(&receiver, deadline);
        app.state::<ShutdownGate>()
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .gate
            .finish(&request.request_id);
        let detail = serde_json::json!({
            "requestId": request.request_id, "reason": request.reason,
            "signal": signal, "outcome": outcome,
        });
        if outcome == FlushOutcome::Success {
            log::info!("kapanış boşaltması tamamlandı: {detail}");
        } else {
            log::warn!("kapanış boşaltması tamamlanamadı: {detail}");
        }
        if let Err(error) = app.emit("vol:exiting", detail) {
            log::warn!("kapanış sonucu yayınlanamadı: {error}");
        }
        app.exit(code);
    });
}

pub fn exit_code(signal: i32) -> i32 {
    128 + signal
}

#[cfg(target_os = "linux")]
pub fn watch_signals<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use signal_hook::consts::{SIGHUP, SIGINT, SIGTERM};
    let Ok(mut signals) = signal_hook::iterator::Signals::new([SIGTERM, SIGINT, SIGHUP]) else {
        log::warn!("sinyal izleyici kurulamadı; sinyal kapanışında boşaltma yapılamaz");
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || {
        for signal in signals.forever() {
            request_exit(&app, FlushReason::Signal, Some(signal));
        }
    });
}

#[cfg(not(target_os = "linux"))]
pub fn watch_signals<R: tauri::Runtime>(_app: &tauri::AppHandle<R>) {}

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
    fn kapanis_ve_sinyal_tek_bariyer_ve_tek_cikis_turu_kullanir() {
        let mut state = ShutdownState::default();
        let (request, receiver) = state.begin(FlushReason::Close).unwrap();
        assert!(state.begin(FlushReason::Signal).is_none());
        assert!(state.gate.acknowledge(
            &request.request_id,
            FlushReason::Close,
            FlushOutcome::Success
        ));
        assert_eq!(receiver.try_recv().unwrap(), FlushOutcome::Success);
        state.gate.finish(&request.request_id);
        assert!(state.begin(FlushReason::Close).is_none());
        assert!(state.begin(FlushReason::Signal).is_none());
    }
}
