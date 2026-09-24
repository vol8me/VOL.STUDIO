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

/**
 * Loop dikişi: çözülmüş asset döngüye girerken son örnekten ilk örneğe
 * geçiş, sinyalin kendi komşu-örnek adımlarından BÜYÜK olmamalı. Kodek
 * kenarında bir süreksizlik her turda tık olarak duyulur; hiza denetimi
 * (gecikme, kare sayısı) onu yakalamaz.
 */
export interface LoopSeamCheckV1 {
  readonly id: string;
  /** Dikişteki en büyük adım (kanallar arası). */
  readonly jump: number;
  /** Sinyalin komşu-örnek adımlarının %99.9 yüzdeliği. */
  readonly typicalStep: number;
  readonly ok: boolean;
  readonly detail: string;
}

/** Dikiş adımı tipik adımın bu katını aşarsa süreksizlik sayılır. */
export const SEAM_STEP_FACTOR = 2;
const SEAM_FLOOR = 1e-4;

function stepPercentile(channel: Float32Array, fraction: number): number {
  const steps = new Float32Array(Math.max(0, channel.length - 1));
  for (let i = 1; i < channel.length; i++) steps[i - 1] = Math.abs(channel[i] - channel[i - 1]);
  steps.sort();
  return steps.length ? steps[Math.min(steps.length - 1, Math.floor(fraction * steps.length))] : 0;
}

export function checkLoopSeam(id: string, decoded: readonly Float32Array[]): LoopSeamCheckV1 {
  let jump = 0;
  let typical = 0;
  for (const channel of decoded) {
    if (channel.length < 2) continue;
    jump = Math.max(jump, Math.abs(channel[0] - channel[channel.length - 1]));
    typical = Math.max(typical, stepPercentile(channel, 0.999));
  }
  const ok = jump <= Math.max(typical * SEAM_STEP_FACTOR, SEAM_FLOOR);
  return {
    id,
    jump: Number(jump.toFixed(6)),
    typicalStep: Number(typical.toFixed(6)),
    ok,
    detail: ok
      ? `dikiş sürekli (adım ${jump.toFixed(4)} ≤ ${SEAM_STEP_FACTOR}×${typical.toFixed(4)})`
      : `dikişte süreksizlik: adım ${jump.toFixed(4)}, tipik ${typical.toFixed(4)}`,
  };
}
