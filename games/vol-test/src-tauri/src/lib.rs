#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    volstudio_tauri_lib::run_with_context_and(tauri::generate_context!(), |builder| {
        #[cfg(target_os = "android")]
        let builder = builder
            .plugin(tauri_plugin_vol_orientation::init())
            .plugin(tauri_plugin_vol_haptics::init());
        builder
            .plugin(tauri_plugin_vol_diagnostics::init_for_measurement())
            .plugin(tauri_plugin_vol_steamworks::init(
                480,
                Some("steam_input_manifest.vdf"),
            ))
    })
}
