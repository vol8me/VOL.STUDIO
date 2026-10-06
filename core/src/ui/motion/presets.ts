/**
 * Hareket politikasının TEK KAYNAĞI (CONTRACT §4). Süreler, yumuşatma eğrileri,
 * adlandırılmış koreografi süreleri, etkileşim ölçekleri ve bütçe sınırları
 * burada durur; `core/scripts/gen-theme.mjs` bunlardan `--vol-motion-*` CSS
 * değişkenlerini üretir, `MotionController` aynı değerleri çalışma zamanında
 * kullanır. Bu dosya Node tarafından doğrudan yüklenir: düz sabitler, içe
 * aktarma yok. Yeni bir süre eklemek yeni bir adlı preset eklemektir; adsız
 * sayısal istisna yoktur.
 *
 * Yalnız UI DEKOR/GEÇİŞ süreleri bu politikanın konusudur. İşlevsel zamanlayıcılar
 * (basılı tutma, şarj, oyun sayacı), alan zaman aşımları ve genel `animateValue`
 * sayısal API'si bu tablonun dışındadır ve hareket azaltmayla sıfırlanmaz.
 */

/** Dört temel süre (ms). */
export const MOTION_DURATIONS = {
  fast: 120,
  base: 200,
  slow: 320,
  cinematic: 480,
} as const;

/** Yumuşatma eğrileri. */
export const MOTION_EASINGS = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  decelerate: 'cubic-bezier(0, 0, 0, 1)',
  accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
} as const;

/**
 * Adlandırılmış koreografi: dört temel tokenla çelişen sayılar gizli kalmasın
 * diye her özel süre adıyla burada durur.
 */
export const MOTION_PRESETS = {
  scrimIn: { ms: 120, easing: 'decelerate' },
  dialogIn: { ms: 200, easing: 'decelerate' },
  modalOut: { ms: 140, easing: 'accelerate' },
  cardStagger: { ms: 40, easing: 'standard' },
  hudGain: { ms: 200, easing: 'decelerate' },
  hudLoss: { ms: 80, easing: 'accelerate' },
  tabSwitch: { ms: 160, easing: 'standard', offsetPx: 6 },
  sceneOut: { ms: 200, easing: 'accelerate' },
  sceneIn: { ms: 320, easing: 'decelerate' },
} as const;

/** Etkileşim ölçekleri (başlangıç presetidir; bilgi hareketsiz de kalır). */
export const MOTION_INTERACTION = {
  hoverScale: 1.02,
  pressScale: 0.96,
  cardSelectScale: 1.04,
} as const;

/** UI kökü başına eşzamanlı sınırlar: semantik geçiş grubu, dekor parçacığı, etkin blur. */
export const MOTION_BUDGET = {
  groups: 3,
  particles: 64,
  blur: 1,
} as const;

/** Loading ekranı asgari görünür süresi: opt-in tarif kararıdır, bloklamayan içeriği bekletmez. */
export const LOADING_MIN_VISIBLE_MS = 500;

/** Animasyon olayı gelmese de temizliği tamamlayan emniyet payı (ms). */
export const MOTION_SAFETY_MARGIN_MS = 100;
