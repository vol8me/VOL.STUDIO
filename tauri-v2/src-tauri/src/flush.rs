use serde::{Deserialize, Serialize};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::time::{Duration, Instant};

pub const FLUSH_GRACE: Duration = Duration::from_millis(1500);

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FlushReason {
    Close,
    Signal,
    Suspend,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FlushOutcome {
    Success,
    Failed,
    TimedOut,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FlushRequest {
    pub request_id: String,
    pub reason: FlushReason,
}

struct ActiveFlush {
    request: FlushRequest,
    sender: Option<Sender<FlushOutcome>>,
    deadline: Instant,
}

#[derive(Default)]
pub struct FlushGate {
    next: u64,
    active: Option<ActiveFlush>,
}

impl FlushGate {
    pub fn begin(&mut self, reason: FlushReason) -> Option<(FlushRequest, Receiver<FlushOutcome>)> {
        if self.active.is_some() {
            return None;
        }
        self.next = self
            .next
            .checked_add(1)
            .expect("boşaltma tur kimliği tükendi");
        let prefix = if reason == FlushReason::Suspend {
            "suspend"
        } else {
            "shutdown"
        };
        let request = FlushRequest {
            request_id: format!("{prefix}-{}", self.next),
            reason,
        };
        let (sender, receiver) = channel();
        self.active = Some(ActiveFlush {
            request: request.clone(),
            sender: Some(sender),
            deadline: Instant::now() + FLUSH_GRACE,
        });
        Some((request, receiver))
    }

    pub fn acknowledge(
        &mut self,
        request_id: &str,
        reason: FlushReason,
        outcome: FlushOutcome,
    ) -> bool {
        let Some(active) = self.active.as_mut() else {
            return false;
        };
        if active.request.request_id != request_id
            || active.request.reason != reason
            || Instant::now() >= active.deadline
        {
            return false;
        }
        active
            .sender
            .take()
            .is_some_and(|sender| sender.send(outcome).is_ok())
    }

    pub fn finish(&mut self, request_id: &str) {
        if self
            .active
            .as_ref()
            .is_some_and(|active| active.request.request_id == request_id)
        {
            self.active = None;
        }
    }
}

pub fn wait_for_flush(receiver: &Receiver<FlushOutcome>, deadline: Instant) -> FlushOutcome {
    let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
        return FlushOutcome::TimedOut;
    };
    receiver
        .recv_timeout(remaining)
        .unwrap_or(FlushOutcome::TimedOut)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn onay_aktif_kimlik_ve_nedeni_eslestirir_tek_atimlidir() {
        let mut gate = FlushGate::default();
        let (request, receiver) = gate.begin(FlushReason::Close).unwrap();
        assert!(gate.begin(FlushReason::Signal).is_none());
        assert!(!gate.acknowledge("shutdown-2", FlushReason::Close, FlushOutcome::Success));
        assert!(!gate.acknowledge(
            &request.request_id,
            FlushReason::Signal,
            FlushOutcome::Success
        ));
        assert!(receiver.try_recv().is_err());
        assert!(gate.acknowledge(
            &request.request_id,
            FlushReason::Close,
            FlushOutcome::Failed
        ));
        assert!(!gate.acknowledge(
            &request.request_id,
            FlushReason::Close,
            FlushOutcome::Success
        ));
        assert_eq!(receiver.try_recv().unwrap(), FlushOutcome::Failed);
    }

    #[test]
    fn eski_tur_onayi_ve_temizligi_yeni_bariyeri_etkilemez() {
        let mut gate = FlushGate::default();
        let (first, _) = gate.begin(FlushReason::Suspend).unwrap();
        gate.finish(&first.request_id);
        let (second, receiver) = gate.begin(FlushReason::Suspend).unwrap();
        assert_ne!(first.request_id, second.request_id);
        gate.finish(&first.request_id);
        assert!(!gate.acknowledge(
            &first.request_id,
            FlushReason::Suspend,
            FlushOutcome::Success
        ));
        assert!(receiver.try_recv().is_err());
        assert!(gate.acknowledge(
            &second.request_id,
            FlushReason::Suspend,
            FlushOutcome::Success
        ));
        assert_eq!(receiver.try_recv().unwrap(), FlushOutcome::Success);
    }

    #[test]
    fn donmeyen_frontend_native_sure_sinirinda_biter() {
        let (_sender, receiver) = channel();
        let start = Instant::now();
        assert_eq!(
            wait_for_flush(&receiver, start + Duration::from_millis(5)),
            FlushOutcome::TimedOut
        );
        assert!(start.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn sure_sinirindan_sonra_gelen_onay_basarili_sayilmaz() {
        let mut gate = FlushGate::default();
        let (request, receiver) = gate.begin(FlushReason::Close).unwrap();
        gate.active.as_mut().unwrap().deadline = Instant::now();
        assert!(!gate.acknowledge(
            &request.request_id,
            FlushReason::Close,
            FlushOutcome::Success
        ));
        assert_eq!(
            wait_for_flush(&receiver, Instant::now()),
            FlushOutcome::TimedOut
        );
    }

    #[test]
    fn native_packet_frontend_sozlesmesini_tasir() {
        let mut gate = FlushGate::default();
        let (request, _) = gate.begin(FlushReason::Suspend).unwrap();
        assert_eq!(
            serde_json::to_value(request).unwrap(),
            serde_json::json!({ "requestId": "suspend-1", "reason": "suspend" })
        );
        assert_eq!(
            serde_json::to_value(FlushOutcome::TimedOut).unwrap(),
            "timedOut"
        );
    }
}
