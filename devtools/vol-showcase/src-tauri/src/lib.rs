#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    volstudio_tauri_lib::run_with_context_and(tauri::generate_context!(), |builder| {
        // Vitrin oyun değildir: Steamworks ve ölçüm köprüsü yoktur. Android'de yön ve
        // titreşim eklentileri, çekirdeğin dokunma/haptik yollarının cihazda sınanması içindir.
        #[cfg(target_os = "android")]
        let builder = builder
            .plugin(tauri_plugin_vol_orientation::init())
            .plugin(tauri_plugin_vol_haptics::init());
        builder
    })
}
