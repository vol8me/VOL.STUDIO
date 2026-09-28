/**
 * WebView'un YEREL menülerini kapatır: bağlam menüsü (sağ tık, uzun bas),
 * sürükleme hayaleti (resim/bağlantı). Oyun yüzeyinde bunların karşılığı
 * yoktur; Tauri kabuğu aynı davranışı her pencereye sayfa yüklenmeden önce
 * enjekte eder (`tauri-v2/src-tauri/src/native_menus.js`). Web hedefi bu
 * yardımcıyı çağırır.
 *
 * Metin alanları istisna DEĞİLDİR: kopyala-yapıştır menüsü istenmez. Seçim
 * yine de korunur — `input`/`textarea` dışında seçimi `base.css` kapatır.
 */
export function suppressNativeMenus(root: Document | HTMLElement = document): () => void {
  const onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  const onDragStart = (event: Event): void => {
    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) {
      return;
    }
    event.preventDefault();
  };

  root.addEventListener('contextmenu', onContextMenu);
  root.addEventListener('dragstart', onDragStart);
  return () => {
    root.removeEventListener('contextmenu', onContextMenu);
    root.removeEventListener('dragstart', onDragStart);
  };
}
