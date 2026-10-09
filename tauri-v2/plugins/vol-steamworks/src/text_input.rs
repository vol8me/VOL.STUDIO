//! Native klavye kipi. IPC yalnız normal ve parola kipini kabul eder; bir
//! parola alanı düz metin kipine düşerse gizlenmiş metin OSK'nın ekranında
//! ve tarayıcı klavyesinin önizlemesinde okunur hâle gelir.

use serde::Deserialize;

/// IPC yalnız bu iki kipi kabul eder; parola düz metin kipine düşemez.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TextInputMode {
    Normal,
    Password,
}

#[cfg(feature = "steamworks")]
impl From<TextInputMode> for steamworks::GamepadTextInputMode {
    fn from(mode: TextInputMode) -> Self {
        match mode {
            TextInputMode::Normal => Self::Normal,
            TextInputMode::Password => Self::Password,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::de::value::{Error, StrDeserializer};

    #[test]
    fn native_klavye_kipi_yalniz_normal_ve_password_kabul_eder() {
        for (wire, expected) in [
            ("normal", TextInputMode::Normal),
            ("password", TextInputMode::Password),
        ] {
            assert_eq!(
                TextInputMode::deserialize(StrDeserializer::<Error>::new(wire)).unwrap(),
                expected
            );
        }
        for wire in ["", "Password", "default", "search", "other"] {
            assert!(TextInputMode::deserialize(StrDeserializer::<Error>::new(wire)).is_err());
        }
    }

    #[cfg(feature = "steamworks")]
    #[test]
    fn parola_kipi_sdk_maskesini_korur() {
        use steamworks::sys::EGamepadTextInputMode;
        for (mode, expected) in [
            (
                TextInputMode::Normal,
                EGamepadTextInputMode::k_EGamepadTextInputModeNormal,
            ),
            (
                TextInputMode::Password,
                EGamepadTextInputMode::k_EGamepadTextInputModePassword,
            ),
        ] {
            let actual: EGamepadTextInputMode = steamworks::GamepadTextInputMode::from(mode).into();
            assert_eq!(actual, expected);
        }
    }
}
