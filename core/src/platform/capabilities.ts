/**
 * Cihaz yetenek tespiti — "ekran üstü kontrolleri kurmalı mıyım?" sorusunun
 * ÖNCÜL cevabı.
 *
 * CORE'un girdi katmanı dokunmatiği bugüne kadar yalnızca REAKTİF olarak
 * ayırt ediyordu (`pointer.wasTouch`): bir olay geldiğinde onun dokunuş olup
 * olmadığı bilinir. Bu, girdiyi yönlendirmek için yeterli ama ARAYÜZ KURMAK
 * için değil — dash düğmesini ekrana koyup koymamaya ilk kareden önce karar
 * vermek gerekir ve o an henüz hiçbir olay gelmemiştir.
 *
 * **`matchMedia` neden tek başına yeterli değil?** `pointer: coarse` birincil
 * işaretçiyi anlatır; dokunmatik ekranlı bir dizüstünde birincil işaretçi
 * hâlâ `fine`dır. Bu yüzden "dokunmatik VAR MI" (`any-pointer: coarse` +
 * `maxTouchPoints`) ile "dokunmatik BİRİNCİL Mİ" (`pointer: coarse`) ayrı
 * sorular olarak tutulur; ekran üstü kontrol kararı ikincisine bakmalıdır,
 * yoksa dokunmatik ekranlı masaüstünde gereksiz düğmeler belirir.
 *
 * Fonksiyonlar SAFTIR ve her çağrıda yeniden ölçer; sonucu önbelleğe almak,
 * cihaz modu değiştiğinde (katlanabilir cihaz, çıkarılabilir klavye, tarayıcı
 * cihaz emülasyonu) yanlış cevabı kalıcı hâle getirirdi.
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

/**
 * BİRİNCİL işaretçi kaba mı — telefon/tablet `true`, fareli masaüstü `false`.
 *
 * Ekran üstü kontrolleri kurma kararı için doğru soru budur.
 */
export function isTouchPrimary(): boolean {
  return matches('(pointer: coarse)');
}

/** Cihaz gerçek bir hover üretebiliyor mu — hover'a bağlı ipuçları için. */
export function canHover(): boolean {
  return matches('(hover: hover)');
}

/**
 * Ekran üstü oyun kontrolleri (joystick, aksiyon düğmeleri) gösterilmeli mi.
 *
 * Birincil işaretçinin kaba olması VE hover üretememesi birlikte aranır:
 * dokunmatik ekranlı ama fareli bir cihazda oyuncu zaten klavye/fare
 * kullanıyordur ve ekranı kaplayan düğmeler zarar verir.
 */
export function shouldUseTouchControls(): boolean {
  return isTouchPrimary() && !canHover();
}
