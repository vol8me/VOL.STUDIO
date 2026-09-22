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
