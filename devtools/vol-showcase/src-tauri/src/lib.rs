#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    volstudio_tauri_lib::run_with_context_and(tauri::generate_context!(), |builder| {
        // Vitrin oyun değildir: Steamworks, ölçüm köprüsü ve ekran yönü kilidi yoktur. Android'de yalnız
        // titreşim eklentisi kurulur: vitrin `observeAndroidHaptics` ile sürücüyü kaydeder ve çekirdeğin
        // haptik yolu cihazda sınanır. Yön eklentisi JS tüketicisi olmadığı için kurulmaz (ölü yüzey).
        #[cfg(target_os = "android")]
        let builder = builder.plugin(tauri_plugin_vol_haptics::init());
        builder
    })
}
