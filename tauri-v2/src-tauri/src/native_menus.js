/*
 * VOL.STUDIO paylaşılan kabuk betiği — WebView'un yerel menülerini susturur.
 * Her pencereye sayfa yüklenmeden önce enjekte edilir; web hedefinde aynı
 * davranışı `core/src/ui/nativeMenus.ts` verir ve karar orada belgelenir.
 *
 * Metin alanları istisna değildir (kopyala menüsü istenmez) ama seçim
 * `input`/`textarea` dışında kapanır; yazılan metin seçilebilir kalır.
 */
(function () {
  function blockContextMenu(event) {
    event.preventDefault();
  }

  function blockDragStart(event) {
    var target = event.target;
    if (target && target.closest && target.closest('input, textarea, [contenteditable="true"]')) {
      return;
    }
    event.preventDefault();
  }

  document.addEventListener('contextmenu', blockContextMenu, true);
  document.addEventListener('dragstart', blockDragStart, true);

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
