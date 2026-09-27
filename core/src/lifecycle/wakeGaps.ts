/**
 * Uyku/uyanma algısı.
 *
 * Cihaz uykuya girdiğinde zamanlayıcılar ve `performance.now` donar; duvar
 * saati (`Date.now`) saymaya devam eder. Kalp atışı aralığıyla iki saati
 * kıyaslayınca uyku süresi doğrudan okunur — bu, `suspend-gap` native
 * kaydının JS karşılığıdır ve `Date.now`u beklenen ilerleyişle değil yalnız
 * "dona kalmış mı" sorusu için kullanır: sıçrama uyku, sabit kalma normal
 * kare gecikmesidir.
 *
 * Uyanışta `onWake(gapMs)` çağrılır; tüketici (oyun) orada duraklama
 * durumunu ve kuyruklarını toparlar. Otomatik kayıt kuyruğu zaten
 * arka-plan sinyaliyle tetiklenir; bu olay onu uykudan sonra da çalıştırır.
 */
export interface WakeGapOptions {
  /** Kalp atışı aralığı; bu sürede timer koşamadıysa sistem uyumuş sayılır. */
  readonly heartbeatMs?: number;
  /** Bu eşiğin üzerindeki duvar-saati boşluğu uyanma sayılır. */
  readonly gapThresholdMs?: number;
  readonly onWake: (gapMs: number) => void;
  /** Testlerde saat enjeksiyonu; varsayılan `Date.now` + `setInterval`. */
  readonly now?: () => number;
  readonly setIntervalFn?: typeof setInterval;
  readonly clearIntervalFn?: typeof clearInterval;
}

const DEFAULT_HEARTBEAT_MS = 1_000;
const DEFAULT_GAP_THRESHOLD_MS = 1_500;

export function observeWakeGaps(options: WakeGapOptions): () => void {
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const thresholdMs = options.gapThresholdMs ?? DEFAULT_GAP_THRESHOLD_MS;
  const now = options.now ?? (() => Date.now());
  const setIv = options.setIntervalFn ?? setInterval;
  const clearIv = options.clearIntervalFn ?? clearInterval;

  let lastWall = now();
  const id = setIv(() => {
    const wall = now();
    // Timer donduysa wall-lastWall heartbeat'tan büyük çıkar.
    const gap = wall - lastWall - heartbeatMs;
    lastWall = wall;
    if (gap >= thresholdMs) options.onWake(gap + heartbeatMs);
  }, heartbeatMs);

  return () => clearIv(id);
}
