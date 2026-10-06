//! Eklentinin Steamworks yönü. `steamworks` feature'ı kapalıyken tüm
//! yüzey dürüst bir "derlenmedi" yanıtı döner — komutlar kayıtlı kalır ki
//! aynı yetki/capability tanımı iki yapılandırmada da geçerlidir.
//!
//! Gerçek impl `imp` modülündedir ve yalnız feature açıkken derlenir.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// `steamworks` feature'ı ile derlendi mi — derlenmediyse diğer alanlar
    /// hiçbir zaman dolmaz.
    pub compiled: bool,
    /// Steam istemcisine bağlanıldı mı (init başarılı).
    pub available: bool,
    /// `init_app` ile kullanılan App ID (geliştirme için 480).
    pub app_id: Option<u32>,
    /// `ISteamUtils::IsSteamRunningOnSteamDeck`.
    pub deck: bool,
    /// `ISteamUtils::IsSteamInBigPictureMode`.
    pub big_picture: bool,
    /// `ISteamUtils::IsOverlayEnabled` — devkit lansmanında overlay
    /// takılı olmayabilir; o zaman metin girişi diyaloğu da açılamaz.
    pub overlay_enabled: bool,
    /// `IRemoteStorage::IsCloudEnabledForApp` — hesap ayarından bağımsız.
    pub cloud_enabled: Option<bool>,
    /// `ISteamInput::Init` başarısı — manifesto/aksiyon seti çağrılarının
    /// anlamlı olması için gerekir.
    pub input_ready: bool,
    /// `init`'e manifest verildiyse `SetInputActionManifestFilePath`'in
    /// dönüşü; verilmediyse `null`. Steam'in reddi burada görünür kalır.
    pub manifest_ok: Option<bool>,
    /// Init hatası; başarılıysa `null`. Bağlantısız çalışma sessizce
    /// yutmaz: neden görünür kalır.
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControllerInfo {
    /// `InputHandle_t` — ham sayı olarak; JS yalnız teşhis için okur.
    pub handle: u64,
    /// `core`'un `resolveGlyphFamily` çözümleyicisinin beklediği ad
    /// (`'steamdeck'`, `'ps5'`, `'xboxone'` …).
    pub steamworks_type: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlyphOrigin {
    /// `GetStringForActionOrigin` ile yerelleşmiş eylem adı.
    pub name: String,
    /// Glif PNG'sinin base64 gövdesi — dosya Steam istemcisi dizininden
    /// okunur; okunamadıysa `null`.
    pub png_base64: Option<String>,
}

/// İlk bağlı kolun aksiyon durumu; kol yoksa listeler boştur.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ActionState {
    pub digital: Vec<DigitalAction>,
    pub analog: Vec<AnalogAction>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DigitalAction {
    pub name: String,
    pub pressed: bool,
    /// Aksiyon etkin sette bağlı mı.
    pub active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalogAction {
    pub name: String,
    pub x: f32,
    pub y: f32,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudFileInfo {
    pub name: String,
    pub size: u64,
}

/// Aksiyon/manifesto adları Steamworks tarafında düz dizedir; yolu ve
/// istemci belleğini korumak için dar ASCII alfabesi dayatılır.
#[cfg_attr(not(feature = "steamworks"), allow(dead_code))]
fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.'))
}

/// Bulut adı, aksiyon adından daha dardır: noktayla başlayamaz. Aksiyon
/// kuralı `..` ve `.vdf` gibi adlara izin verir; bulutta bu adların tek
/// anlamı yok ve yazıcının kendi dosyalarıyla karışır.
#[cfg_attr(not(feature = "steamworks"), allow(dead_code))]
fn valid_cloud_name(name: &str) -> bool {
    valid_name(name) && !name.starts_with('.')
}

/// Bulut dosyası tavanı. Steam'in tek dosya sınırının altında kalır ve bu
/// kabuğun taşıması beklenen kayıt büyüklüğünü aşan isteği, uzak sunucuya
/// gitmeden reddeder. Sınır yazılan bayta uygulanır, base64 sarmalayıcısına
/// değil: sarmalayıcı çözülmeden bayt sayısı bilinmez.
#[cfg_attr(not(feature = "steamworks"), allow(dead_code))]
const MAX_CLOUD_BYTES: usize = 1024 * 1024;

#[cfg_attr(not(feature = "steamworks"), allow(dead_code))]
fn validated_cloud_name(name: &str) -> Result<&str, String> {
    if valid_cloud_name(name) {
        Ok(name)
    } else {
        Err(format!("geçersiz bulut dosyası adı: {name:?}"))
    }
}

pub(crate) mod imp {
    #[cfg(feature = "steamworks")]
    pub use real::*;

    #[cfg(not(feature = "steamworks"))]
    pub use stub::*;

    use super::*;

    #[cfg(feature = "steamworks")]
    mod real {
        use super::*;
        use crate::callbacks::{register_callbacks, Event, InputKind, PendingInput};
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::{Arc, Mutex};
        use std::time::Duration;
        use steamworks::{
            CallbackHandle, Client, FloatingGamepadTextInputMode, GamepadTextInputLineMode,
            GamepadTextInputMode, InputType,
        };
        use tauri::{AppHandle, Emitter, Runtime};

        /// Metin girişi sonucu JS'e bu olayla döner; `submitted` false ise
        /// kullanıcı iptal etti demektir.
        pub const TEXT_INPUT_EVENT: &str = "vol-steamworks:text-input";
        /// Kayan klavye metni doğrudan odaklı alana yazar; kapanış bu
        /// olayla bildirilir.
        pub const FLOATING_DISMISSED_EVENT: &str = "vol-steamworks:floating-dismissed";
        /// Overlay açılma/kapanma — oyun duraklatma kararını kendi verir.
        pub const OVERLAY_EVENT: &str = "vol-steamworks:overlay";

        /// Steamworks istemcisi. `Client` `Send + Sync`'tir; tek sahiplik
        /// noktası yok ama `run_callbacks` sık çağrılmalı — arka planda bir
        /// pompa iş parçacığı bunu üstlenir.
        pub struct Service<R: Runtime> {
            app: AppHandle<R>,
            state: Mutex<State>,
            closed: AtomicBool,
            /// Bağlantı hedefi ve son deneme; Steam geç açılırsa yeniden denenir.
            retry: Mutex<Option<Retry>>,
        }

        struct Retry {
            app_id: u32,
            manifest: Option<String>,
            last_attempt: std::time::Instant,
        }

        /// Başarısız bağlantı en erken bu aralıkla yeniden denenir.
        const RETRY_INTERVAL: Duration = Duration::from_secs(5);

        enum State {
            /// Hiç denenmedi veya son deneme başarısız — neden saklanır.
            Down { error: String },
            Up {
                session: Session,
                manifest_ok: Option<bool>,
            },
        }

        struct Session {
            // Pompa durup join edildikten sonra kayıtlar, en son istemci düşer.
            callbacks: Vec<CallbackHandle>,
            client: Client,
            pending: Arc<Mutex<PendingInput>>,
            stop: Arc<AtomicBool>,
            pump: Option<std::thread::JoinHandle<()>>,
        }

        impl Drop for Session {
            fn drop(&mut self) {
                self.stop.store(true, Ordering::Release);
                if let Some(pump) = self.pump.take() {
                    let _ = pump.join();
                }
                self.callbacks.clear();
            }
        }

        #[derive(Clone, Serialize)]
        #[serde(rename_all = "camelCase")]
        struct TextInputPayload {
            request_id: String,
            submitted: bool,
            text: Option<String>,
        }

        #[derive(Clone, Serialize)]
        #[serde(rename_all = "camelCase")]
        struct FloatingPayload {
            request_id: String,
        }

        #[derive(Clone, Serialize)]
        #[serde(rename_all = "camelCase")]
        struct OverlayPayload {
            active: bool,
        }

        impl<R: Runtime> Service<R> {
            pub fn new(app: AppHandle<R>) -> Self {
                Self {
                    app,
                    state: Mutex::new(State::Down {
                        error: "steamworks henüz başlatılmadı".into(),
                    }),
                    closed: AtomicBool::new(false),
                    retry: Mutex::new(None),
                }
            }

            /// Bağlantı düşükse ve son denemeden beri `RETRY_INTERVAL` geçtiyse
            /// yeniden bağlanır.
            fn ensure_connected(&self) {
                if matches!(&*self.state.lock().unwrap(), State::Up { .. }) {
                    return;
                }
                let target = {
                    let mut retry = self.retry.lock().unwrap();
                    match retry.as_mut() {
                        Some(r) if r.last_attempt.elapsed() >= RETRY_INTERVAL => {
                            r.last_attempt = std::time::Instant::now();
                            Some((r.app_id, r.manifest.clone()))
                        }
                        _ => None,
                    }
                };
                if let Some((app_id, manifest)) = target {
                    self.attempt(app_id, manifest);
                }
            }

            /// `Client::init_app` — App ID'yi env'e de yazar; `steam_appid.txt`
            /// dosyasına gerek kalmaz. Başarısızsa neden `status`ta görünür
            /// kalır ve sonraki çağrı yeniden dener.
            ///
            /// `manifest` verildiyse `SetInputActionManifestFilePath` pompa
            /// başlamadan (ilk `RunFrame` koşmadan) çağrılır — sonrası
            /// için API `false` döndürebilir.
            pub fn connect(&self, app_id: u32, manifest: Option<String>) {
                *self.retry.lock().unwrap() = Some(Retry {
                    app_id,
                    manifest: manifest.clone(),
                    last_attempt: std::time::Instant::now(),
                });
                self.attempt(app_id, manifest);
            }

            fn attempt(&self, app_id: u32, manifest: Option<String>) {
                let mut state = self.state.lock().unwrap();
                // Aynı SDK bağlamında ikinci init/pompa veya aynı ID için ikinci
                // callback kaydı açılamaz. Bağlı oturum tekrar connect ile değişmez.
                if self.closed.load(Ordering::Acquire) || matches!(&*state, State::Up { .. }) {
                    return;
                }
                match Client::init_app(app_id) {
                    Ok(client) => {
                        client.input().init(false);
                        let manifest_ok = manifest
                            .map(|path| client.input().set_input_action_manifest_file_path(&path));
                        let pending = Arc::new(Mutex::new(PendingInput::default()));
                        let callbacks = self.register_callbacks(&client, pending.clone());
                        let stop = Arc::new(AtomicBool::new(false));
                        let pump = Self::spawn_pump(client.clone(), stop.clone());
                        *state = State::Up {
                            session: Session {
                                callbacks,
                                client,
                                pending,
                                stop,
                                pump: Some(pump),
                            },
                            manifest_ok,
                        };
                    }
                    Err(error) => {
                        *state = State::Down {
                            error: format!("steamworks init başarısız: {error}"),
                        };
                    }
                }
            }

            fn register_callbacks(
                &self,
                client: &Client,
                pending: Arc<Mutex<PendingInput>>,
            ) -> Vec<CallbackHandle> {
                let app = self.app.clone();
                register_callbacks(
                    client,
                    pending,
                    Arc::new(move |event| match event {
                        Event::Overlay(active) => {
                            let _ = app.emit(OVERLAY_EVENT, OverlayPayload { active });
                        }
                        Event::Text { request_id, text } => {
                            let _ = app.emit(
                                TEXT_INPUT_EVENT,
                                TextInputPayload {
                                    request_id,
                                    submitted: text.is_some(),
                                    text,
                                },
                            );
                        }
                        Event::Floating { request_id } => {
                            let _ =
                                app.emit(FLOATING_DISMISSED_EVENT, FloatingPayload { request_id });
                        }
                    }),
                )
            }

            fn spawn_pump(client: Client, stop: Arc<AtomicBool>) -> std::thread::JoinHandle<()> {
                std::thread::Builder::new()
                    .name("vol-steamworks-pump".into())
                    .spawn(move || {
                        while !stop.load(Ordering::Acquire) {
                            client.run_callbacks();
                            std::thread::sleep(Duration::from_millis(10));
                        }
                    })
                    .expect("steamworks pompa iş parçacığı açılamadı")
            }

            fn client(&self) -> Result<Client, String> {
                self.ensure_connected();
                let state = self.state.lock().unwrap();
                match &*state {
                    State::Up { session, .. } => Ok(session.client.clone()),
                    State::Down { error } => Err(error.clone()),
                }
            }

            pub fn status(&self) -> Status {
                self.ensure_connected();
                let state = self.state.lock().unwrap();
                match &*state {
                    State::Down { error } => Status {
                        compiled: true,
                        available: false,
                        app_id: None,
                        deck: false,
                        big_picture: false,
                        overlay_enabled: false,
                        cloud_enabled: None,
                        input_ready: false,
                        manifest_ok: None,
                        error: Some(error.clone()),
                    },
                    State::Up {
                        session,
                        manifest_ok,
                    } => {
                        let client = &session.client;
                        let utils = client.utils();
                        let remote = client.remote_storage();
                        Status {
                            compiled: true,
                            available: true,
                            app_id: Some(utils.app_id().0),
                            deck: utils.is_steam_running_on_steam_deck(),
                            big_picture: utils.is_steam_in_big_picture_mode(),
                            overlay_enabled: utils.is_overlay_enabled(),
                            cloud_enabled: Some(remote.is_cloud_enabled_for_app()),
                            input_ready: true,
                            manifest_ok: *manifest_ok,
                            error: None,
                        }
                    }
                }
            }

            /// Manifesto yolu uygulama tarafında çözülür (resource dir ya da
            /// mutlak). Steamworks .vdf ister; yok sayma yerine doğrularız.
            pub fn set_input_manifest(&self, path: &str) -> Result<bool, String> {
                if !path.ends_with(".vdf") {
                    return Err("manifesto bir .vdf dosyası olmalı".into());
                }
                if !std::path::Path::new(path).is_file() {
                    return Err(format!("manifesto dosyası yok: {path}"));
                }
                let client = self.client()?;
                Ok(client.input().set_input_action_manifest_file_path(path))
            }

            /// Aksiyon setini bağlı tüm kollara uygular. Kaç kola uygulandığı
            /// döner — 0 bağlı kol da başarıdır (kol sonra takılabilir).
            pub fn activate_action_set(&self, name: &str) -> Result<u32, String> {
                if !valid_name(name) {
                    return Err(format!("geçersiz aksiyon seti adı: {name:?}"));
                }
                let client = self.client()?;
                let input = client.input();
                input.run_frame();
                let set = input.get_action_set_handle(name);
                let controllers = input.get_connected_controllers();
                for handle in &controllers {
                    input.activate_action_set_handle(*handle, set);
                }
                Ok(controllers.len() as u32)
            }

            pub fn controllers(&self) -> Result<Vec<ControllerInfo>, String> {
                let client = self.client()?;
                let input = client.input();
                input.run_frame();
                Ok(input
                    .get_connected_controllers()
                    .into_iter()
                    .map(|handle| ControllerInfo {
                        handle,
                        steamworks_type: input_type_name(input.get_input_type_for_handle(handle))
                            .into(),
                    })
                    .collect())
            }

            /// Steam Input titreşimi: bağlı bütün kollara iki motor hızı
            /// (0–65535); 0,0 durdurur. `steamworks` 0.13 sarmalayıcısı bu
            /// çağrıyı açmadığı için SDK fonksiyonu doğrudan çağrılır.
            pub fn vibrate(&self, left: u16, right: u16) -> Result<u32, String> {
                let client = self.client()?;
                let input = client.input();
                input.run_frame();
                let controllers = input.get_connected_controllers();
                // SAFETY: istemci ayaktayken SteamAPI başlatılmıştır ve arayüz
                // işaretçisi süreç boyunca geçerlidir.
                let raw = unsafe { steamworks::sys::SteamAPI_SteamInput_v006() };
                for handle in &controllers {
                    unsafe {
                        steamworks::sys::SteamAPI_ISteamInput_TriggerVibration(
                            raw, *handle, left, right,
                        );
                    }
                }
                Ok(controllers.len() as u32)
            }

            /// İlk bağlı kolun dijital ve analog aksiyon değerleri.
            pub fn action_state(
                &self,
                digital: &[String],
                analog: &[String],
            ) -> Result<ActionState, String> {
                if !digital.iter().chain(analog).all(|name| valid_name(name)) {
                    return Err("geçersiz aksiyon adı".into());
                }
                let client = self.client()?;
                let input = client.input();
                input.run_frame();
                let Some(&handle) = input.get_connected_controllers().first() else {
                    return Ok(ActionState::default());
                };
                Ok(ActionState {
                    digital: digital
                        .iter()
                        .map(|name| {
                            let data = input.get_digital_action_data(
                                handle,
                                input.get_digital_action_handle(name),
                            );
                            DigitalAction {
                                name: name.clone(),
                                pressed: data.bState,
                                active: data.bActive,
                            }
                        })
                        .collect(),
                    analog: analog
                        .iter()
                        .map(|name| {
                            let data = input.get_analog_action_data(
                                handle,
                                input.get_analog_action_handle(name),
                            );
                            AnalogAction {
                                name: name.clone(),
                                x: data.x,
                                y: data.y,
                                active: data.bActive,
                            }
                        })
                        .collect(),
                })
            }

            /// Dijital aksiyonun bağlı olduğu origin'ler ve her origin'in
            /// glif PNG'si. Steam glifleri istemci dizininde dosyadır;
            /// içerik base64 döner ki WebView dosya yoluna erişmek zorunda
            /// kalmasın.
            pub fn action_glyph(
                &self,
                action_set: &str,
                action: &str,
            ) -> Result<Vec<GlyphOrigin>, String> {
                if !valid_name(action_set) || !valid_name(action) {
                    return Err("geçersiz aksiyon seti/aksiyon adı".into());
                }
                let client = self.client()?;
                let input = client.input();
                input.run_frame();
                let set = input.get_action_set_handle(action_set);
                let action_handle = input.get_digital_action_handle(action);
                let mut origins = Vec::new();
                for handle in input.get_connected_controllers() {
                    for origin in input.get_digital_action_origins(handle, set, action_handle) {
                        let path = input.get_glyph_for_action_origin(origin);
                        origins.push(GlyphOrigin {
                            name: input.get_string_for_action_origin(origin),
                            png_base64: std::fs::read(&path).ok().map(|b| b64_encode(&b)),
                        });
                    }
                }
                Ok(origins)
            }

            /// Big Picture metin diyaloğu: sonuç `TEXT_INPUT_EVENT` olayıyla
            /// döner. Overlay takılı değilse Steam `false` döndürür — JS
            /// tarafı yerel ekran klavyesine düşer.
            pub fn show_text_input(
                &self,
                request_id: &str,
                description: &str,
                existing_text: &str,
                max_characters: u32,
                multiline: bool,
            ) -> Result<bool, String> {
                use std::ffi::CString;
                let description =
                    CString::new(description).map_err(|_| "metin açıklaması NUL içeremez")?;
                let existing = CString::new(existing_text).map_err(|_| "metin NUL içeremez")?;
                self.show_input(request_id, InputKind::Text, || {
                    // SAFETY: state kilidi istemciyi ve arayüzü çağrı boyunca yaşatır.
                    // Crate yardımcıları guard'ı düşürdüğü için yalnız raw show kullanılır.
                    unsafe {
                        steamworks::sys::SteamAPI_ISteamUtils_ShowGamepadTextInput(
                            steamworks::sys::SteamAPI_SteamUtils_v010(),
                            GamepadTextInputMode::Normal.into(),
                            if multiline {
                                GamepadTextInputLineMode::MultipleLines
                            } else {
                                GamepadTextInputLineMode::SingleLine
                            }
                            .into(),
                            description.as_ptr(),
                            max_characters,
                            existing.as_ptr(),
                        )
                    }
                })
            }

            /// Kayan klavye odaklı alana yazar; terminal olay kimliği JS
            /// oturumuna aittir. İptal edilen popup bitmeden yenisi açılmaz.
            pub fn show_floating_input(
                &self,
                request_id: &str,
                x: i32,
                y: i32,
                width: i32,
                height: i32,
            ) -> Result<bool, String> {
                self.show_input(request_id, InputKind::Floating, || {
                    // SAFETY: state kilidi SDK bağlamını yaşatır.
                    unsafe {
                        steamworks::sys::SteamAPI_ISteamUtils_ShowFloatingGamepadTextInput(
                            steamworks::sys::SteamAPI_SteamUtils_v010(),
                            FloatingGamepadTextInputMode::SingleLine.into(),
                            x,
                            y,
                            width,
                            height,
                        )
                    }
                })
            }

            fn show_input(
                &self,
                id: &str,
                kind: InputKind,
                show: impl FnOnce() -> bool,
            ) -> Result<bool, String> {
                self.ensure_connected();
                let state = self.state.lock().unwrap();
                let session = match &*state {
                    State::Up { session, .. } => session,
                    State::Down { error } => return Err(error.clone()),
                };
                let mut pending = session.pending.lock().unwrap();
                if !pending.begin(id, kind)? {
                    return Ok(false);
                }
                let shown = show();
                if !shown {
                    pending.finish(kind);
                }
                Ok(shown)
            }

            pub fn cancel_text_input(&self, request_id: &str) -> Result<(), String> {
                // Bağlantı kurmaya çalışmaz: iptal yeni kaynak açamaz.
                let state = self.state.lock().unwrap();
                if let State::Up { session, .. } = &*state {
                    session.pending.lock().unwrap().cancel(request_id);
                }
                Ok(())
            }

            pub fn shutdown(&self) {
                self.closed.store(true, Ordering::Release);
                *self.retry.lock().unwrap() = None;
                *self.state.lock().unwrap() = State::Down {
                    error: "steamworks kapatıldı".into(),
                };
            }

            /// Steam Input bağlama paneli — kullanıcının kendi atamalarını
            /// düzenlediği overlay ekranı. Overlay yoksa `false`.
            pub fn show_binding_panel(&self) -> Result<bool, String> {
                let client = self.client()?;
                let input = client.input();
                input.run_frame();
                match input.get_connected_controllers().first() {
                    Some(handle) => Ok(input.show_binding_panel(*handle)),
                    None => Ok(false),
                }
            }

            pub fn cloud_list(&self) -> Result<Vec<CloudFileInfo>, String> {
                let client = self.client()?;
                Ok(client
                    .remote_storage()
                    .files()
                    .into_iter()
                    .map(|f| CloudFileInfo {
                        name: f.name,
                        size: f.size,
                    })
                    .collect())
            }

            pub fn cloud_read(&self, name: &str) -> Result<Option<String>, String> {
                let name = validated_cloud_name(name)?;
                let client = self.client()?;
                let file = client.remote_storage().file(name);
                if !file.exists() {
                    return Ok(None);
                }
                use std::io::Read;
                let mut buf = Vec::new();
                file.read()
                    .read_to_end(&mut buf)
                    .map_err(|e| format!("bulut okuma hatası: {e}"))?;
                Ok(Some(b64_encode(&buf)))
            }

            pub fn cloud_write(&self, name: &str, data_base64: &str) -> Result<bool, String> {
                let name = validated_cloud_name(name)?;
                let bytes =
                    b64_decode(data_base64).ok_or_else(|| "bozuk base64 verisi".to_string())?;
                if bytes.len() > MAX_CLOUD_BYTES {
                    return Err(format!(
                        "bulut verisi çok büyük: {} bayt, sınır {MAX_CLOUD_BYTES}",
                        bytes.len()
                    ));
                }
                let client = self.client()?;
                let file = client.remote_storage().file(name);
                use std::io::Write;
                file.write()
                    .write_all(&bytes)
                    .map(|_| true)
                    .map_err(|e| format!("bulut yazma hatası: {e}"))
            }

            pub fn cloud_delete(&self, name: &str) -> Result<bool, String> {
                let name = validated_cloud_name(name)?;
                let client = self.client()?;
                Ok(client.remote_storage().file(name).delete())
            }
        }

        /// `steamworks::InputType` → `core` çözümleyicisinin tanıdığı
        /// `steamworksType` dizeleri (bkz. `core/src/ui/glyphs/glyphFamily.ts`).
        pub fn input_type_name(input_type: InputType) -> &'static str {
            match input_type {
                InputType::SteamDeckController => "steamdeck",
                InputType::SteamController => "steamcontroller",
                InputType::XBox360Controller => "xbox360",
                InputType::XBoxOneController => "xboxone",
                InputType::PS3Controller => "ps3",
                InputType::PS4Controller => "ps4",
                InputType::PS5Controller => "ps5",
                InputType::SwitchProController => "switch_pro",
                InputType::SwitchJoyConPair | InputType::SwitchJoyConSingle => "switch_joycon",
                InputType::GenericGamepad => "generic",
                InputType::MobileTouch => "mobile_touch",
                InputType::AndroidController => "android",
                InputType::AppleMFiController => "apple_mfi",
                InputType::Unknown => "unknown",
            }
        }

        fn b64_encode(data: &[u8]) -> String {
            crate::b64::encode(data)
        }

        fn b64_decode(text: &str) -> Option<Vec<u8>> {
            crate::b64::decode(text)
        }
        #[cfg(test)]
        mod native_tests {
            use super::*;

            #[test]
            #[ignore = "Çalışan Steam istemcisi ve test App ID 480 gerekir; stub değildir"]
            fn sdk_callback_kaydi_sahibi_dusene_kadar_yasar() {
                let client = Client::init_app(480).expect("gerçek Steam SDK init");
                let pending = Arc::new(Mutex::new(PendingInput::default()));
                let emit: Arc<dyn Fn(Event) + Send + Sync> = Arc::new(|_| {});
                let callbacks = register_callbacks(&client, pending.clone(), emit.clone());
                assert_eq!(Arc::strong_count(&emit), 4, "üç gerçek SDK kaydı yaşamalı");
                let stop = Arc::new(AtomicBool::new(false));
                let pump = Service::<tauri::Wry>::spawn_pump(client.clone(), stop.clone());
                let session = Session {
                    callbacks,
                    client,
                    pending,
                    stop: stop.clone(),
                    pump: Some(pump),
                };
                drop(session);
                assert!(stop.load(Ordering::Acquire));
                assert_eq!(
                    Arc::strong_count(&stop),
                    1,
                    "pompa join olmadan sahip düşemez"
                );
                assert_eq!(Arc::strong_count(&emit), 1, "üç kayıt da kaldırılmalı");
            }
        }
    }

    #[cfg(not(feature = "steamworks"))]
    mod stub {
        use super::*;
        use tauri::{AppHandle, Runtime};

        /// Stub: her çağrı aynı dürüst hatayı verir. `status` dışında tüm
        /// komutlar hata döner; `status` `compiled: false` der.
        pub struct Service<R: Runtime> {
            _marker: std::marker::PhantomData<fn() -> R>,
        }

        impl<R: Runtime> Service<R> {
            pub fn new(_app: AppHandle<R>) -> Self {
                Self {
                    _marker: std::marker::PhantomData,
                }
            }

            pub fn connect(&self, _app_id: u32, _manifest: Option<String>) {}

            pub fn shutdown(&self) {}

            pub fn status(&self) -> Status {
                Status {
                    compiled: false,
                    available: false,
                    app_id: None,
                    deck: false,
                    big_picture: false,
                    overlay_enabled: false,
                    cloud_enabled: None,
                    input_ready: false,
                    manifest_ok: None,
                    error: Some("vol-steamworks `steamworks` feature'ı olmadan derlendi".into()),
                }
            }

            fn unavailable<T>(&self) -> Result<T, String> {
                Err("vol-steamworks `steamworks` feature'ı olmadan derlendi".into())
            }

            pub fn set_input_manifest(&self, _path: &str) -> Result<bool, String> {
                self.unavailable()
            }
            pub fn activate_action_set(&self, _name: &str) -> Result<u32, String> {
                self.unavailable()
            }
            pub fn controllers(&self) -> Result<Vec<ControllerInfo>, String> {
                self.unavailable()
            }
            pub fn action_glyph(
                &self,
                _set: &str,
                _action: &str,
            ) -> Result<Vec<GlyphOrigin>, String> {
                self.unavailable()
            }
            pub fn show_text_input(
                &self,
                _request_id: &str,
                _d: &str,
                _e: &str,
                _m: u32,
                _ml: bool,
            ) -> Result<bool, String> {
                self.unavailable()
            }
            pub fn show_floating_input(
                &self,
                _request_id: &str,
                _x: i32,
                _y: i32,
                _w: i32,
                _h: i32,
            ) -> Result<bool, String> {
                self.unavailable()
            }
            pub fn cancel_text_input(&self, _request_id: &str) -> Result<(), String> {
                self.unavailable()
            }
            pub fn show_binding_panel(&self) -> Result<bool, String> {
                self.unavailable()
            }
            pub fn cloud_list(&self) -> Result<Vec<CloudFileInfo>, String> {
                self.unavailable()
            }
            pub fn cloud_read(&self, _n: &str) -> Result<Option<String>, String> {
                self.unavailable()
            }
            pub fn cloud_write(&self, _n: &str, _d: &str) -> Result<bool, String> {
                self.unavailable()
            }
            pub fn vibrate(&self, _left: u16, _right: u16) -> Result<u32, String> {
                self.unavailable()
            }
            pub fn action_state(
                &self,
                _d: &[String],
                _a: &[String],
            ) -> Result<ActionState, String> {
                self.unavailable()
            }
            pub fn cloud_delete(&self, _n: &str) -> Result<bool, String> {
                self.unavailable()
            }
        }
    }
}

#[cfg(test)]
mod cloud_name_tests {
    use super::*;

    #[test]
    fn bulut_adlari_eylem_adindan_dardir() {
        // Aksiyon kuralı noktayı kabul eder; bulut kabul etmez.
        assert!(valid_name(".vdf"));
        assert!(!valid_cloud_name(".vdf"));
        assert!(!valid_cloud_name(".."));
        assert!(!valid_cloud_name("."));
    }

    #[test]
    fn dizin_kacisi_ayrac_ve_bos_ad_reddedilir() {
        for kotu in [
            "",
            "..",
            ".",
            ".hidden",
            "a/b",
            "a\\b",
            "../x",
            "x\u{0}y",
            "x y",
            &"a".repeat(129),
        ] {
            assert!(!valid_cloud_name(kotu), "reddedilmeli: {kotu:?}");
            assert!(
                validated_cloud_name(kotu).is_err(),
                "reddedilmeli: {kotu:?}"
            );
        }
    }

    #[test]
    fn yedek_dosya_sonekleri_bulutta_ayri_tutulmaz() {
        // `store.rs` yazıcısının `.tmp`/`.bak` yan dosyaları vardır ve bunları
        // adlandırmadan dışlar. Steam Cloud düz bir anahtar-değer deposudur,
        // yan dosya üretmez; bu yüzden aynı ayrıntı burada yanlış olurdu.
        assert!(valid_cloud_name("x.json.tmp"));
        assert!(valid_cloud_name("x.json.bak"));
    }

    #[test]
    fn tasinabilir_adi_aktarilir() {
        for iyi in ["game-store.json", "slot-1.sav", "a_b", "x"] {
            assert!(valid_cloud_name(iyi), "geçmeli: {iyi}");
            assert_eq!(validated_cloud_name(iyi), Ok(iyi));
        }
    }

    #[test]
    fn uzun_ad_ayni_sinirla_kirpilir() {
        assert!(valid_cloud_name(&"a".repeat(128)));
        assert!(!valid_cloud_name(&"a".repeat(129)));
        assert!(validated_cloud_name(&"a".repeat(129)).is_err());
    }

    #[test]
    fn hata_adi_ve_kurali_yeniden_usturur() {
        let hata = validated_cloud_name("../gizli").unwrap_err();
        assert!(hata.contains("geçersiz bulut dosyası adı"), "{hata}");
        assert!(hata.contains("../gizli"), "{hata}");
    }
}
