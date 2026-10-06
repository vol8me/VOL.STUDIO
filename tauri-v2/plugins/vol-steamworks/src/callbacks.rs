//! Callback kayıtları ve tek native klavye oturumunun sahibi.
use std::sync::{Arc, Mutex};
use steamworks::{
    CallbackHandle, Client, FloatingGamepadTextInputDismissed, GameOverlayActivated,
    GamepadTextInputDismissed,
};

#[derive(Debug, PartialEq)]
pub(crate) enum Event {
    Overlay(bool),
    Text {
        request_id: String,
        text: Option<String>,
    },
    Floating {
        request_id: String,
    },
}

pub(crate) fn dispatch_text(
    pending: &Mutex<PendingInput>,
    read: impl FnOnce() -> Option<String>,
    emit: &dyn Fn(Event),
) {
    // SDK metni okunurken yeni show eski tamponu değiştiremez.
    let mut pending = pending.lock().unwrap();
    if let Some(request_id) = pending.finish(InputKind::Text) {
        emit(Event::Text {
            request_id,
            text: read(),
        });
    }
}

pub(crate) fn register_callbacks(
    client: &Client,
    pending: Arc<Mutex<PendingInput>>,
    emit: Arc<dyn Fn(Event) + Send + Sync>,
) -> Vec<CallbackHandle> {
    let overlay_emit = emit.clone();
    let overlay = client.register_callback(move |event: GameOverlayActivated| {
        overlay_emit(Event::Overlay(event.active));
    });
    let text_emit = emit.clone();
    let text_pending = pending.clone();
    let cb_client = client.clone();
    let text = client.register_callback(move |event: GamepadTextInputDismissed| {
        dispatch_text(
            &text_pending,
            || cb_client.utils().get_entered_gamepad_text_input(&event),
            &*text_emit,
        );
    });
    let floating = client.register_callback(move |_: FloatingGamepadTextInputDismissed| {
        let mut pending = pending.lock().unwrap();
        if let Some(request_id) = pending.finish(InputKind::Floating) {
            emit(Event::Floating { request_id });
        }
    });
    vec![overlay, text, floating]
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum InputKind {
    Text,
    Floating,
}

#[derive(Default)]
pub(crate) struct PendingInput(Option<(String, InputKind, bool)>);

impl PendingInput {
    pub(crate) fn begin(&mut self, id: &str, kind: InputKind) -> Result<bool, String> {
        if id.is_empty()
            || id.len() > 128
            || !id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-'))
        {
            return Err("geçersiz metin isteği kimliği".into());
        }
        if self.0.is_some() {
            return Ok(false);
        }
        self.0 = Some((id.into(), kind, false));
        Ok(true)
    }
    pub(crate) fn cancel(&mut self, id: &str) {
        if let Some((active, _, cancelled)) = &mut self.0 {
            if active == id {
                *cancelled = true;
            }
        }
    }
    pub(crate) fn finish(&mut self, kind: InputKind) -> Option<String> {
        if self
            .0
            .as_ref()
            .is_some_and(|(_, active, _)| *active == kind)
        {
            self.0
                .take()
                .and_then(|(id, _, cancelled)| (!cancelled).then_some(id))
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metin_sonucu_istek_kimligini_tasir_iptal_yayinlanmaz() {
        let pending = Mutex::new(PendingInput::default());
        let events = Mutex::new(Vec::new());
        let emit = |event| events.lock().unwrap().push(event);
        pending
            .lock()
            .unwrap()
            .begin("text-1", InputKind::Text)
            .unwrap();
        dispatch_text(&pending, || Some("yeni".into()), &emit);
        assert_eq!(
            *events.lock().unwrap(),
            vec![Event::Text {
                request_id: "text-1".into(),
                text: Some("yeni".into())
            }]
        );
        pending
            .lock()
            .unwrap()
            .begin("text-2", InputKind::Text)
            .unwrap();
        pending.lock().unwrap().cancel("text-2");
        dispatch_text(&pending, || panic!("iptalde SDK metni okunmaz"), &emit);
        assert_eq!(events.lock().unwrap().len(), 1);
        assert!(pending
            .lock()
            .unwrap()
            .begin("text-3", InputKind::Text)
            .unwrap());
        dispatch_text(&pending, || None, &emit);
        assert_eq!(
            events.lock().unwrap().last(),
            Some(&Event::Text {
                request_id: "text-3".into(),
                text: None
            })
        );
    }

    #[test]
    fn iptal_native_popup_bitene_kadar_sahipligi_tutar() {
        let mut pending = PendingInput::default();
        assert!(pending.begin("text-1", InputKind::Text).unwrap());
        pending.cancel("text-1");
        assert!(!pending.begin("text-2", InputKind::Text).unwrap());
        assert_eq!(pending.finish(InputKind::Text), None);
        assert!(pending.begin("text-2", InputKind::Floating).unwrap());
        pending.cancel("text-1");
        assert_eq!(pending.finish(InputKind::Text), None);
        assert_eq!(
            pending.finish(InputKind::Floating).as_deref(),
            Some("text-2")
        );
        assert_eq!(pending.finish(InputKind::Floating), None);
    }

    #[test]
    fn gecersiz_istek_kimligi_native_oturum_acmaz() {
        let mut pending = PendingInput::default();
        for id in ["", "../x", "a.b", "x y", &"x".repeat(129)] {
            assert!(pending.begin(id, InputKind::Text).is_err());
        }
        assert_eq!(pending.finish(InputKind::Text), None);
    }
}
