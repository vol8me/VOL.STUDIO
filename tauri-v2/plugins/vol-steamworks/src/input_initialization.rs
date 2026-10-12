//! Steam Input başlatma reddi manifesto yan etkisi ve hazır durum üretemez.

#[cfg_attr(not(feature = "steamworks"), allow(dead_code))]
pub(crate) fn initialize_input(
    initialize: impl FnOnce() -> bool,
    apply_manifest: impl FnOnce() -> Option<bool>,
) -> (bool, Option<bool>) {
    let ready = initialize();
    (ready, if ready { apply_manifest() } else { None })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejected_sdk_input_init_skips_manifest_and_readiness() {
        let mut manifest_called = false;
        let result = initialize_input(
            || false,
            || {
                manifest_called = true;
                Some(true)
            },
        );
        assert_eq!(result, (false, None));
        assert!(!manifest_called);
    }

    #[test]
    fn successful_sdk_input_init_preserves_manifest_rejection() {
        assert_eq!(
            initialize_input(|| true, || Some(false)),
            (true, Some(false))
        );
        assert_eq!(initialize_input(|| true, || None), (true, None));
    }
}
