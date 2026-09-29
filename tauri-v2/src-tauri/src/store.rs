//! Atomik kalıcılık komutları — `TauriStoreAdapter`'ın native yarısı.
//!
//! Yazma: geçici dosya → fsync → güncel kayıt `.bak` olarak bağlanır →
//! geçici dosya güncelin üstüne rename edilir → (Unix'te) dizin fsync'i.
//! Güncel dosya hiçbir anda diskten kalkmaz. Okuma bozuk ya da eksik günceli
//! geçici dosyadan ya da yedekten kurtarır ve `recovered` döner; hiçbir
//! jenerasyon okunamıyorsa bozuk dosyalar karantinaya alınır ve boş kayıtla
//! `reset` döner — iki durum da tüketiciye bildirilir, sessizce yutulmaz.

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::Manager;

/// Seri hâldeki kayıt ve bütünlük işaretleri. `data` yoksa `null` döner.
#[derive(serde::Serialize, Debug, PartialEq)]
pub struct StoreRead {
    pub data: Option<String>,
    /// Güncel dosya bozuk ya da eksikti; kayıt başka bir jenerasyondan okundu.
    pub recovered: bool,
    /// Hiçbir jenerasyon okunamadı; bozuk dosyalar karantinada, kayıt boş.
    pub reset: bool,
}

const RESERVED_SUFFIXES: [&str; 3] = [".bak", ".tmp", ".bak.tmp"];

fn store_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("veri dizini yok: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("veri dizini yaratılamadı: {error}"))?;
    Ok(dir)
}

/// Dosya adı tek parçadır; dizin ayracı, `..`, gizli ad ve yazıcının kendi
/// yan dosyalarının sonekleri reddedilir.
fn validate_name(name: &str) -> Result<(), String> {
    let ok = !name.is_empty()
        && name.len() <= 128
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        && !name.starts_with('.')
        && !name.contains(".corrupt-")
        && !RESERVED_SUFFIXES
            .iter()
            .any(|suffix| name.ends_with(suffix));
    if ok {
        Ok(())
    } else {
        Err(format!("geçersiz store adı: {name:?}"))
    }
}

/// Aynı ada yapılan okuma ve yazmalar tek sırada koşar; iki adaptör aynı
/// dosyayı yazsa da yan dosyalar yarışmaz.
fn name_lock(name: &str) -> Arc<Mutex<()>> {
    static LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();
    let mut locks = LOCKS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    locks
        .entry(name.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

fn read_raw(path: &Path) -> Option<Result<String, String>> {
    match File::open(path) {
        Ok(mut file) => {
            let mut data = String::new();
            Some(
                file.read_to_string(&mut data)
                    .map(|_| data)
                    .map_err(|error| format!("okuma: {error}")),
            )
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => Some(Err(format!("açma: {error}"))),
    }
}

/// Store kaydı hep JSON nesnesidir; yarım yazılmış ya da yabancı içerik bozuk sayılır.
fn parses_as_object(data: &str) -> bool {
    serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(data).is_ok()
}

fn valid(path: &Path) -> Option<String> {
    match read_raw(path) {
        Some(Ok(data)) if parses_as_object(&data) => Some(data),
        _ => None,
    }
}

fn side(dir: &Path, name: &str, suffix: &str) -> PathBuf {
    dir.join(format!("{name}{suffix}"))
}

fn quarantine(path: &Path, stamp: u128) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let mut target = path.as_os_str().to_owned();
    target.push(format!(".corrupt-{stamp}"));
    fs::rename(path, PathBuf::from(target)).map_err(|error| format!("karantina: {error}"))
}

fn read_in(dir: &Path, name: &str) -> Result<StoreRead, String> {
    let current = dir.join(name);
    let temp = side(dir, name, ".tmp");
    let backup = side(dir, name, ".bak");

    if let Some(data) = valid(&current) {
        return Ok(StoreRead {
            data: Some(data),
            recovered: false,
            reset: false,
        });
    }
    let current_present = current.exists();
    // Geçici dosya ancak fsync'ten sonra güncelin yerine geçer; güncel yokken
    // ya da bozukken tam bir geçici dosya en yeni jenerasyondur.
    for candidate in [&temp, &backup] {
        if let Some(data) = valid(candidate) {
            return Ok(StoreRead {
                data: Some(data),
                recovered: true,
                reset: false,
            });
        }
    }
    if !current_present && !backup.exists() {
        return Ok(StoreRead {
            data: None,
            recovered: false,
            reset: false,
        });
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or(0);
    for path in [&current, &backup, &temp] {
        quarantine(path, stamp)?;
    }
    Ok(StoreRead {
        data: None,
        recovered: false,
        reset: true,
    })
}

fn write_file(path: &Path, data: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(path)
        .map_err(|error| format!("geçici açma: {error}"))?;
    file.write_all(data)
        .and_then(|()| file.sync_all())
        .map_err(|error| format!("yazma/fsync: {error}"))
}

/// Günceli yedeğe bağlar. Sabit bağ desteklenmiyorsa kopyalanır; ikisinde de
/// güncel dosyaya dokunulmaz.
fn preserve_backup(current: &Path, backup: &Path, dir: &Path, name: &str) -> Result<(), String> {
    match fs::remove_file(backup) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("eski yedek silinemedi: {error}")),
    }
    if fs::hard_link(current, backup).is_ok() {
        return Ok(());
    }
    let staged = side(dir, name, ".bak.tmp");
    let bytes = fs::read(current).map_err(|error| format!("yedek okuma: {error}"))?;
    write_file(&staged, &bytes)?;
    fs::rename(&staged, backup).map_err(|error| format!("yedek taşıma: {error}"))
}

fn write_in(dir: &Path, name: &str, data: &str) -> Result<(), String> {
    let current = dir.join(name);
    let backup = side(dir, name, ".bak");
    let temp = side(dir, name, ".tmp");

    write_file(&temp, data.as_bytes())?;
    if valid(&current).is_some() {
        preserve_backup(&current, &backup, dir, name)?;
    }
    // Rename güncelin üstüne atomik yazar: güncel dosya hiçbir anda eksik değildir.
    fs::rename(&temp, &current).map_err(|error| format!("yerine koyma: {error}"))?;
    sync_dir(dir)
}

/// Rename'in kalıcılığı dizin girdisinin fsync'ini ister. Windows'ta dizin
/// tanıtıcısı bu yolla açılamaz; orada NTFS günlüğüne güvenilir.
#[cfg(unix)]
fn sync_dir(dir: &Path) -> Result<(), String> {
    File::open(dir)
        .and_then(|dir_file| dir_file.sync_all())
        .map_err(|error| format!("dizin fsync: {error}"))
}

#[cfg(not(unix))]
fn sync_dir(_dir: &Path) -> Result<(), String> {
    Ok(())
}

async fn blocking<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|error| format!("store iş parçacığı: {error}"))?
}

/// Disk işi ana iş parçacığı dışında koşar; fsync kareyi bekletmez.
#[tauri::command]
pub async fn vol_store_read(app: tauri::AppHandle, name: String) -> Result<StoreRead, String> {
    validate_name(&name)?;
    let dir = store_dir(&app)?;
    blocking(move || {
        let lock = name_lock(&name);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        read_in(&dir, &name)
    })
    .await
}

#[tauri::command]
pub async fn vol_store_write(
    app: tauri::AppHandle,
    name: String,
    data: String,
) -> Result<(), String> {
    validate_name(&name)?;
    if !parses_as_object(&data) {
        return Err("store kaydı JSON nesnesi olmalı".to_string());
    }
    let dir = store_dir(&app)?;
    blocking(move || {
        let lock = name_lock(&name);
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        write_in(&dir, &name, &data)
    })
    .await
}

#[cfg(test)]
mod store_tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "vol-store-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn read(dir: &Path, name: &str) -> (Option<String>, bool, bool) {
        let result = read_in(dir, name).unwrap();
        (result.data, result.recovered, result.reset)
    }

    #[test]
    fn yazi_ve_oku() {
        let dir = temp_dir();
        write_in(&dir, "a.json", r#"{"x":1}"#).unwrap();
        assert_eq!(
            read(&dir, "a.json"),
            (Some(r#"{"x":1}"#.into()), false, false)
        );
    }

    #[test]
    fn yoksa_null_doner() {
        let dir = temp_dir();
        assert_eq!(read(&dir, "hic.json"), (None, false, false));
    }

    #[test]
    fn yazma_gunceli_hic_kaldirmaz_ve_onceki_jenerasyonu_yedekler() {
        let dir = temp_dir();
        write_in(&dir, "b.json", r#"{"v":1}"#).unwrap();
        write_in(&dir, "b.json", r#"{"v":2}"#).unwrap();
        assert_eq!(
            fs::read_to_string(dir.join("b.json")).unwrap(),
            r#"{"v":2}"#
        );
        assert_eq!(
            fs::read_to_string(dir.join("b.json.bak")).unwrap(),
            r#"{"v":1}"#
        );
        assert!(!dir.join("b.json.tmp").exists());
    }

    // Çökme penceresi durum matrisi: yazıcı herhangi bir adımda ölürse diskte
    // kalabilecek her dosya bileşimi en yeni tam kayda döner.
    #[test]
    fn bozuk_guncel_yedekten_kurtarilir() {
        let dir = temp_dir();
        fs::write(dir.join("c.json"), "{yari").unwrap();
        fs::write(dir.join("c.json.bak"), r#"{"v":1}"#).unwrap();
        assert_eq!(
            read(&dir, "c.json"),
            (Some(r#"{"v":1}"#.into()), true, false)
        );
    }

    #[test]
    fn guncel_yoksa_yedekten_kurtarilir() {
        let dir = temp_dir();
        fs::write(dir.join("d.json.bak"), r#"{"v":1}"#).unwrap();
        assert_eq!(
            read(&dir, "d.json"),
            (Some(r#"{"v":1}"#.into()), true, false)
        );
    }

    #[test]
    fn guncel_yoksa_tam_gecici_dosya_en_yeni_jenerasyondur() {
        let dir = temp_dir();
        fs::write(dir.join("e.json.bak"), r#"{"v":1}"#).unwrap();
        fs::write(dir.join("e.json.tmp"), r#"{"v":2}"#).unwrap();
        assert_eq!(
            read(&dir, "e.json"),
            (Some(r#"{"v":2}"#.into()), true, false)
        );
    }

    #[test]
    fn saglam_guncel_yarim_gecici_dosyayi_yok_sayar() {
        let dir = temp_dir();
        fs::write(dir.join("f.json"), r#"{"v":1}"#).unwrap();
        fs::write(dir.join("f.json.tmp"), "{ya").unwrap();
        assert_eq!(
            read(&dir, "f.json"),
            (Some(r#"{"v":1}"#.into()), false, false)
        );
        write_in(&dir, "f.json", r#"{"v":2}"#).unwrap();
        assert_eq!(
            read(&dir, "f.json"),
            (Some(r#"{"v":2}"#.into()), false, false)
        );
    }

    #[test]
    fn hicbiri_okunamazsa_karantina_ve_bos_kayit() {
        let dir = temp_dir();
        fs::write(dir.join("g.json"), "{yari").unwrap();
        fs::write(dir.join("g.json.bak"), "[[[").unwrap();
        assert_eq!(read(&dir, "g.json"), (None, false, true));
        assert!(!dir.join("g.json").exists());
        let quarantined = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().contains(".corrupt-"))
            .count();
        assert_eq!(quarantined, 2);
        write_in(&dir, "g.json", r#"{"v":1}"#).unwrap();
        assert_eq!(
            read(&dir, "g.json"),
            (Some(r#"{"v":1}"#.into()), false, false)
        );
    }

    #[test]
    fn bozuk_guncel_yedegin_ustune_yazilmaz() {
        let dir = temp_dir();
        fs::write(dir.join("h.json"), "{yari").unwrap();
        fs::write(dir.join("h.json.bak"), r#"{"v":1}"#).unwrap();
        write_in(&dir, "h.json", r#"{"v":2}"#).unwrap();
        assert_eq!(
            fs::read_to_string(dir.join("h.json.bak")).unwrap(),
            r#"{"v":1}"#
        );
    }

    #[test]
    fn ad_dogrulamasi_dizin_kacisini_ve_yan_dosyalari_reddeder() {
        for kotu in [
            "../x",
            "a/b",
            "a\\b",
            "",
            ".gizli",
            "..",
            "x.json.bak",
            "x.json.tmp",
            "x.json.bak.tmp",
            "x.json.corrupt-1",
        ] {
            assert!(validate_name(kotu).is_err(), "reddedilmeli: {kotu}");
        }
        for iyi in ["game-store.json", "a_b.json", "x.json"] {
            assert!(validate_name(iyi).is_ok(), "geçmeli: {iyi}");
        }
    }

    #[test]
    fn nesne_olmayan_kayit_bozuk_sayilir() {
        assert!(parses_as_object(r#"{"a":1}"#));
        assert!(!parses_as_object("[1,2]"));
        assert!(!parses_as_object("42"));
        assert!(!parses_as_object("{yari"));
    }
}
