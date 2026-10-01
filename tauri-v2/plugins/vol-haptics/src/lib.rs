#[cfg(target_os = "android")]
mod android {
    use serde::{Deserialize, Serialize};
    use tauri::{
        plugin::{Builder, PluginHandle, TauriPlugin},
        AppHandle, Manager, Runtime,
    };

    #[derive(Debug, Serialize, Deserialize)]
    struct HapticsStatus {
        supported: bool,
    }

    struct Haptics<R: Runtime>(PluginHandle<R>);

    #[derive(Serialize)]
    struct PlayArgs {
        timings: Vec<u64>,
        amplitudes: Vec<u8>,
    }

    #[tauri::command]
    async fn status<R: Runtime>(app: AppHandle<R>) -> Result<HapticsStatus, String> {
        app.state::<Haptics<R>>()
            .0
            .run_mobile_plugin("status", ())
            .map_err(|error| error.to_string())
    }

    #[tauri::command]
    async fn play<R: Runtime>(
        app: AppHandle<R>,
        timings: Vec<u64>,
        amplitudes: Vec<u8>,
    ) -> Result<(), String> {
        app.state::<Haptics<R>>()
            .0
            .run_mobile_plugin(
                "play",
                PlayArgs {
                    timings,
                    amplitudes,
                },
            )
            .map_err(|error| error.to_string())
    }

    #[tauri::command]
    async fn cancel<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
        app.state::<Haptics<R>>()
            .0
            .run_mobile_plugin("cancel", ())
            .map_err(|error| error.to_string())
    }

    pub fn init<R: Runtime>() -> TauriPlugin<R> {
        Builder::new("vol-haptics")
            .invoke_handler(tauri::generate_handler![status, play, cancel])
            .setup(|app, api| {
                app.manage(Haptics(api.register_android_plugin(
                    "com.volstudio.haptics",
                    "HapticsPlugin",
                )?));
                Ok(())
            })
            .build()
    }
}

#[cfg(target_os = "android")]
pub use android::init;

#[cfg(not(target_os = "android"))]
pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("vol-haptics").build()
}
