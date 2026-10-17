/**
 * WebView'un YEREL menülerini ve tarayıcı kısayollarını kapatır: bağlam
 * menüsü (sağ tık, uzun bas), sürükleme hayaleti (resim/bağlantı), yazdırma,
 * yenileme, geri/ileri gibi kısayollar. Oyun yüzeyinde bunların karşılığı
 * yoktur; Tauri kabuğu aynı davranışı her pencereye sayfa yüklenmeden önce
 * enjekte eder (`tauri-v2/src-tauri/src/native_menus.js`). Web hedefi bu
 * yardımcıyı çağırır.
 *
 * Metin alanlarında fare menüsü istenmez (yerine `installEditMenu`), ama DOKUNMADA yerel seçim
 * çubuğu kalır: bkz. `allowsNativeEditMenu`. Seçim `input`/`textarea` dışında `base.css` ile kapalıdır.
 */
/** Her yerde kapalı Ctrl/⌘ kısayolları: yazdır, yenile, bul, kaydet, kaynak, git, aç. */
const ALWAYS_BLOCKED_SHORTCUTS: readonly string[] = ['p', 'r', 'f', 's', 'u', 'g', 'o'];
/** Metin alanı dışında kapalı Ctrl/⌘ kısayolları: geri al, yinele, tümünü seç. */
const OUTSIDE_TEXT_BLOCKED_SHORTCUTS: readonly string[] = ['z', 'y', 'a'];

const EDITABLE = 'input, textarea, [contenteditable="true"]';

/**
 * Tarayıcının varsayılan eylemi olan kısayol mu? Olay oyuna yine ulaşır;
 * yalnız varsayılanı durdurulur. Kabuk betiği aynı tabloyu taşır.
 */
export function isBlockedShortcut(event: KeyboardEvent, editable: boolean): boolean {
  const key = event.key.toLowerCase();
  if (key === 'f5' || key === 'browserback' || key === 'browserforward') return true;
  if (event.altKey && (key === 'arrowleft' || key === 'arrowright')) return true;
  if (!editable && key === 'backspace') return true;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (ALWAYS_BLOCKED_SHORTCUTS.includes(key)) return true;
  return !editable && OUTSIDE_TEXT_BLOCKED_SHORTCUTS.includes(key);
}

/**
 * Dokunma/kalem kaynaklı bağlam menüsü olayı mı (uzun basış, seçim). Chromium `contextmenu`u `PointerEvent`
 * olarak verir (`pointerType`); eski sürümlerde `sourceCapabilities.firesTouchEvents` okunur.
 */
export function isTouchContextMenu(event: Event): boolean {
  const pointerType = (event as Partial<PointerEvent>).pointerType;
  if (pointerType === 'touch' || pointerType === 'pen') return true;
  const capabilities = (event as { sourceCapabilities?: { firesTouchEvents?: boolean } })
    .sourceCapabilities;
  return capabilities?.firesTouchEvents === true;
}

/**
 * Yerel seçim çubuğuna (Android ActionMode: Kes/Kopyala/Yapıştır) izin verilen olay mı: düzenlenebilir alanda
 * dokunma kaynaklı, ya da birincil işaretçisi dokunmatik cihazda. `contextmenu`un varsayılanı engellenirse
 * WebView seçim tutamaklarını gösterir ama eylem çubuğunu açmaz (UI-11.3, gerçek cihazda ölçüldü). Fare sağ
 * tıkı ve düzenlenemeyen yüzeyler (oyun tuvali) engellenmeye devam eder; fare için çekirdeğin kendi
 * `installEditMenu` menüsü vardır.
 */
export function allowsNativeEditMenu(event: Event): boolean {
  const target = event.target;
  if (!(target instanceof Element) || target.closest(EDITABLE) === null) return false;
  if (isTouchContextMenu(event)) return true;
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

export function suppressNativeMenus(root: Document | HTMLElement = document): () => void {
  const onContextMenu = (event: Event): void => {
    if (allowsNativeEditMenu(event)) return;
    event.preventDefault();
  };

  const onDragStart = (event: Event): void => {
    const target = event.target;
    if (target instanceof Element && target.closest(EDITABLE)) {
      return;
    }
    event.preventDefault();
  };

  const onKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) return;
    const target = event.target;
    const editable = target instanceof Element && target.closest(EDITABLE) !== null;
    if (isBlockedShortcut(event, editable)) event.preventDefault();
  };

  // Kabuk betiği gibi yakalama evresinde: alt öğenin propagation'ı durdurması
  // varsayılanın durdurulmasını engellemez.
  root.addEventListener('contextmenu', onContextMenu, true);
  root.addEventListener('dragstart', onDragStart, true);
  root.addEventListener('keydown', onKeyDown, true);
  return () => {
    root.removeEventListener('contextmenu', onContextMenu, true);
    root.removeEventListener('dragstart', onDragStart, true);
    root.removeEventListener('keydown', onKeyDown, true);
  };
}
