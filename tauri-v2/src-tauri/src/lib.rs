//! VOL.STUDIO'nun PAYLAŞILAN native kabuğu.
//!
//! Bu crate bir uygulama DEĞİLDİR: kendi `tauri.conf.json`u, kimliği, giriş
//! noktası ve üretilmiş native projesi yoktur. Yalnız eklenti kurulumunu ve
//! platform ayarlarını taşır; her oyun kendi uygulama crate'inde bağlamını
//! üretip `run_with_context()` çağırır.
//!
//! Bir dönem bu crate AYNI ZAMANDA VOL.HELL'in uygulamasıydı ve adı taşıdığı
//! vaadi karşılamıyordu: ortak yuva dolu olduğu için sonradan gelen oyunlar
//! kendi kabuklarını kurmak zorunda kaldı. Kimlik artık tüketicinin.

// Tauri komutları hakkında bilgi almak için: https://tauri.app/develop/calling-rust/

/// Ürün içindeki çıkış onayından sonra uygulamayı gerçekten sonlandırır.
///
/// Pencere `close`/`destroy` çağrıları bir pencerenin yaşam döngüsünü yönetir;
/// ürünün "uygulamadan çık" niyeti için uygulama düzeyindeki çağrı masaüstü
/// ve mobilde aynı kesin semantiği sağlar.
#[tauri::command]
fn exit_application(app: tauri::AppHandle) {
    app.exit(0);
}

/// Kabuğu VERİLEN bağlamla çalıştırır.
///
/// `tauri::generate_context!()` çağrıldığı CRATE'in yapılandırmasını ve
/// gömülü ön yüz varlıklarını paketler. Bu yüzden bağlam BURADA üretilemez:
/// paylaşılan kabuk kendi bağlamını üretseydi, onu kütüphane olarak kullanan
/// her uygulama o kabuğun kimliğini, penceresini ve ön yüzünü çalıştırırdı —
/// ölçüldü, cihazda VOL.ARACHNID paketi açılıp VOL.HELL menüsünü gösteriyordu.
///
/// Her uygulama bağlamı kendi crate'inde üretir; ortak olan yalnız eklenti
/// kurulumu ve platform ayarlarıdır.
pub fn run_with_context(context: tauri::Context<tauri::Wry>) {
    #[cfg(target_os = "linux")]
    configure_linux_webview();

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
        .invoke_handler(tauri::generate_handler![exit_application])
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
        .run(context)
        .expect("error while running tauri application");
}

/// Fedora/Wayland üzerindeki bazı WebKitGTK + GBM sürümleri, pencereyi
/// oluşturduğu hâlde ilk compositing buffer'ını ayıramayıp beyaz bir WebView
/// bırakabiliyor. Oyunlar canvas tabanlı olduğu için WebKit'in DMA-BUF
/// renderer'ını kapatmak güvenli yazılım fallback'ine geçer; yalnızca bu
/// değişken dışarıdan verilmemişse uygulanır ve kullanıcının açık tercihi
/// ezilmez. Bu ayar WebView yaratılmadan önce yapılmalıdır.
#[cfg(target_os = "linux")]
fn configure_linux_webview() {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}
