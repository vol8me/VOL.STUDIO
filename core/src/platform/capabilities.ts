/**
 * Cihaz yeteneği — arayüz kurulmadan ÖNCE cevaplanır. `pointer.wasTouch`
 * reaktiftir; ekran üstü düğme kararı ise ilk kareden önce, hiç olay yokken
 * verilir.
 *
 * "Dokunmatik VAR MI" ile "BİRİNCİL Mİ" ayrı sorulardır: dokunmatik ekranlı
 * dizüstünde birincil işaretçi hâlâ `fine`dır. Her çağrıda yeniden ölçülür;
 * önbellek, katlanabilir cihazda yanlış cevabı kalıcı yapardı.
 */

/** SSR/Node/test ortamlarında `window` yoktur; tespit sessizce `false` döner. */
function canQuery(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

function matches(query: string): boolean {
  if (!canQuery()) return false;
  return window.matchMedia(query).matches;
}

/** Cihazda dokunmatik bir giriş YOLU var mı (birincil olmak zorunda değil). */
export function hasTouchInput(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number') {
    if (navigator.maxTouchPoints > 0) return true;
  }
  return matches('(any-pointer: coarse)');
}

/** BİRİNCİL işaretçi kaba mı — telefon/tablet `true`, fareli masaüstü `false`. */
export function isTouchPrimary(): boolean {
  return matches('(pointer: coarse)');
}

/** Cihaz gerçek bir hover üretebiliyor mu — hover'a bağlı ipuçları için. */
export function canHover(): boolean {
  return matches('(hover: hover)');
}

/**
 * Kaba işaretçi VE hover yokluğu birlikte aranır: dokunmatik ekranlı ama
 * fareli bir cihazda oyuncu klavye/fare kullanır, ekranı kaplayan düğme zarar verir.
 */
export function shouldUseTouchControls(): boolean {
  return isTouchPrimary() && !canHover();
}
