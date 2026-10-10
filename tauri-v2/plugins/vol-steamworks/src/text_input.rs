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

/// Kayan klavye düzeni. IPC yalnız tek ve çok satırı kabul eder; e-posta/sayısal
/// düzenler alan türü sözleşmesi olmadan açılmaz.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FloatingInputMode {
    SingleLine,
    MultiLine,
}

#[cfg(feature = "steamworks")]
impl From<FloatingInputMode> for steamworks::FloatingGamepadTextInputMode {
    fn from(mode: FloatingInputMode) -> Self {
        match mode {
            FloatingInputMode::SingleLine => Self::SingleLine,
            FloatingInputMode::MultiLine => Self::MultipleLines,
        }
    }
}

/// Kayan klavyenin kaçınacağı alan dikdörtgeni pencere pikselindedir. Konum negatif
/// olabilir (kısmen kaydırılmış alan); sıfır ya da negatif boyut Steam'e geçersiz
/// bölge verir ve IPC sınırında reddedilir.
pub fn validated_floating_rect(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(i32, i32, i32, i32), String> {
    if width <= 0 || height <= 0 {
        return Err("kayan klavye alanı geçersiz".into());
    }
    Ok((x, y, width, height))
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

    #[test]
    fn kayan_klavye_kipi_yalniz_tek_ve_cok_satiri_kabul_eder() {
        for (wire, expected) in [
            ("singleLine", FloatingInputMode::SingleLine),
            ("multiLine", FloatingInputMode::MultiLine),
        ] {
            assert_eq!(
                FloatingInputMode::deserialize(StrDeserializer::<Error>::new(wire)).unwrap(),
                expected
            );
        }
        for wire in [
            "",
            "singleline",
            "SingleLine",
            "email",
            "numeric",
            "multipleLines",
        ] {
            assert!(FloatingInputMode::deserialize(StrDeserializer::<Error>::new(wire)).is_err());
        }
    }

    #[test]
    fn kayan_klavye_alani_pozitif_boyut_ister_konum_negatif_olabilir() {
        assert_eq!(validated_floating_rect(0, 0, 1, 1), Ok((0, 0, 1, 1)));
        assert_eq!(
            validated_floating_rect(-8, -2, 40, 20),
            Ok((-8, -2, 40, 20))
        );
        assert_eq!(
            validated_floating_rect(10, 20, 300, 40),
            Ok((10, 20, 300, 40))
        );
        for (x, y, w, h) in [(0, 0, 0, 10), (0, 0, 10, 0), (0, 0, -5, 10), (5, 5, 10, -1)] {
            assert!(validated_floating_rect(x, y, w, h).is_err());
        }
    }

    #[cfg(feature = "steamworks")]
    #[test]
    fn kayan_klavye_kipi_sdk_duzenini_korur() {
        use steamworks::sys::EFloatingGamepadTextInputMode as Sdk;
        for (mode, expected) in [
            (
                FloatingInputMode::SingleLine,
                Sdk::k_EFloatingGamepadTextInputModeModeSingleLine,
            ),
            (
                FloatingInputMode::MultiLine,
                Sdk::k_EFloatingGamepadTextInputModeModeMultipleLines,
            ),
        ] {
            let actual: Sdk = steamworks::FloatingGamepadTextInputMode::from(mode).into();
            assert_eq!(actual, expected);
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
