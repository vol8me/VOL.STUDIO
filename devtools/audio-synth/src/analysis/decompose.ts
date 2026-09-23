import { fft } from './spectrum';

/**
 * Transient / gövde ayrıştırması — harmonik-perküsif ayrıştırma (HPSS,
 * Fitzgerald 2010, "Harmonic/percussive separation using median filtering"):
 * STFT büyüklüğü ZAMANDA medyan süzülünce sürekli (gövde), FREKANSTA medyan
 * süzülünce kısa-geniş bant (transient) bileşen öne çıkar; Wiener tipi yumuşak
 * maskeler (p = 2) toplamı koruyarak iki sinyale böler.
 *
 * Araç SESSİZCE kötü sonuç vermez: başlangıç yoksa, transient bileşeninin
 * tepesi orijinal tepenin %20'sinden azsa (ayrılan atak yok), transient
 * zamanda yayılmışsa (10 ms RMS tepe/medyan < 12 dB — durağan gürültüde HPSS
 * iki gürültü üretir, ölçüldü), gövde enerjinin
 * %2'sinden azsa (değiştirilecek gövde yok) ya da yeniden kurulum hatası
 * −30 dB'den kötüyse `status: 'failed'` ve adlı gerekçe döner. Atak için
 * enerji payı değil TEPE oranı sorulur: çınlayan bir darbede enerjinin çoğu
 * gövdededir, 1 ms'lik tam genlikli atak enerji payında görünmez (ölçüldü:
 * metal–metal temasta %0.06).
 */
export const DECOMPOSE_METHOD = 'hpss-median-v1';

export interface DecompositionV1 {
  readonly method: typeof DECOMPOSE_METHOD;
  readonly status: 'ok' | 'failed';
  readonly reason: string | null;
  readonly transient: Float32Array;
  readonly body: Float32Array;
  readonly metrics: {
    readonly transientEnergyRatio: number;
    readonly bodyEnergyRatio: number;
    readonly reconstructionErrorDb: number;
    /** Transient bileşenin tepe örneği (−1: yok). */
    readonly transientPeakFrame: number;
    /** Transient tepesi / orijinal tepe. */
    readonly transientPeakRatio: number;
    /** Transient bileşeninin 10 ms RMS tepe / medyan oranı (dB): atak zamanda toplanmış mı. */
    readonly transientConcentrationDb: number;
  };
}

const SIZE = 1024;
const HOP = 256;
const KERNEL = 17;

function median(values: Float64Array): number {
  const sorted = Float64Array.from(values).sort();
  return sorted[sorted.length >> 1];
}

function energy(x: Float32Array): number {
  let e = 0;
  for (const v of x) e += v * v;
  return e;
}

/** En büyük enerji sıçramasının örneği (10 ms pencerede 4× artış); yoksa −1. */
function firstOnset(x: Float32Array, sampleRate: number): number {
  const win = Math.max(8, Math.round(0.005 * sampleRate));
  let previous = 0;
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  for (let start = 0; start + win <= x.length; start += win) {
    let e = 0;
    for (let i = start; i < start + win; i++) e += x[i] * x[i];
    if (e > 4 * previous + 1e-9 && Math.sqrt(e / win) > 0.05 * peak) return start;
    previous = e;
  }
  return -1;
}

/**
 * 10 ms RMS pencerelerinin en büyüğü / BÜTÜN pencerelerin medyanı (dB):
 * atak sinyal süresine göre zamanda toplanmış mı. Medyan yalnız etkin
 * pencerelerden alınırsa sessizlikteki izole tık "yayılmış" görünür (ölçüldü).
 */
function concentrationDb(x: Float32Array, sampleRate: number): number {
  const win = Math.max(8, Math.round(0.01 * sampleRate));
  const values: number[] = [];
  for (let at = 0; at + win <= x.length; at += win) {
    let e = 0;
    for (let i = at; i < at + win; i++) e += x[i] * x[i];
    values.push(Math.sqrt(e / win));
  }
  const peak = Math.max(...values, 0);
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1] ?? 0;
  if (peak <= 0) return 0;
  return median > peak * 1e-6 ? 20 * Math.log10(peak / median) : 120;
}

export function decomposeTransient(x: Float32Array, sampleRate: number): DecompositionV1 {
  const frames = Math.max(1, Math.ceil((x.length + SIZE) / HOP));
  const bins = SIZE / 2 + 1;
  const window = Float64Array.from(
    { length: SIZE },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / SIZE),
  );
  const specRe: Float64Array[] = [];
  const specIm: Float64Array[] = [];
  const mag: Float64Array[] = [];
  const re = new Float64Array(SIZE);
  const im = new Float64Array(SIZE);
  for (let f = 0; f < frames; f++) {
    const start = f * HOP - SIZE / 2;
    for (let n = 0; n < SIZE; n++) {
      const i = start + n;
      re[n] = (i >= 0 && i < x.length ? x[i] : 0) * window[n];
      im[n] = 0;
    }
    fft(re, im);
    specRe.push(re.slice(0, bins));
    specIm.push(im.slice(0, bins));
    mag.push(Float64Array.from({ length: bins }, (_, k) => Math.hypot(re[k], im[k])));
  }
  const half = KERNEL >> 1;
  const scratch = new Float64Array(KERNEL);
  const transient = new Float64Array(x.length + SIZE);
  const body = new Float64Array(x.length + SIZE);
  const norm = new Float64Array(x.length + SIZE);
  for (let f = 0; f < frames; f++) {
    const maskP = new Float64Array(bins);
    for (let k = 0; k < bins; k++) {
      for (let j = -half; j <= half; j++)
        scratch[j + half] = mag[Math.min(frames - 1, Math.max(0, f + j))][k];
      const harmonic = median(scratch);
      for (let j = -half; j <= half; j++)
        scratch[j + half] = mag[f][Math.min(bins - 1, Math.max(0, k + j))];
      const percussive = median(scratch);
      const h2 = harmonic * harmonic;
      const p2 = percussive * percussive;
      maskP[k] = h2 + p2 > 0 ? p2 / (h2 + p2) : 0.5;
    }
    for (const [target, weight] of [
      [transient, (k: number) => maskP[k]],
      [body, (k: number) => 1 - maskP[k]],
    ] as const) {
      for (let k = 0; k < bins; k++) {
        const w = weight(k);
        re[k] = specRe[f][k] * w;
        im[k] = -specIm[f][k] * w;
        if (k > 0 && k < bins - 1) {
          re[SIZE - k] = re[k];
          im[SIZE - k] = -im[k];
        }
      }
      fft(re, im);
      const start = f * HOP;
      for (let n = 0; n < SIZE; n++) target[start + n] += (re[n] / SIZE) * window[n];
    }
    for (let n = 0; n < SIZE; n++) norm[f * HOP + n] += window[n] * window[n];
  }
  const offset = SIZE / 2;
  const t = new Float32Array(x.length);
  const b = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const n = norm[i + offset] > 1e-9 ? norm[i + offset] : 1;
    t[i] = transient[i + offset] / n;
    b[i] = body[i + offset] / n;
  }
  const total = energy(x) || 1e-30;
  let error = 0;
  for (let i = 0; i < x.length; i++) error += (x[i] - t[i] - b[i]) ** 2;
  let peakFrame = -1;
  let peak = 0;
  for (let i = 0; i < t.length; i++) {
    if (Math.abs(t[i]) > peak) {
      peak = Math.abs(t[i]);
      peakFrame = i;
    }
  }
  let sourcePeak = 0;
  for (const v of x) sourcePeak = Math.max(sourcePeak, Math.abs(v));
  const metrics = {
    transientConcentrationDb: concentrationDb(t, sampleRate),
    transientPeakRatio: sourcePeak > 0 ? peak / sourcePeak : 0,
    transientEnergyRatio: energy(t) / total,
    bodyEnergyRatio: energy(b) / total,
    reconstructionErrorDb: 10 * Math.log10(error / total + 1e-30),
    transientPeakFrame: peakFrame,
  };
  const reason =
    firstOnset(x, sampleRate) < 0
      ? 'başlangıç (transient) bulunamadı'
      : metrics.transientPeakRatio < 0.2
      ? 'transient bileşeninin tepesi orijinalin %20’sinden az (ayrılan atak yok)'
      : metrics.transientConcentrationDb < 12
      ? 'transient bileşeni zamanda yayılmış (durağan içerik; belirgin atak yok)'
      : metrics.bodyEnergyRatio < 0.02
      ? 'gövde bileşeni enerjinin %2’sinden az'
      : metrics.reconstructionErrorDb > -30
      ? 'yeniden kurulum hatası −30 dB’den kötü'
      : null;
  return {
    method: DECOMPOSE_METHOD,
    status: reason ? 'failed' : 'ok',
    reason,
    transient: t,
    body: b,
    metrics,
  };
}
