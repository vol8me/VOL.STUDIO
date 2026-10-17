//! vol-deck-probe — Deck'te cihaz gerçeklerini ölçen sonda.
//!
//! Paylaşılan kabuğun (`volstudio-tauri`) ilk aktif tüketicisidir: oyunlar
//! donmuşken platform değişiklikleri (çizim kuralı, eklenti kurulumu) bu
//! uygulamada uçtan uca sınanır. `configure` geri çağrısı yalnızca
//! diagnostics eklentisini ekler — eklenti kaydı uygulamanın işidir
//! (bkz. `run_with_context_and`).

// Release modunda Windows'ta ek konsol penceresi açılmasını engeller. KALDIRMAYIN!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Bağlam BU crate'te üretilir: kimlik, pencere ve gömülü ön yüz buradan
    // gelir; paylaşılan kabuk eklenti kurulumunu ve platform ayarlarını kurar.
    volstudio_tauri_lib::run_with_context_and(tauri::generate_context!(), |builder| {
        builder
            .plugin(tauri_plugin_vol_diagnostics::init())
            // 480 = Valve'ın ortak geliştirme/test App ID'si (Spacewar).
            // Gerçek Steamworks bağlantısı yalnız `steamworks` feature'ıyla
            // derlenir; stub yapıda eklenti dürüst "kapalı" bildirir.
            .plugin(tauri_plugin_vol_steamworks::init(
                480,
                Some("steam_input_manifest.vdf"),
            ))
    })
}
