//! WebView yerel menülerinin paylaşılan susturucusu.
//!
//! WebKitGTK, sağ tıkta ve uzun basışta kendi bağlam menüsünü açar
//! ("Yazdır / Geri / Yenile") ve resim/bağlantı sürüklemesinde hayalet
//! gösterir; hiçbirinin oyun yüzeyinde karşılığı yoktur. Betik her pencereye
//! SAYFA YÜKLENMEDEN önce enjekte edilir: `js_init_script` kullanan bir
//! eklenti, uygulamanın `tauri.conf.json`dan ürettiği pencere dahil bütün
//! webview'lara uygulanır ve yeni oyunlar bunu kendiliğinden alır.
//!
//! Karar ve web hedefi karşılığı: `core/src/ui/nativeMenus.ts`.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;

const INIT_SCRIPT: &str = include_str!("native_menus.js");

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("vol-native-menus")
        .js_init_script(INIT_SCRIPT)
        .build()
}

#[cfg(test)]
mod tests {
    use super::INIT_SCRIPT;

    #[test]
    fn betik_baglam_menusu_ve_suruklemeyi_kapatir() {
        assert!(INIT_SCRIPT.contains("contextmenu"));
        assert!(INIT_SCRIPT.contains("dragstart"));
    }

    #[test]
    fn betik_metin_alanlarini_secebilir_birakir() {
        assert!(INIT_SCRIPT.contains("input, textarea"));
        assert!(INIT_SCRIPT.contains("user-select:none"));
    }
}
