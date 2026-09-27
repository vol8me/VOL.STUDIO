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

pub(crate) mod imp {
    #[cfg(feature = "steamworks")]
    pub use real::*;

    #[cfg(not(feature = "steamworks"))]
    pub use stub::*;

    use super::*;

    #[cfg(feature = "steamworks")]
    mod real {
        use super::*;
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::{Arc, Mutex};
        use std::time::Duration;
        use steamworks::{Client, FloatingGamepadTextInputMode, GameOverlayActivated,
            GamepadTextInputLineMode, GamepadTextInputMode, InputType};
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
            stop: Arc<AtomicBool>,
        }

        enum State {
            /// Hiç denenmedi veya son deneme başarısız — neden saklanır.
            Down { error: String },
            Up {
                client: Client,
                manifest_ok: Option<bool>,
            },
        }

        #[derive(Clone, Serialize)]
        #[serde(rename_all = "camelCase")]
        struct TextInputPayload {
            submitted: bool,
            text: Option<String>,
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
                    stop: Arc::new(AtomicBool::new(false)),
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
                match Client::init_app(app_id) {
                    Ok(client) => {
                        client.input().init(false);
                        let manifest_ok = manifest.map(|path| {
                            client
                                .input()
                                .set_input_action_manifest_file_path(&path)
                        });
                        self.register_callbacks(&client);
                        self.spawn_pump(client.clone());
                        *self.state.lock().unwrap() = State::Up {
                            client,
                            manifest_ok,
                        };
                    }
                    Err(error) => {
                        *self.state.lock().unwrap() = State::Down {
                            error: format!("steamworks init başarısız: {error}"),
                        };
                    }
                }
            }

            fn register_callbacks(&self, client: &Client) {
                let app = self.app.clone();
                // CallbackHandle kaydı Client'ın içindedir; handle düşse bile
                // kayıt yaşar (crate sözleşmesi).
                client.register_callback(move |event: GameOverlayActivated| {
                    let _ = app.emit(
                        OVERLAY_EVENT,
                        OverlayPayload {
                            active: event.active,
                        },
                    );
                });
            }

            fn spawn_pump(&self, client: Client) {
                let stop = Arc::clone(&self.stop);
                std::thread::Builder::new()
                    .name("vol-steamworks-pump".into())
                    .spawn(move || {
                        while !stop.load(Ordering::Relaxed) {
                            client.run_callbacks();
                            std::thread::sleep(Duration::from_millis(10));
                        }
                    })
                    .expect("steamworks pompa iş parçacığı açılamadı");
            }

            fn client(&self) -> Result<Client, String> {
                let state = self.state.lock().unwrap();
                match &*state {
                    State::Up { client, .. } => Ok(client.clone()),
                    State::Down { error } => Err(error.clone()),
                }
            }

            pub fn status(&self) -> Status {
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
                        client, manifest_ok,
                    } => {
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
                        steamworks_type: input_type_name(
                            input.get_input_type_for_handle(handle),
                        )
                        .into(),
                    })
                    .collect())
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
                    for origin in
                        input.get_digital_action_origins(handle, set, action_handle)
                    {
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
                description: &str,
                existing_text: &str,
                max_characters: u32,
                multiline: bool,
            ) -> Result<bool, String> {
                let client = self.client()?;
                let utils = client.utils();
                let app = self.app.clone();
                let cb_client = client.clone();
                Ok(utils.show_gamepad_text_input(
                    GamepadTextInputMode::Normal,
                    if multiline {
                        GamepadTextInputLineMode::MultipleLines
                    } else {
                        GamepadTextInputLineMode::SingleLine
                    },
                    description,
                    max_characters,
                    Some(existing_text),
                    move |dismissed| {
                        let text = cb_client
                            .utils()
                            .get_entered_gamepad_text_input(&dismissed);
                        let _ = app.emit(
                            TEXT_INPUT_EVENT,
                            TextInputPayload {
                                submitted: text.is_some(),
                                text,
                            },
                        );
                    },
                ))
            }

            /// Kayan klavye: metni odaklı alana doğrudan yazar. Konum oyun
            /// penceresine göre pikseldir; alanın üstünü kapamaması için
            /// çağıran alan dikdörtgenini verir.
            pub fn show_floating_input(
                &self,
                x: i32,
                y: i32,
                width: i32,
                height: i32,
            ) -> Result<bool, String> {
                let client = self.client()?;
                let app = self.app.clone();
                Ok(client.utils().show_floating_gamepad_text_input(
                    FloatingGamepadTextInputMode::SingleLine,
                    x,
                    y,
                    width,
                    height,
                    move || {
                        let _ = app.emit(FLOATING_DISMISSED_EVENT, ());
                    },
                ))
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
                let bytes = b64_decode(data_base64)
                    .ok_or_else(|| "bozuk base64 verisi".to_string())?;
                let client = self.client()?;
                let file = client.remote_storage().file(name);
                use std::io::Write;
                file.write()
                    .write_all(&bytes)
                    .map(|_| true)
                    .map_err(|e| format!("bulut yazma hatası: {e}"))
            }

            pub fn cloud_delete(&self, name: &str) -> Result<bool, String> {
                let client = self.client()?;
                Ok(client.remote_storage().file(name).delete())
            }
        }

        impl<R: Runtime> Drop for Service<R> {
            fn drop(&mut self) {
                self.stop.store(true, Ordering::Relaxed);
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
                InputType::SwitchJoyConPair | InputType::SwitchJoyConSingle => {
                    "switch_joycon"
                }
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
                    error: Some(
                        "vol-steamworks `steamworks` feature'ı olmadan derlendi".into(),
                    ),
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
                _d: &str,
                _e: &str,
                _m: u32,
                _ml: bool,
            ) -> Result<bool, String> {
                self.unavailable()
            }
            pub fn show_floating_input(
                &self,
                _x: i32,
                _y: i32,
                _w: i32,
                _h: i32,
            ) -> Result<bool, String> {
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
            pub fn cloud_delete(&self, _n: &str) -> Result<bool, String> {
                self.unavailable()
            }
        }
    }
}
