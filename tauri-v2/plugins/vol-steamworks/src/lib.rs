//! `vol-steamworks` — isteğe bağlı Steamworks köprüsü.
//!
//! Eklenti `steamworks` cargo feature'ı olmadan da derlenir (stub): tüm
//! komutlar kayıtlı kalır ve `status` `compiled: false` bildirir — eklentisiz
//! yapılandırma Deck kriterlerini yine karşılar. Feature açıkken eklenti
//! `steamworks` crate'ine bağlanır; SDK ikilileri crate'in kendi paketinden
//! gelir, depoya binary girmez.
//!
//! İstemci bağlantısı süreç boyunca kurulamayabilir (Steam kapalı, App ID
//! yok); bu durumda `status.available: false` ve `error` alanı nedeni taşır.
//! Geliştirme için App ID 480 (Spacewar) kullanılır: `init(480)`.
//!
//! JS'e dönen olaylar:
//! - `vol-steamworks:overlay` `{active: bool}` — overlay açılma/kapanma;
//!   duraklatma kararı oyunundur.
//! - `vol-steamworks:text-input` `{submitted, text}` — Big Picture metin
//!   diyaloğunun sonucu.
//! - `vol-steamworks:floating-dismissed` — kayan klavye kapandı (metin
//!   odaklı alana doğrudan yazılmıştır).

mod b64;
mod service;

pub use service::{CloudFileInfo, ControllerInfo, GlyphOrigin, Status};

use service::imp::Service;
use serde::Serialize;
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Manager, Runtime,
};

#[derive(Debug)]
pub struct Error(String);

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Error {}

impl Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.0)
    }
}

impl From<String> for Error {
    fn from(e: String) -> Self {
        Self(e)
    }
}

fn service<R: Runtime>(app: &AppHandle<R>) -> tauri::State<'_, Service<R>> {
    app.state::<Service<R>>()
}

#[tauri::command]
fn status<R: Runtime>(app: AppHandle<R>) -> Status {
    service(&app).status()
}

/// Manifesto göreli ad verilirse uygulamanın resource dizinine bağlanır —
/// .vdf dosyası `bundle.resources` ile AppDir'e girer.
#[tauri::command]
fn set_input_manifest<R: Runtime>(app: AppHandle<R>, path: String) -> Result<bool, Error> {
    let full = if std::path::Path::new(&path).is_absolute() {
        path
    } else {
        app.path()
            .resource_dir()
            .map_err(|e| Error(e.to_string()))?
            .join(&path)
            .to_string_lossy()
            .into_owned()
    };
    service(&app).set_input_manifest(&full).map_err(Error)
}

#[tauri::command]
fn activate_action_set<R: Runtime>(
    app: AppHandle<R>,
    name: String,
) -> Result<u32, Error> {
    service(&app).activate_action_set(&name).map_err(Error)
}

#[tauri::command]
fn controllers<R: Runtime>(app: AppHandle<R>) -> Result<Vec<ControllerInfo>, Error> {
    service(&app).controllers().map_err(Error)
}

#[tauri::command]
fn action_glyph<R: Runtime>(
    app: AppHandle<R>,
    action_set: String,
    action: String,
) -> Result<Vec<GlyphOrigin>, Error> {
    service(&app)
        .action_glyph(&action_set, &action)
        .map_err(Error)
}

#[tauri::command]
fn show_text_input<R: Runtime>(
    app: AppHandle<R>,
    description: String,
    existing_text: String,
    max_characters: u32,
    multiline: bool,
) -> Result<bool, Error> {
    service(&app)
        .show_text_input(&description, &existing_text, max_characters, multiline)
        .map_err(Error)
}

#[tauri::command]
fn show_floating_input<R: Runtime>(
    app: AppHandle<R>,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<bool, Error> {
    service(&app)
        .show_floating_input(x, y, width, height)
        .map_err(Error)
}

#[tauri::command]
fn show_binding_panel<R: Runtime>(app: AppHandle<R>) -> Result<bool, Error> {
    service(&app).show_binding_panel().map_err(Error)
}

#[tauri::command]
fn cloud_list<R: Runtime>(app: AppHandle<R>) -> Result<Vec<CloudFileInfo>, Error> {
    service(&app).cloud_list().map_err(Error)
}

#[tauri::command]
fn cloud_read<R: Runtime>(app: AppHandle<R>, name: String) -> Result<Option<String>, Error> {
    service(&app).cloud_read(&name).map_err(Error)
}

#[tauri::command]
fn cloud_write<R: Runtime>(
    app: AppHandle<R>,
    name: String,
    data_base64: String,
) -> Result<bool, Error> {
    service(&app).cloud_write(&name, &data_base64).map_err(Error)
}

#[tauri::command]
fn cloud_delete<R: Runtime>(app: AppHandle<R>, name: String) -> Result<bool, Error> {
    service(&app).cloud_delete(&name).map_err(Error)
}

/// `app_id` — geliştirme için Valve'ın ortak test uygulaması 480
/// (Spacewar); gerçek App ID oyunun Steamworks konsolundandır.
///
/// `manifest_resource` verilirse `bundle.resources`'a konmuş Steam Input
/// manifestosudur (`"Action Manifest"` köklü .vdf). Göreli ad resource
/// dizinine bağlanır ve pompadan (ilk `RunFrame`'den) önce Steam'e
/// geçirilir; dönüş `status.manifestOk` alanında görünür.
///
/// Eklenti kayıt olur olmaz bağlanmayı dener; Steam o an açık değilse
/// `status` hatası saklanır ve sonraki `status` çağrısı yeniden dener —
/// kısa süreli ağ/istemci yokluğunda kalıcı kilitlenme yoktur.
pub fn init<R: Runtime>(app_id: u32, manifest_resource: Option<&str>) -> TauriPlugin<R> {
    let manifest_resource = manifest_resource.map(str::to_owned);
    Builder::new("vol-steamworks")
        .invoke_handler(tauri::generate_handler![
            status,
            set_input_manifest,
            activate_action_set,
            controllers,
            action_glyph,
            show_text_input,
            show_floating_input,
            show_binding_panel,
            cloud_list,
            cloud_read,
            cloud_write,
            cloud_delete
        ])
        .setup(move |app, _api| {
            let manifest = manifest_resource.and_then(|path| {
                if std::path::Path::new(&path).is_absolute() {
                    Some(path)
                } else {
                    app.path()
                        .resource_dir()
                        .ok()
                        .map(|dir| dir.join(&path).to_string_lossy().into_owned())
                }
            });
            let service = Service::new(app.clone());
            service.connect(app_id, manifest);
            app.manage(service);
            Ok(())
        })
        .build()
}
