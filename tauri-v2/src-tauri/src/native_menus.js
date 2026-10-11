/*
 * VOL.STUDIO paylaşılan kabuk betiği — WebView'un yerel menülerini ve
 * tarayıcı kısayollarını susturur.
 * Her pencereye sayfa yüklenmeden önce enjekte edilir; web hedefinde aynı
 * davranışı `core/src/ui/nativeMenus.ts` verir ve karar orada belgelenir.
 *
 * Fare menüsü metin alanında da kapalıdır; dokunmada yerel seçim çubuğu kalır
 * (Android ActionMode). Seçim `input`/`textarea` dışında kapanır.
 */
(function () {
  // Düzenlenebilir alanda dokunma kaynaklı (ya da birincil işaretçisi dokunmatik cihazda) olay engellenmez:
  // engellenirse Android WebView seçim tutamaklarını gösterir ama Kes/Kopyala/Yapıştır çubuğunu açmaz.
  // Karar `core/src/ui/nativeMenus.ts` → `allowsNativeEditMenu` ile aynıdır (eşlik testli).
  function allowsNativeEditMenu(event) {
    var target = event.target;
    if (!(
      target &&
      target.closest &&
      target.closest('input, textarea, [contenteditable="true"]')
    )) {
      return false;
    }
    if (event.pointerType === 'touch' || event.pointerType === 'pen') return true;
    var capabilities = event.sourceCapabilities;
    if (capabilities && capabilities.firesTouchEvents === true) return true;
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  }

  function blockContextMenu(event) {
    if (allowsNativeEditMenu(event)) return;
    event.preventDefault();
  }

  function blockDragStart(event) {
    var target = event.target;
    if (target && target.closest && target.closest('input, textarea, [contenteditable="true"]')) {
      return;
    }
    event.preventDefault();
  }

  // Tarayıcı kısayolları: yazdırma, yenileme, bul, kaydet ve kaynak her yerde;
  // geri al/yinele/tümünü seç ve geri/ileri gezinmesi metin alanı dışında
  // kapanır. Olay oyuna yine ulaşır; yalnız tarayıcının varsayılanı durur.
  // Tablo `core/src/ui/nativeMenus.ts` ile aynıdır (eşlik testli).
  var ALWAYS_BLOCKED = ['p', 'r', 'f', 's', 'u', 'g', 'o'];
  var OUTSIDE_TEXT_BLOCKED = ['z', 'y', 'a'];

  function isEditable(target) {
    return !!(
      target &&
      target.closest &&
      target.closest('input, textarea, [contenteditable="true"]')
    );
  }

  function blockShortcut(event) {
    var key = (event.key || '').toLowerCase();
    var editable = isEditable(event.target);
    var blocked =
      key === 'f5' ||
      key === 'browserback' ||
      key === 'browserforward' ||
      (event.altKey && (key === 'arrowleft' || key === 'arrowright')) ||
      (!editable && key === 'backspace') ||
      ((event.ctrlKey || event.metaKey) &&
        (ALWAYS_BLOCKED.indexOf(key) >= 0 ||
          (!editable && OUTSIDE_TEXT_BLOCKED.indexOf(key) >= 0)));
    if (blocked) event.preventDefault();
  }

  document.addEventListener('contextmenu', blockContextMenu, true);
  document.addEventListener('dragstart', blockDragStart, true);
  document.addEventListener('keydown', blockShortcut, true);

  function injectStyle() {
    if (document.getElementById('vol-native-menu-block')) return;
    var style = document.createElement('style');
    style.id = 'vol-native-menu-block';
    style.textContent =
      'html,body{-webkit-touch-callout:none}' +
      '*:not(input, textarea){-webkit-user-select:none;user-select:none}';
    var parent = document.head || document.documentElement;
    if (parent) parent.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyle);
  } else {
    injectStyle();
  }
})();
