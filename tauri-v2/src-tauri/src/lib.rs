//! VOL.STUDIO'nun PAYLAŞILAN native kabuğu.
//!
//! Bu crate bir uygulama DEĞİLDİR: kendi `tauri.conf.json`u, kimliği, giriş
//! noktası ve üretilmiş native projesi yoktur. Yalnız eklenti kurulumunu ve
//! platform ayarlarını taşır; her oyun kendi uygulama crate'inde bağlamını
//! üretip `run_with_context()` çağırır.

// Tauri komutları hakkında bilgi almak için: https://tauri.app/develop/calling-rust/

/// Ürün içindeki çıkış onayından sonra uygulamayı gerçekten sonlandırır.
///
/// Pencere `close`/`destroy` çağrıları bir pencerenin yaşam döngüsünü yönetir;
/// ürünün "uygulamadan çık" niyeti için uygulama düzeyindeki çağrı masaüstü
/// ve mobilde aynı kesin semantiği sağlar.
#[tauri::command]
fn exit_application(app: tauri::AppHandle) {
    stop_haptics();
    app.exit(0);
}

fn stop_haptics() {
    if let Err(error) = haptics::halt() {
        log::warn!("Haptik durdurulamadı: {error}");
    }
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

/// Oturum sınıfı JS'e yetenek olarak bildirilir: ön yüz gamescope'ta
/// işe yaramayan pencere/çözünürlük ayarlarını gizler ve kol öncelikli
/// oturumda (gamescope, masaüstünde Steam Big Picture) kol kipiyle başlar.
#[tauri::command]
fn session_kind() -> &'static str {
    classify_session(
        is_gamescope_session(),
        std::env::var("SteamGamepadUI").ok().as_deref(),
        std::env::var("SteamTenfoot").ok().as_deref(),
    )
}

/// Saf sınıflama: gamescope > Big Picture (Steam'in koyduğu değişkenler) > masaüstü.
fn classify_session(
    gamescope: bool,
    gamepad_ui: Option<&str>,
    tenfoot: Option<&str>,
) -> &'static str {
    if gamescope {
        "gamescope"
    } else if gamepad_ui == Some("1") || tenfoot == Some("1") {
        "bigpicture"
    } else {
        "desktop"
    }
}

#[cfg(target_os = "linux")]
fn is_gamescope_session() -> bool {
    matches!(LinuxSession::detect(), LinuxSession::Gamescope)
}

#[cfg(not(target_os = "linux"))]
fn is_gamescope_session() -> bool {
    false
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
/// her uygulama o kabuğun kimliğini, penceresini ve ön yüzünü çalıştırırdı.
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
        .on_window_event(|_window, event| {
            if matches!(
                event,
                tauri::WindowEvent::Focused(false) | tauri::WindowEvent::Destroyed
            ) {
                stop_haptics();
            }
        })
        .invoke_handler(tauri::generate_handler![
            exit_application,
            window_fullscreen_state,
            session_kind,
            shutdown::vol_flush_done,
            sleep::vol_suspend_ready,
            store::vol_store_read,
            store::vol_store_write,
            haptics::vol_haptics_status,
            haptics::vol_haptics_rumble,
            haptics::vol_haptics_stop
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
        // Ek native eklenti gereken uygulama onu `configure` icinde kendi
        // cagrisinda kaydeder (or. vol-orientation).
        // Yerel WebView menusu (sag tik / uzun bas / surukleme hayaleti)
        // her webview'a sayfa yuklenmeden once enjekte edilir; yeni oyun
        // bunu kendiliginden alir (bkz. native_menus.rs).
        .plugin(native_menus::plugin())
        .setup(|app| {
            shutdown::watch_signals(app.handle());
            sleep::watch_sleep(app.handle());
            #[cfg(target_os = "linux")]
            // gamescope çıktıyı tam ekran sunar; pencere etiketi uygulamanındır.
            if is_gamescope() {
                use tauri::Manager;
                for window in app.webview_windows().values() {
                    window.set_fullscreen(true)?;
                }
            }
            log::info!("VOL.STUDIO Tauri app starting");
            Ok(())
        });

    // Uygulama kendi eklentilerini ortak kurulumun ÜSTÜNE ekler. Komut
    // işleyicisi burada tanımlıdır: uygulama `invoke_handler` çağırırsa
    // `exit_application` sessizce kaybolur.
    configure(builder)
        .build(context)
        .expect("error while building tauri application")
        .run(|_app, event| {
            if matches!(
                event,
                tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
            ) {
                stop_haptics();
            }
        });
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
///
/// Gamescope ölçüldü (Steam Deck LCD / Jupiter, SteamOS 3.8.16, SLR4
/// 4.0.20260805.254769, WebKitGTK 2.52.6, 1280×800, 4000 sprite): DMA-BUF
/// kapalıyken 49.9 FPS / p95 21 ms; açık + `WEBKIT_FORCE_VBLANK_TIMER=1`
/// iken 59.6 FPS / p95 19 ms. Gamescope'ta compositor vsync'i WebKit'e
/// ulaşmadığı için zamanlayıcı şarttır — yalnız DMA-BUF açmak yetmez
/// (aynı turda 50.0/21 ölçüldü).
///
/// Çizici yalnız ölçülen iki durumda açık kalır: gamescope oturumu ve
/// NVIDIA'nın tek başına sürdüğü yerel Wayland; başka her yerde güvenli yol.
mod haptics;
mod native_menus;
mod shutdown;
mod sleep;
mod store;

#[cfg(target_os = "linux")]
fn configure_linux_webview() {
    let plan = linux_webview_plan(LinuxSession::detect());
    set_env_default("WEBKIT_DISABLE_DMABUF_RENDERER", plan.dmabuf_disable);
    if let Some(value) = plan.vblank_timer {
        set_env_default("WEBKIT_FORCE_VBLANK_TIMER", value);
    }
    // Explicit sync yalnız çizici gerçekten açıkken kapatılır; çiziciyi dışarıdan
    // kapatan kullanıcının sürücü ayarına dokunulmaz.
    let dmabuf_enabled =
        std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_ok_and(|value| value == "0");
    if plan.nv_explicit_sync_off && dmabuf_enabled {
        set_env_default("__NV_DISABLE_EXPLICIT_SYNC", "1");
    }
}

/// Linux oturum sınıfı — karar tablosunun girdisi ve JS'e bildirilen yetenek.
#[cfg(target_os = "linux")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum LinuxSession {
    /// Steam gamescope oturumu (Deck oyun kipi, Steam'in kompozitörü).
    Gamescope,
    /// Yerel Wayland, ekranı tek başına NVIDIA sürücüsü sürüyor.
    NvidiaWayland,
    /// Diğer her şey: X11, Wayland+Intel/AMD masaüstü, hibrit.
    Other,
}

#[cfg(target_os = "linux")]
impl LinuxSession {
    fn detect() -> Self {
        if is_gamescope() {
            Self::Gamescope
        } else if is_native_wayland() && display_is_nvidia_only() {
            Self::NvidiaWayland
        } else {
            Self::Other
        }
    }
}

/// Gamescope oturumu: SLR4 oyun kabı gamescope soketini ve istatistik
/// borusunu ortama koyar (2026-09-27 Deck env dökümünde ikisi de vardı).
/// `SteamDeck=1` tek başına yeterli değildir: masaüstü kipinde de durur.
#[cfg(target_os = "linux")]
fn is_gamescope() -> bool {
    std::env::var_os("GAMESCOPE_WAYLAND_DISPLAY").is_some()
        || std::env::var_os("GAMESCOPE_STATS").is_some()
}

/// Çizim kuralının saf tablosu — oturumdan ortam kararlarına. Birim testi
/// bunu sınar; `configure_linux_webview` yalnız uygular.
#[cfg(target_os = "linux")]
fn linux_webview_plan(session: LinuxSession) -> LinuxWebviewPlan {
    match session {
        LinuxSession::Gamescope => LinuxWebviewPlan {
            dmabuf_disable: "0",
            vblank_timer: Some("1"),
            nv_explicit_sync_off: false,
        },
        LinuxSession::NvidiaWayland => LinuxWebviewPlan {
            dmabuf_disable: "0",
            vblank_timer: None,
            nv_explicit_sync_off: true,
        },
        LinuxSession::Other => LinuxWebviewPlan {
            dmabuf_disable: "1",
            vblank_timer: None,
            nv_explicit_sync_off: false,
        },
    }
}

#[cfg(target_os = "linux")]
struct LinuxWebviewPlan {
    /// `WEBKIT_DISABLE_DMABUF_RENDERER` değeri: "0" çizici açık.
    dmabuf_disable: &'static str,
    /// `WEBKIT_FORCE_VBLANK_TIMER` — yalnız gamescope'ta verilir.
    vblank_timer: Option<&'static str>,
    /// `__NV_DISABLE_EXPLICIT_SYNC=1` — yalnız NVIDIA Wayland ölçüm yolu.
    nv_explicit_sync_off: bool,
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

#[cfg(all(test, target_os = "linux"))]
mod tests {

    #[test]
    fn oturum_siniflamasi_gamescope_big_picture_ve_masaustunu_ayirir() {
        assert_eq!(super::classify_session(true, Some("1"), None), "gamescope");
        assert_eq!(
            super::classify_session(false, Some("1"), None),
            "bigpicture"
        );
        assert_eq!(
            super::classify_session(false, None, Some("1")),
            "bigpicture"
        );
        assert_eq!(super::classify_session(false, Some("0"), None), "desktop");
        assert_eq!(super::classify_session(false, None, None), "desktop");
    }
    use super::{linux_webview_plan, LinuxSession};

    #[test]
    fn gamescope_cizici_acik_vblank_zorunlu() {
        let plan = linux_webview_plan(LinuxSession::Gamescope);
        assert_eq!(plan.dmabuf_disable, "0");
        assert_eq!(plan.vblank_timer, Some("1"));
        assert!(!plan.nv_explicit_sync_off);
    }

    #[test]
    fn nvidia_wayland_kurali_korunur() {
        let plan = linux_webview_plan(LinuxSession::NvidiaWayland);
        assert_eq!(plan.dmabuf_disable, "0");
        assert_eq!(plan.vblank_timer, None);
        assert!(plan.nv_explicit_sync_off);
    }

    #[test]
    fn diger_oturumlar_guvenli_yolda_kalir() {
        let plan = linux_webview_plan(LinuxSession::Other);
        assert_eq!(plan.dmabuf_disable, "1");
        assert_eq!(plan.vblank_timer, None);
        assert!(!plan.nv_explicit_sync_off);
    }
}
