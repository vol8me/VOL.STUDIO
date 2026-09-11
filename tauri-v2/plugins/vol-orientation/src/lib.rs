//! Android ekran yönü köprüsü.
//!
//! WebView'ın `screen.orientation.lock()`u Android'de `NotSupportedError`
//! verir (ölçüldü: SM-G990B2, Android 16, WebView 152); yön ancak Activity
//! üzerinden uygulanabilir. Komutlar JS'ten izinle çağrılır ve Kotlin
//! eklentisine iletilir. Oyun kelimesi bilmez: hangi yönün sunulacağı ve
//! varsayılanın ne olduğu uygulamanın kararıdır.

use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Manager, Runtime,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScreenOrientation {
    Portrait,
    Landscape,
}

/// `user*` telefonun sistem döndürme kilidine uyar; `sensor*` onu yok sayar.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RotationFamily {
    #[default]
    User,
    Sensor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrientationState {
    /// Ekranın o anki yönü — istenen değil, uygulanan.
    pub current: ScreenOrientation,
    pub preferred: Option<ScreenOrientation>,
    /// TV'de ve çoklu pencerede Activity yön isteğini uygulamaz.
    pub supported: bool,
}

#[derive(Debug)]
pub struct Error(String);

impl std::fmt::Display for Error {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for Error {}

impl Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0)
    }
}

#[cfg(target_os = "android")]
#[derive(Serialize)]
struct SetOrientationArgs {
    orientation: ScreenOrientation,
    family: RotationFamily,
}

/// Kotlin eklentisinin tutamacı; masaüstünde komutlar açık bir hata döner.
pub struct Orientation<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: tauri::plugin::PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> Orientation<R> {
    #[cfg(target_os = "android")]
    fn get_state(&self) -> Result<OrientationState, Error> {
        self.handle
            .run_mobile_plugin("getState", ())
            .map_err(|error| Error(error.to_string()))
    }

    #[cfg(target_os = "android")]
    fn set(
        &self,
        orientation: ScreenOrientation,
        family: RotationFamily,
    ) -> Result<OrientationState, Error> {
        self.handle
            .run_mobile_plugin(
                "setOrientation",
                SetOrientationArgs {
                    orientation,
                    family,
                },
            )
            .map_err(|error| Error(error.to_string()))
    }

    #[cfg(not(target_os = "android"))]
    fn get_state(&self) -> Result<OrientationState, Error> {
        Err(unsupported())
    }

    #[cfg(not(target_os = "android"))]
    fn set(
        &self,
        _orientation: ScreenOrientation,
        _family: RotationFamily,
    ) -> Result<OrientationState, Error> {
        Err(unsupported())
    }
}

#[cfg(not(target_os = "android"))]
fn unsupported() -> Error {
    Error("vol-orientation yalnız Android'de uygulanır".into())
}

#[tauri::command]
async fn get_state<R: Runtime>(app: AppHandle<R>) -> Result<OrientationState, Error> {
    app.state::<Orientation<R>>().get_state()
}

#[tauri::command]
async fn set_orientation<R: Runtime>(
    app: AppHandle<R>,
    orientation: ScreenOrientation,
    family: Option<RotationFamily>,
) -> Result<OrientationState, Error> {
    app.state::<Orientation<R>>()
        .set(orientation, family.unwrap_or_default())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("vol-orientation")
        .invoke_handler(tauri::generate_handler![get_state, set_orientation])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let orientation = Orientation {
                handle: api
                    .register_android_plugin("com.volstudio.orientation", "OrientationPlugin")?,
            };
            #[cfg(not(target_os = "android"))]
            let orientation = {
                let _ = api;
                Orientation::<R> {
                    _runtime: std::marker::PhantomData,
                }
            };
            app.manage(orientation);
            Ok(())
        })
        .build()
}
