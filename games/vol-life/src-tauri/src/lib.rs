//! VOL.LIFE'ın native giriş noktası.
//!
//! Kabuğun kendisi `volstudio-tauri` içinde yaşar; burada yalnız MOBİL giriş
//! noktası tanımlanır. Üretilen Android/iOS projesi bu kütüphanenin adını arar
//! ve iki uygulamanın ayrı paket kimliği olabilmesi için ayrı bir kütüphaneye
//! ihtiyaç vardır — Rust kodu paylaşılır, kimlik paylaşılmaz.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Bağlam BU crate'te üretilir: kimlik, pencere ve gömülü ön yüz buradan
    // gelir. Paylaşılan kabuk ortak eklentileri kurar; ekran yönü köprüsü
    // yalnız bu uygulamaya aittir.
    volstudio_tauri_lib::run_with_context_and(tauri::generate_context!(), |builder| {
        #[cfg(mobile)]
        let builder = builder.plugin(tauri_plugin_haptics::init());
        builder.plugin(tauri_plugin_vol_orientation::init())
    })
}
