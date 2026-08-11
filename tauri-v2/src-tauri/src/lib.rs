// Tauri komutları hakkında bilgi almak için: https://tauri.app/develop/calling-rust/

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // rustls, bazı hedeflerde açıkça bir crypto provider ister.
    // Eğer bir provider zaten kuruluysa, `install_default` hata döner;
    // bir uyarı logla ve devam et.
    if rustls::crypto::ring::default_provider()
        .install_default()
        .is_err()
    {
        log::warn!("rustls crypto provider was already installed or could not be set");
    }

    tauri::Builder::default()
        // Log seviyesi acikca sinirlanir; varsayilan builder release build'de de
        // her seviyeyi yazar.
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .build(),
        )
        // shell ve dialog plugin'leri kaldirildi: frontend yalnizca store ve sql
        // kullaniyor, ikisi de gereksiz saldiri yuzeyi ve binary sismesiydi.
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|_app| {
            log::info!("VOL.STUDIO Tauri app starting");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
