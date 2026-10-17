import { blackmanHarris, powerSpectrum } from '../../src/analysis/spectrum';

/**
 * Test ölçümleri — kanonik analiz çekirdeğinin ÜSTÜNDE ince yardımcılar
 * (tepe izleme, periyot); spektrum hesabı paketin kendi `powerSpectrum`udur.
 */
export function peakFrequency(
  x: Float32Array,
  sampleRate: number,
  from = 0,
  size = 8192,
  band: readonly [number, number] = [20, sampleRate / 2],
): number {
  const power = powerSpectrum(x, from, size, blackmanHarris(size));
  const binHz = sampleRate / size;
  const lo = Math.max(1, Math.floor(band[0] / binHz));
  const hi = Math.min(power.length - 2, Math.ceil(band[1] / binHz));
  let best = lo;
  for (let k = lo; k <= hi; k++) if (power[k] > power[best]) best = k;
  const [a, b, c] = [power[best - 1], power[best], power[best + 1]].map((p) => Math.log(p + 1e-30));
  const offset = (a - c) / (2 * (a - 2 * b + c));
  return (best + (Number.isFinite(offset) ? offset : 0)) * binHz;
}

/** Kayan pencerede tepe frekansı izi. */
export function peakTrack(
  x: Float32Array,
  sampleRate: number,
  size: number,
  hop: number,
  band?: readonly [number, number],
): number[] {
  const out: number[] = [];
  for (let from = 0; from + size <= x.length; from += hop)
    out.push(peakFrequency(x, sampleRate, from, size, band));
  return out;
}

export function rms(x: Float32Array, from = 0, to = x.length): number {
  let energy = 0;
  for (let i = from; i < to; i++) energy += x[i] * x[i];
  return Math.sqrt(energy / Math.max(1, to - from));
}

/** Özilinti ile periyot → f0 (Hz); `[fmin, fmax]` arama bandı. */
export function autocorrelationPitch(
  x: Float32Array,
  sampleRate: number,
  from: number,
  size: number,
  fmin: number,
  fmax: number,
): number {
  const minLag = Math.floor(sampleRate / fmax);
  const maxLag = Math.ceil(sampleRate / fmin);
  let bestLag = minLag;
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = from; i < from + size; i++) sum += x[i] * x[i + lag];
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  return sampleRate / bestLag;
}

/** Spektral ağırlık merkezi (Hz) — bir pencerede. */
export function centroid(x: Float32Array, sampleRate: number, from = 0, size = 4096): number {
  const power = powerSpectrum(x, from, size, blackmanHarris(size));
  let total = 0;
  let weighted = 0;
  for (let k = 1; k < power.length; k++) {
    total += power[k];
    weighted += power[k] * ((k * sampleRate) / size);
  }
  return total > 0 ? weighted / total : 0;
}

export function isNonDecreasing(values: readonly number[], tolerance = 0): boolean {
  return values.every((v, i) => i === 0 || v >= values[i - 1] - tolerance);
}

export function isStrictlyMonotone(values: readonly number[], direction: 1 | -1): boolean {
  return values.every((v, i) => i === 0 || direction * (v - values[i - 1]) > 0);
}

/**
 * Harmonik-toplam perde tahmini: aday f için Σ log P(k·f), k = 1…8. Tek bir
 * güçlü çift harmonik (formant/tüp vurgusu) özilintiyi oktav yukarı, alt-harmonik
 * oktav aşağı kaydırabilir; harmonik toplamı bütün diziyi aynı anda sorar.
 * Ölçüm orta %60'lık bölümde, en çok 32768 örneklik tek FFT ile yapılır.
 */
export function harmonicPitch(x: Float32Array, sampleRate: number, lo: number, hi: number): number {
  const from = Math.floor(x.length * 0.2);
  let size = 32768;
  while (size > 1024 && size > x.length * 0.6) size >>= 1;
  const power = powerSpectrum(x, from, size, blackmanHarris(size));
  const binHz = sampleRate / size;
  const at = (f: number) => {
    const b = Math.round(f / binHz);
    return Math.max(power[b - 1] ?? 0, power[b] ?? 0, power[b + 1] ?? 0);
  };
  let best = lo;
  let bestScore = -Infinity;
  for (let f = lo; f <= hi; f += 0.25) {
    let score = 0;
    for (let k = 1; k <= 8 && k * f < sampleRate / 2 - binHz; k++)
      score += Math.log10(at(k * f) + 1e-20);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

/**
 * Darbe dizisinin tekrar hızı (Hz): 1 ms yumuşatılmış zarfın özilintisinde
 * en büyük değerin %90'ına ulaşan EN KÜÇÜK gecikme — 2T, 3T katları seçilmez.
 */
export function envelopeRate(x: Float32Array, sampleRate: number, lo: number, hi: number): number {
  const alpha = 1 - Math.exp(-1 / (0.001 * sampleRate));
  const step = Math.max(1, Math.round(sampleRate / 4000));
  const rate = sampleRate / step;
  const env: number[] = [];
  let state = 0;
  for (let i = 0; i < x.length; i++) {
    state += alpha * (Math.abs(x[i]) - state);
    if (i % step === 0) env.push(state);
  }
  const mean = env.reduce((a, v) => a + v, 0) / env.length;
  const minLag = Math.max(2, Math.floor(rate / hi));
  const maxLag = Math.min(env.length - 2, Math.ceil(rate / lo));
  const span = env.length - maxLag;
  const r = new Float64Array(maxLag + 1);
  let max = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < span; i++) sum += (env[i] - mean) * (env[i + lag] - mean);
    r[lag] = sum;
    max = Math.max(max, sum);
  }
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (r[lag] >= 0.9 * max && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) return rate / lag;
  }
  return rate / minLag;
}

/** Sabit f₀'lı sinyalde (k+½)·f₀ ile k·f₀ bantlarının güç oranı (alt-harmonik ölçüsü). */
export function interharmonicRatio(
  x: Float32Array,
  sampleRate: number,
  f0: number,
  count = 10,
): number {
  const size = 32768;
  const power = powerSpectrum(x, Math.floor(x.length * 0.2), size, blackmanHarris(size));
  const binHz = sampleRate / size;
  const around = (f: number) => {
    const b = Math.round(f / binHz);
    return power[b - 1] + power[b] + power[b + 1];
  };
  let inter = 0;
  let harmonic = 0;
  for (let k = 1; k <= count; k++) {
    harmonic += around(k * f0);
    inter += around((k + 0.5) * f0);
  }
  return inter / harmonic;
}
