import { estimatePitch } from './descriptors';
import { blackmanHarris, powerSpectrum } from './spectrum';

/**
 * Perde kaydırma / zaman germe artefakt ölçümü — yöntemleri aynı fixture'da
 * sayıyla kıyaslamak için (insan dinlemesi ayrı canary'dedir):
 *
 * - `pitchRatio` / `lengthRatio`: YIN perdesi ve uzunluk oranı (beklenene göre).
 * - `harmonicity`: ölçülen f₀'ın ilk 12 harmoniği ±1 kutu içindeki güç /
 *   toplam güç (orta %60'lık bölüm). Faz vokoderinin "fazlılığı" ve WSOLA'nın
 *   çerçeve pürüzü bunu düşürür.
 * - `onsetSharpnessDb`: ilk 5 ms'deki en büyük 1 ms RMS ile sonraki 20 ms
 *   ortalamasının farkı; transient bulaşması bunu düşürür.
 */
export const STRETCH_QA_METHOD = 'stretch-qa-v1';

export interface StretchQualityV1 {
  readonly method: typeof STRETCH_QA_METHOD;
  readonly pitchRatio: number | null;
  readonly lengthRatio: number;
  readonly harmonicity: number | null;
  readonly onsetSharpnessDb: number;
}

function pitchOf(x: Float32Array, sampleRate: number): number | null {
  return estimatePitch([x], sampleRate, { minHz: 40, maxHz: 2000 }).hz;
}

export function harmonicity(x: Float32Array, sampleRate: number, f0: number): number {
  let size = 32768;
  while (size > 1024 && size > x.length * 0.6) size >>= 1;
  const power = powerSpectrum(x, Math.floor(x.length * 0.2), size, blackmanHarris(size));
  const bin = sampleRate / size;
  let total = 0;
  for (let k = 1; k < power.length; k++) total += power[k];
  let harmonic = 0;
  for (let h = 1; h <= 12 && h * f0 < sampleRate / 2 - 2 * bin; h++) {
    const center = Math.round((h * f0) / bin);
    for (let k = center - 2; k <= center + 2; k++) harmonic += power[k] ?? 0;
  }
  return total > 0 ? harmonic / total : 0;
}

export function onsetSharpnessDb(x: Float32Array, sampleRate: number): number {
  const ms = Math.max(1, Math.round(0.001 * sampleRate));
  const rms = (from: number, to: number) => {
    let e = 0;
    for (let i = from; i < Math.min(to, x.length); i++) e += x[i] * x[i];
    return Math.sqrt(e / Math.max(1, to - from));
  };
  let peak = 0;
  for (let at = 0; at + ms <= 5 * ms; at++) peak = Math.max(peak, rms(at, at + ms));
  const body = rms(5 * ms, 25 * ms);
  return 20 * Math.log10((peak + 1e-12) / (body + 1e-12));
}

/**
 * Beklenen konumun ±30 ms'inde en güçlü 1 ms'yi bulup atak keskinliğini
 * oradan ölçer — gerilmiş çıktıda atağın birkaç ms kayması ölçümü
 * sessizliğe düşürmesin (ilk sürüm hizasız ölçümde −224 dB veriyordu).
 */
export function onsetSharpnessAt(y: Float32Array, sampleRate: number, seconds: number): number {
  const ms = Math.max(1, Math.round(0.001 * sampleRate));
  const center = Math.round(seconds * sampleRate);
  const reach = Math.round(0.03 * sampleRate);
  let best = center;
  let bestEnergy = -1;
  for (let at = Math.max(0, center - reach); at < center + reach; at += Math.max(1, ms >> 1)) {
    let e = 0;
    for (let i = at; i < at + ms; i++) e += (y[i] ?? 0) ** 2;
    if (e > bestEnergy) {
      bestEnergy = e;
      best = at;
    }
  }
  return onsetSharpnessDb(y.subarray(Math.max(0, best - 2 * ms)), sampleRate);
}

export function stretchQuality(
  reference: Float32Array,
  processed: Float32Array,
  sampleRate: number,
): StretchQualityV1 {
  const before = pitchOf(reference, sampleRate);
  const after = pitchOf(processed, sampleRate);
  return {
    method: STRETCH_QA_METHOD,
    pitchRatio: before && after ? after / before : null,
    lengthRatio: processed.length / reference.length,
    harmonicity: after ? harmonicity(processed, sampleRate, after) : null,
    onsetSharpnessDb: onsetSharpnessDb(processed, sampleRate),
  };
}
