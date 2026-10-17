/**
 * `AudioAnalysisReportV1`e GİRMEYEN, istek üzerine hesaplanan betimleyiciler
 * (aile kalitesi, mekanik denetimler, canary'ler). Rapor şemasına eklenmedikleri
 * için analizör sürümü ve yayımlanmış manifest'ler değişmez; her biri kendi
 * yöntem kimliğini taşır.
 *
 * Perde, spektral tepe DEĞİLDİR: gürültü, darbe, kabarcık ve harmonik olmayan
 * modlarda en büyük FFT tepesi perde anlamı taşımaz. Perde yalnız YIN
 * periyodiklik ölçüsü güvenilirse verilir, aksi hâlde `null`dur.
 */
export const PITCH_METHOD = 'yin-v1';
export const ONSET_METHOD = 'energy-jump-v1';
export const PULSE_METHOD = 'envelope-autocorrelation-v1';

function mono(
  channels: readonly Float32Array[],
  from = 0,
  to = channels[0]?.length ?? 0,
): Float64Array {
  const out = new Float64Array(Math.max(0, to - from));
  for (const channel of channels) {
    for (let i = from; i < to; i++) out[i - from] += channel[i] / channels.length;
  }
  return out;
}

export interface PitchEstimate {
  readonly method: typeof PITCH_METHOD;
  /** Sesli pencerelerin medyan f₀'ı; güvenilir değilse `null`. */
  readonly hz: number | null;
  /** [0, 1]: sesli pencere oranı × (1 − medyan aperiyodiklik). */
  readonly confidence: number;
  readonly voicedFraction: number;
  readonly frames: number;
}

export interface PitchOptions {
  readonly minHz?: number;
  readonly maxHz?: number;
  /** Örnek aralığı (varsayılan: bütün sinyal). */
  readonly from?: number;
  readonly to?: number;
}

const YIN_THRESHOLD = 0.15;
/**
 * Eşik altı dip yoksa: global minimum 0.35 üstündeyse pencere perdesizdir;
 * değilse global minimuma 0.1 yakın EN KÜÇÜK gecikmeli yerel dip seçilir
 * (katlarına düşen oktav hatasının klasik önlemi).
 */
const YIN_FALLBACK = 0.35;
const OCTAVE_TOLERANCE = 0.1;
/** Tek ya da iki pencereden perde verilmez (kısa geçişte savunulamaz). */
const MIN_ACTIVE_FRAMES = 3;
const MAX_FRAMES = 40;
const VOICED_MINIMUM = 0.5;

function decimate(x: Float64Array, factor: number): Float64Array {
  if (factor <= 1) return x;
  const out = new Float64Array(Math.floor(x.length / factor));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let k = 0; k < factor; k++) sum += x[i * factor + k];
    out[i] = sum / factor;
  }
  return out;
}

/** Tek pencerede YIN (de Cheveigné & Kawahara 2002): CMNDF + mutlak eşik + parabol. */
function yinFrame(x: Float64Array, start: number, window: number, minLag: number, maxLag: number) {
  const d = new Float64Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let sum = 0;
    for (let j = start; j < start + window; j++) {
      const diff = x[j] - x[j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  let running = 0;
  const cmnd = new Float64Array(maxLag + 1);
  cmnd[0] = 1;
  for (let tau = 1; tau <= maxLag; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  let best = -1;
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (cmnd[tau] < YIN_THRESHOLD) {
      while (tau + 1 <= maxLag && cmnd[tau + 1] < cmnd[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    let min = Infinity;
    for (let tau = minLag; tau <= maxLag; tau++) min = Math.min(min, cmnd[tau]);
    if (!(min < YIN_FALLBACK)) return { lag: null, aperiodicity: Math.min(1, min) };
    for (let tau = minLag; tau <= maxLag; tau++) {
      const local =
        cmnd[tau] <= (cmnd[tau - 1] ?? Infinity) && cmnd[tau] <= (cmnd[tau + 1] ?? Infinity);
      if (local && cmnd[tau] <= min + OCTAVE_TOLERANCE) {
        best = tau;
        break;
      }
    }
  }
  const a = cmnd[best - 1] ?? cmnd[best];
  const b = cmnd[best];
  const c = cmnd[best + 1] ?? cmnd[best];
  const denominator = a - 2 * b + c;
  const shift = denominator !== 0 ? (a - c) / (2 * denominator) : 0;
  return { lag: best + Math.max(-0.5, Math.min(0.5, shift)), aperiodicity: b };
}

/**
 * Güven puanlı perde. Sinyal ~16 kHz'e indirgenir, en çok 40 pencere eşit
 * aralıkla (en sık çeyrek pencere) seçilir; sessiz pencereler (en güçlüsünün
 * −40 dB altı) hesaba katılmaz. Üçten az aktif pencere ya da aktiflerin
 * yarısından azı sesliyse `hz = null`.
 */
export function estimatePitch(
  channels: readonly Float32Array[],
  sampleRate: number,
  options: PitchOptions = {},
): PitchEstimate {
  const minHz = options.minHz ?? 50;
  const maxHz = options.maxHz ?? 1000;
  const factor = Math.max(1, Math.floor(sampleRate / 16000));
  const rate = sampleRate / factor;
  const x = decimate(mono(channels, options.from, options.to), factor);
  const maxLag = Math.ceil(rate / minHz);
  const minLag = Math.max(2, Math.floor(rate / maxHz));
  const window = 2 * maxLag;
  const span = x.length - window - maxLag - 1;
  const none = {
    method: PITCH_METHOD,
    hz: null,
    confidence: 0,
    voicedFraction: 0,
    frames: 0,
  } as const;
  if (span <= 0) return none;
  const count = Math.min(MAX_FRAMES, Math.max(1, Math.floor(span / (window / 4))));
  const starts = Array.from({ length: count }, (_, k) =>
    Math.round((k * span) / Math.max(1, count - 1)),
  );
  const energy = starts.map((s) => {
    let e = 0;
    for (let j = s; j < s + window; j++) e += x[j] * x[j];
    return e;
  });
  const loudest = Math.max(...energy);
  const active = starts.filter((_, k) => loudest > 0 && energy[k] >= loudest * 1e-4);
  if (active.length < MIN_ACTIVE_FRAMES) return { ...none, frames: active.length };
  const voiced: { hz: number; aperiodicity: number }[] = [];
  for (const start of active) {
    const frame = yinFrame(x, start, window, minLag, maxLag);
    if (frame.lag !== null) voiced.push({ hz: rate / frame.lag, aperiodicity: frame.aperiodicity });
  }
  const voicedFraction = voiced.length / active.length;
  if (voicedFraction < VOICED_MINIMUM) return { ...none, voicedFraction, frames: active.length };
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  return {
    method: PITCH_METHOD,
    hz: median(voiced.map((v) => v.hz)),
    confidence: voicedFraction * (1 - median(voiced.map((v) => v.aperiodicity))),
    voicedFraction,
    frames: active.length,
  };
}

export interface OnsetCount {
  readonly method: typeof ONSET_METHOD;
  readonly count: number;
  readonly perSecond: number;
}

/**
 * Olay başlangıcı sayısı: 10 ms enerji penceresi 2.5 ms adımla kayar; en
 * güçlü pencerenin −40 dB üstünde, son 10 ms'nin en düşük enerjisinin 4
 * katına sıçrama bir başlangıçtır ve 10 ms refrakter süre çift saymayı
 * önler. Pencere 100 Hz'e kadar bir periyodu kapsar — sürekli perdeli ses
 * periyot içi dalgalanmadan başlangıç üretmez. Sinyal başı sessizlikten
 * sayılır. Yoğun, üst üste binen olaylarda doyar: yoğunluğun kaba ölçüsüdür.
 */
export function countOnsets(channels: readonly Float32Array[], sampleRate: number): OnsetCount {
  const x = mono(channels);
  const hop = Math.max(1, Math.round(0.0025 * sampleRate));
  const window = 4 * hop;
  const energy: number[] = [];
  for (let i = 0; i + window <= x.length; i += hop) {
    let e = 0;
    for (let k = i; k < i + window; k++) e += x[k] * x[k];
    energy.push(e);
  }
  const floor = Math.max(0, ...energy) * 1e-4;
  let count = 0;
  let last = -Infinity;
  for (let k = 0; k < energy.length; k++) {
    const base = k === 0 ? 0 : Math.min(...energy.slice(Math.max(0, k - 4), k));
    if (energy[k] > floor && energy[k] > 4 * base && k - last >= 4) {
      count++;
      last = k;
    }
  }
  return {
    method: ONSET_METHOD,
    count,
    perSecond: x.length > 0 ? (count * sampleRate) / x.length : 0,
  };
}

export interface PulseRate {
  readonly method: typeof PULSE_METHOD;
  /** Darbe tekrar hızı; periyodiklik zayıfsa `null`. */
  readonly hz: number | null;
  /** Normalize özilinti r(T)/r(0) ∈ [−1, 1]. */
  readonly strength: number;
}

/**
 * Darbe dizisinin tekrar hızı: 1 ms yumuşatılmış zarf 4 kHz'e indirgenir,
 * özilintide en büyük değerin %90'ına ulaşan EN KÜÇÜK gecikme seçilir (2T,
 * 3T katları seçilmez). r(T)/r(0) < 0.3 ise periyodik sayılmaz.
 */
export function estimatePulseRate(
  channels: readonly Float32Array[],
  sampleRate: number,
  minHz = 2,
  maxHz = 400,
): PulseRate {
  const x = mono(channels);
  const alpha = 1 - Math.exp(-1 / (0.001 * sampleRate));
  const step = Math.max(1, Math.round(sampleRate / 4000));
  const rate = sampleRate / step;
  const env: number[] = [];
  let state = 0;
  for (let i = 0; i < x.length; i++) {
    state += alpha * (Math.abs(x[i]) - state);
    if (i % step === 0) env.push(state);
  }
  const mean = env.reduce((a, v) => a + v, 0) / Math.max(1, env.length);
  const minLag = Math.max(2, Math.floor(rate / maxHz));
  const maxLag = Math.min(env.length - 2, Math.ceil(rate / minHz));
  const span = env.length - maxLag;
  if (span <= minLag) return { method: PULSE_METHOD, hz: null, strength: 0 };
  const correlation = (lag: number) => {
    let sum = 0;
    for (let i = 0; i < span; i++) sum += (env[i] - mean) * (env[i + lag] - mean);
    return sum;
  };
  const zero = correlation(0);
  const r = new Float64Array(maxLag + 1);
  let max = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    r[lag] = correlation(lag);
    max = Math.max(max, r[lag]);
  }
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (r[lag] >= 0.9 * max && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
      const strength = zero > 0 ? r[lag] / zero : 0;
      return { method: PULSE_METHOD, hz: strength >= 0.3 ? rate / lag : null, strength };
    }
  }
  return { method: PULSE_METHOD, hz: null, strength: 0 };
}
