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

/// Pencerenin GERÇEK tam ekran durumu.
///
/// Linux'ta `Window::is_fullscreen()` yalnız uygulamanın kendi `set_fullscreen`
/// isteğini hatırlar (tao 0.35): pencere yöneticisi pencereyi tam ekrana alıp
/// çıkardığında değer değişmez ve ayar yanlış kipte kalır (KDE Plasma'da
/// ölçüldü). Durum bu yüzden GDK'dan okunur. Komut `async`tir: GTK nesnesi
/// yalnız ana iş parçacığında kullanılabilir ve senkron komut ana döngüyü
/// beklerken kilitlenirdi.
#[tauri::command]
async fn window_fullscreen_state(window: tauri::WebviewWindow) -> Result<bool, String> {
    read_fullscreen_state(window)
}

#[cfg(target_os = "linux")]
fn read_fullscreen_state(window: tauri::WebviewWindow) -> Result<bool, String> {
    let (sender, receiver) = std::sync::mpsc::channel();
    let target = window.clone();
    window
        .run_on_main_thread(move || {
            let _ = sender.send(gdk_fullscreen_state(&target));
        })
        .map_err(|error| error.to_string())?;
    receiver.recv().map_err(|error| error.to_string())?
}

#[cfg(target_os = "linux")]
fn gdk_fullscreen_state(window: &tauri::WebviewWindow) -> Result<bool, String> {
    use gtk::prelude::WidgetExt;

    let gtk_window = window.gtk_window().map_err(|error| error.to_string())?;
    match gtk_window.window() {
        Some(surface) => Ok(surface.state().contains(gtk::gdk::WindowState::FULLSCREEN)),
        // Pencere henüz gerçekleşmediyse GDK yüzeyi yoktur; istek durumu doğrudur.
        None => window.is_fullscreen().map_err(|error| error.to_string()),
    }
}

#[cfg(not(target_os = "linux"))]
fn read_fullscreen_state(window: tauri::WebviewWindow) -> Result<bool, String> {
    window.is_fullscreen().map_err(|error| error.to_string())
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
    run_with_context_and(context, |builder| builder)
}

/// `run_with_context` gibi, ama uygulama kendi eklentilerini ekleyebilir.
///
/// Native kaynak taşıyan bir eklenti (ör. Kotlin) yalnız ona DOĞRUDAN bağımlı
/// uygulamanın APK'sına girer. Paylaşılan kabukta herkese kaydedilseydi,
/// bağımlılığı olmayan uygulama Android'de açılışta eklenti sınıfını bulamaz ve
/// çökerdi; kayıt bu yüzden uygulamanın işidir.
pub fn run_with_context_and<F>(context: tauri::Context<tauri::Wry>, configure: F)
where
    F: FnOnce(tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry>,
{
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

    let builder = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            exit_application,
            window_fullscreen_state
        ])
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
        // shell, dialog ve sql plugin'leri kaldirildi: frontend yalnizca store
        // kullaniyor, kullanilmayan eklenti gereksiz saldiri yuzeyi ve binary
        // sismesiydi. Ek native eklenti gereken oyun onu `configure` icinde
        // kendi cagrisinda kaydeder (or. vol-orientation).
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|_app| {
            log::info!("VOL.STUDIO Tauri app starting");
            Ok(())
        });

    // Uygulama kendi eklentilerini ortak kurulumun ÜSTÜNE ekler. Komut
    // işleyicisi burada tanımlıdır: uygulama `invoke_handler` çağırırsa
    // `exit_application` sessizce kaybolur.
    configure(builder)
        .run(context)
        .expect("error while running tauri application");
}

/// WebView'ın çizim yolunu seçer; WebView yaratılmadan ÖNCE çağrılır, değişkenler
/// WebKit alt süreçlerine devralınır. Dışarıdan verilen değişken ezilmez.
///
/// WebKit'in DMA-BUF çizicisi bazı sürücülerde boş WebView bırakıyor; güvenli yol
/// onu kapatmaktır ama o yolda her kare CPU üzerinden kopyalanır. Ölçüldü (NVIDIA
/// RTX 3050 / 610.57, KDE Plasma 6.7, WebKitGTK 2.52, 1920×1080, boş sahne):
/// çizici kapalıyken yerel Wayland'da 18 FPS ve bir çekirdek dolu; açıkken
/// Wayland'da explicit sync protokol hatasıyla açılışta çöküş, XWayland'da boş
/// pencere; açık ve `__NV_DISABLE_EXPLICIT_SYNC=1` ile yerel Wayland'da 60 FPS.
/// Çizici yalnız ölçülen durumda, ekranı tek başına NVIDIA sürücüsünün sürdüğü
/// yerel Wayland oturumunda açık kalır; başka her yerde güvenli yol sürer.
#[cfg(target_os = "linux")]
fn configure_linux_webview() {
    let accelerated = is_native_wayland() && display_is_nvidia_only();
    set_env_default(
        "WEBKIT_DISABLE_DMABUF_RENDERER",
        if accelerated { "0" } else { "1" },
    );
    // Explicit sync yalnız çizici gerçekten açıkken kapatılır; çiziciyi dışarıdan
    // kapatan kullanıcının sürücü ayarına dokunulmaz.
    let dmabuf_enabled =
        std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_ok_and(|value| value == "0");
    if accelerated && dmabuf_enabled {
        set_env_default("__NV_DISABLE_EXPLICIT_SYNC", "1");
    }
}

#[cfg(target_os = "linux")]
fn set_env_default(key: &str, value: &str) {
    if std::env::var_os(key).is_none() {
        std::env::set_var(key, value);
    }
}

/// GTK yerel Wayland arka ucunu seçecek mi: soket var ve `GDK_BACKEND` X11'i öne almıyor.
#[cfg(target_os = "linux")]
fn is_native_wayland() -> bool {
    if std::env::var_os("WAYLAND_DISPLAY").is_none() {
        return false;
    }
    match std::env::var("GDK_BACKEND") {
        Ok(backends) => backends.split(',').next().map(str::trim) != Some("x11"),
        Err(_) => true,
    }
}

/// Bütün DRM kartlarını NVIDIA sürücüsü mü sürüyor? Hibrit dizüstünde ekranı başka
/// bir sürücü sürer; orada ölçülmemiş yol açılmaz.
#[cfg(target_os = "linux")]
fn display_is_nvidia_only() -> bool {
    let Ok(entries) = std::fs::read_dir("/sys/class/drm") else {
        return false;
    };
    let mut drivers = entries
        .flatten()
        .filter(|entry| {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            name.starts_with("card") && !name.contains('-')
        })
        .filter_map(|entry| std::fs::read_link(entry.path().join("device/driver")).ok())
        .filter_map(|driver| {
            driver
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
        })
        .peekable();
    drivers.peek().is_some() && drivers.all(|driver| driver == "nvidia")
}
