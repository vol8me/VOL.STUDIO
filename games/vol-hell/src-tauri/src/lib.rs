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
    volstudio_tauri_lib::run_with_context(tauri::generate_context!())
}
