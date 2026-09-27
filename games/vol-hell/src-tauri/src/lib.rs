//! VOL.HELL'in native giriş noktası.
//!
//! Kabuğun kendisi `volstudio-tauri` içinde yaşar; burada yalnız MOBİL giriş
//! noktası tanımlanır. Üretilen Android/iOS projesi bu kütüphanenin adını arar
//! ve her uygulamanın ayrı paket kimliği olabilmesi için ayrı bir kütüphaneye
//! ihtiyaç vardır — Rust kodu paylaşılır, kimlik paylaşılmaz.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Bağlam BU crate'te üretilir: kimlik, pencere ve gömülü ön yüz buradan
    // gelir. Paylaşılan kabuk yalnız eklentileri ve platform ayarlarını kurar.
    volstudio_tauri_lib::run_with_context_and(tauri::generate_context!(), |builder| {
        // 480 = Valve'ın ortak geliştirme/test App ID'si (Spacewar). Gerçek
        // Steamworks bağlantısı yalnız `steamworks` feature'ıyla derlenir;
        // stub yapıda eklenti dürüst "kullanılamıyor" bildirir ve manifesto
        // Steam'e hiç ulaşmaz.
        builder
            .plugin(tauri_plugin_vol_diagnostics::init())
            .plugin(tauri_plugin_vol_steamworks::init(
                480,
                Some("steam_input_manifest.vdf"),
            ))
    })
}
