/**
 * Kodlanmış stem'lerin hizası. Vorbis çözücüsü tamponun başına ya da sonuna
 * örnek ekleyip çıkarabilir; bir örneklik kayma kulakta "faz" olarak duyulur
 * ve hiçbir yükseklik ölçüsü onu yakalamaz. Kayma ÖLÇÜLÜR: kaynak PCM ile
 * çözülmüş sinyal arasındaki çapraz korelasyonun tepesi 0 gecikmede olmalı.
 */
export const SYNC_METHOD = 'cross-correlation-v1';

/** Aranan en büyük kayma (örnek). Daha büyüğü hizasızlık değil, başka bir ses demektir. */
export const MAX_SYNC_LAG = 64;

/** Korelasyonun anlamlı sayılması için gereken en düşük enerji. */
const ENERGY_FLOOR = 1e-9;

function correlation(a: Float32Array, b: Float32Array, lag: number, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) {
    const ai = i + Math.max(0, -lag);
    const bi = i + Math.max(0, lag);
    if (ai >= a.length || bi >= b.length) break;
    sum += a[ai] * b[bi];
  }
  return sum;
}

/**
 * `candidate`in `reference`a göre gecikmesi (örnek). Pozitif değer adayın
 * GEÇ başladığını söyler. Sinyal sessizse 0 döner — sessizliğin hizası yoktur.
 */
export function crossCorrelationLag(
  reference: Float32Array,
  candidate: Float32Array,
  maxLag: number = MAX_SYNC_LAG,
): number {
  const length = Math.min(reference.length, candidate.length);
  let energy = 0;
  for (let i = 0; i < length; i++) energy += reference[i] * reference[i];
  if (energy < ENERGY_FLOOR) return 0;
  let bestLag = 0;
  let best = Number.NEGATIVE_INFINITY;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const value = correlation(reference, candidate, lag, length - Math.abs(lag));
    if (value > best) {
      best = value;
      bestLag = lag;
    }
  }
  return bestLag;
}

export interface StemSyncCheckV1 {
  readonly id: string;
  readonly lagSamples: number;
  readonly frameDelta: number;
  readonly ok: boolean;
  readonly detail: string;
}

/**
 * Bir stem'in kodlanmış hâli hizalı mı: çözülmüş uzunluk beklenen kare
 * sayısına eşit ve gecikme sıfır olmalı.
 */
export function checkStemSync(
  id: string,
  reference: Float32Array,
  decoded: Float32Array,
  expectedFrames: number,
): StemSyncCheckV1 {
  const lag = crossCorrelationLag(reference, decoded);
  const frameDelta = decoded.length - expectedFrames;
  const ok = lag === 0 && frameDelta === 0;
  return {
    id,
    lagSamples: lag,
    frameDelta,
    ok,
    detail: ok
      ? 'hizalı (gecikme 0, kare farkı 0)'
      : `gecikme ${lag} örnek, kare farkı ${frameDelta}`,
  };
}
