import { createRandom } from '@volstudio/core/random';
import { StateVariableFilter } from '../../synthesis/svf';
import { getWaveSampleWithPhase } from '../../synthesis/waveforms';

/**
 * Davul modellerinin yapı taşları: perde zarflı gövde, süzülmüş gürültü,
 * vuruş tıkı ve metalik osilatör kümesi. Her bileşen iç oranda, kendi
 * genlik zarfıyla ÇIKIŞA EKLER; karışım ve normalizasyon modelin işidir.
 */

/** −60 dB'ye kadar geçen süre üstel sabitin katı (ln 1000). */
export const T60_PER_TAU = 6.908;

/** 0–1 makroyu üstel olarak [lo, hi] aralığına açar (zaman ve frekans için). */
export function span(x: number, lo: number, hi: number): number {
  return lo * Math.pow(hi / lo, x);
}

/** Tık bastırma rampası: 0.5 ms'lik doğrusal atak. */
const ONSET_SECONDS = 0.0005;

function onset(t: number): number {
  return t < ONSET_SECONDS ? t / ONSET_SECONDS : 1;
}

export interface BodyMode {
  /** Temel frekansa oran (membran kipleri harmonik değildir). */
  readonly ratio: number;
  readonly gain: number;
  /** Kipin sönüm sabiti gövdeninkinin bu katı (üst kipler daha çabuk söner). */
  readonly tauScale?: number;
}

export interface BodySpec {
  readonly frequency: number;
  readonly modes: readonly BodyMode[];
  /** Başlangıç perde çarpanı: f(t) = f0·(1 + depth·e^(−t/τp)). */
  readonly pitchDepth: number;
  readonly pitchTau: number;
  readonly ampTau: number;
  readonly gain: number;
}

/** Perde zarflı sinüs kipleri; faz birikimlidir (perde değişirken doğru frekans). */
export function addBody(out: Float32Array, rate: number, spec: BodySpec): void {
  const phases = new Float64Array(spec.modes.length);
  const taus = spec.modes.map((mode) => spec.ampTau * (mode.tauScale ?? 1));
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    const bend = 1 + spec.pitchDepth * Math.exp(-t / spec.pitchTau);
    let sum = 0;
    for (let m = 0; m < spec.modes.length; m++) {
      const mode = spec.modes[m];
      const f = spec.frequency * mode.ratio * bend;
      if (f < rate * 0.45) {
        sum += mode.gain * Math.exp(-t / taus[m]) * Math.sin(2 * Math.PI * phases[m]);
      }
      phases[m] = (phases[m] + f / rate) % 1;
    }
    out[i] += spec.gain * onset(t) * sum;
  }
}

export interface NoiseSpec {
  readonly seed: number;
  /** Yüksek geçiren kesim (Hz) ve isteğe bağlı bant geçiren merkez/Q. */
  readonly highpassHz: number;
  readonly band: { readonly hz: number; readonly q: number } | null;
  readonly lowpassHz: number | null;
  readonly attackSeconds: number;
  readonly ampTau: number;
  readonly delaySeconds: number;
  readonly gain: number;
}

/** Tohumlu beyaz gürültü → yüksek/bant/alçak geçiren → üstel sönüm. */
export function addNoise(out: Float32Array, rate: number, spec: NoiseSpec): void {
  const random = createRandom(spec.seed);
  const hp = new StateVariableFilter(rate);
  const bp = new StateVariableFilter(rate);
  const lp = new StateVariableFilter(rate);
  const start = Math.floor(spec.delaySeconds * rate);
  for (let i = start; i < out.length; i++) {
    const t = (i - start) / rate;
    let x = hp.highpass(random.bipolar(), spec.highpassHz);
    if (spec.band) x = bp.bandpass(x, spec.band.hz, spec.band.q);
    if (spec.lowpassHz !== null) x = lp.lowpass(x, spec.lowpassHz);
    const rise = spec.attackSeconds > 0 ? Math.min(1, t / spec.attackSeconds) : onset(t);
    out[i] += spec.gain * rise * Math.exp(-t / spec.ampTau) * x;
  }
}

/**
 * Metalik kaynak: harmonik OLMAYAN oranlarda kare osilatörler (analog hat/zil
 * devrelerinin yapısı). Kareler PolyBLEP'lidir; toplamın parlaklığı çağıranın
 * bant süzgecinden gelir.
 */
export function metallic(
  length: number,
  rate: number,
  frequencies: readonly number[],
): Float32Array {
  const out = new Float32Array(length);
  const phases = frequencies.map((_, i) => (i * 0.137) % 1);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let k = 0; k < frequencies.length; k++) {
      const inc = frequencies[k] / rate;
      sum += getWaveSampleWithPhase('square', phases[k], 0.5, inc);
      phases[k] = (phases[k] + inc) % 1;
    }
    out[i] = sum / frequencies.length;
  }
  return out;
}

export interface FilterChain {
  readonly highpassHz: number;
  readonly band: { readonly hz: number; readonly q: number } | null;
}

export function addFiltered(
  out: Float32Array,
  source: Float32Array,
  rate: number,
  chain: FilterChain,
  envelope: (t: number) => number,
  gain: number,
): void {
  const hp = new StateVariableFilter(rate);
  const bp = new StateVariableFilter(rate);
  for (let i = 0; i < out.length; i++) {
    let x = hp.highpass(source[i], chain.highpassHz);
    if (chain.band) x = bp.bandpass(x, chain.band.hz, chain.band.q);
    out[i] += gain * envelope(i / rate) * x;
  }
}

/** Tanh doygunluğu, 1 birimlik girişte 1 çıkış verecek biçimde ölçeklenir. */
export function saturate(buffer: Float32Array, drive: number): void {
  if (drive <= 0) return;
  const k = 1 + 8 * drive;
  const norm = 1 / Math.tanh(k);
  for (let i = 0; i < buffer.length; i++) buffer[i] = Math.tanh(k * buffer[i]) * norm;
}

/** Tepe değeri `level`e getirir; sessiz tampon olduğu gibi kalır. */
export function normalizePeak(buffer: Float32Array, level: number): void {
  let peak = 0;
  for (const v of buffer) peak = Math.max(peak, Math.abs(v));
  if (peak <= 0) return;
  const g = level / peak;
  for (let i = 0; i < buffer.length; i++) buffer[i] *= g;
}
