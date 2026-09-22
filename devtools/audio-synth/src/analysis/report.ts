import { measureAsset, type AssetMeasurement } from './assetQa';
import type { ClipCount } from './loudness';
import { fft } from './spectrum';

export const AUDIO_ANALYSIS_SCHEMA = 'AudioAnalysisReportV1';
/** Ölçüm tanımlarından biri değişirse artar; manifest bu sayıyı kaydeder. */
export const ANALYZER_VERSION = 1;

/** Ölçülen şey: kaynak PCM mi, yoksa kodlanıp FFmpeg ile ÇÖZÜLMÜŞ dosya mı. */
export type MeasurementSource = 'source-pcm' | 'decoded-encoded';

export interface ClickDetection {
  readonly count: number;
  /** İkinci farkın yerel RMS'e oranı eşiği ve kümeleme penceresi. */
  readonly method: string;
}

/**
 * Sürümlü analiz raporu. Tanımsız ölçüm (sessizlik, 400 ms'den kısa
 * sinyalde integrated) `null`dur; −∞ JSON'a yazılamaz ve "ölçülemedi" ile
 * "çok düşük" ayrı şeylerdir.
 */
export interface AudioAnalysisReportV1 {
  readonly schema: typeof AUDIO_ANALYSIS_SCHEMA;
  readonly analyzerVersion: typeof ANALYZER_VERSION;
  readonly measuredFrom: MeasurementSource;
  readonly format: {
    readonly sampleRate: number;
    readonly channels: number;
    readonly frames: number;
    readonly durationSeconds: number;
  };
  readonly level: {
    readonly samplePeakDbfs: number | null;
    readonly channelPeakDbfs: readonly (number | null)[];
    readonly truePeakDbtp: number | null;
    readonly rmsDbfs: number | null;
    readonly channelRmsDbfs: readonly (number | null)[];
    readonly integratedLufs: number | null;
    readonly maxMomentaryLufs: number | null;
    readonly crestFactorDb: number | null;
  };
  readonly dc: { readonly channelOffset: readonly number[] };
  readonly defects: { readonly clips: ClipCount; readonly clicks: ClickDetection };
  readonly stereo: { readonly correlation: number | null; readonly width: number | null } | null;
  readonly spectral: {
    readonly centroidHz: number | null;
    readonly rolloff85Hz: number | null;
    readonly flatness: number | null;
    readonly peakHz: number | null;
    /** Bant başına ortalama güç (dBFS; tam ölçek sinüs −3 dB). */
    readonly bandsDb: Readonly<Record<SpectralBand, number | null>>;
  };
  readonly temporal: {
    readonly peakTimeSeconds: number | null;
    readonly attackSeconds: number | null;
    readonly decay40Seconds: number | null;
    readonly activeSeconds: number;
    readonly leadingSilenceSeconds: number;
    readonly trailingSilenceSeconds: number;
    readonly temporalCentroidSeconds: number | null;
  };
}

const db = (amplitude: number): number | null =>
  amplitude > 0 && Number.isFinite(amplitude) ? 20 * Math.log10(amplitude) : null;

function channelStats(channel: Float32Array): { peak: number; rms: number; mean: number } {
  let peak = 0;
  let energy = 0;
  let sum = 0;
  for (const v of channel) {
    peak = Math.max(peak, Math.abs(v));
    energy += v * v;
    sum += v;
  }
  const n = Math.max(1, channel.length);
  return { peak, rms: Math.sqrt(energy / n), mean: sum / n };
}

const CLICK_RATIO = 8;
const CLICK_FLOOR = 1e-3;
const CLICK_WINDOW_SECONDS = 0.01;
const CLICK_CLUSTER_SECONDS = 0.001;
const CLICK_PEER_RATIO = 0.5;

const secondDifference = (x: Float32Array, i: number) => Math.abs(x[i] - 2 * x[i - 1] + x[i - 2]);

/**
 * Süreksizlik (tık) adayı sayacı. İkinci fark `|x[n] − 2x[n−1] + x[n−2]|`
 * üç koşulu birlikte sağlarsa aday sayılır: −60 dBFS tabanını aşar, ±10 ms
 * penceredeki ikinci fark RMS'inin 8 katını aşar ve YALNIZDIR — pencerede
 * (±1 ms dışında) onun yarısına ulaşan başka bir tepe yoktur. Yalnızlık
 * şartı periyodik kenarları (50 Hz üstü testere/kare) eler; beyaz gürültü
 * RMS şartını, sinüs taban/RMS şartını geçemez. 1 ms içindeki adaylar tek
 * tıktır. Bulgu kanıt değil adaydır.
 */
export function countClicks(channels: readonly Float32Array[], sampleRate: number): ClickDetection {
  const half = Math.max(2, Math.round(CLICK_WINDOW_SECONDS * sampleRate));
  const cluster = Math.max(1, Math.round(CLICK_CLUSTER_SECONDS * sampleRate));
  let count = 0;
  for (const x of channels) {
    const n = x.length;
    const prefix = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const d2 = i >= 2 ? secondDifference(x, i) : 0;
      prefix[i + 1] = prefix[i] + d2 * d2;
    }
    let last = -Infinity;
    for (let i = 2; i < n; i++) {
      const d2 = secondDifference(x, i);
      if (d2 < CLICK_FLOOR) continue;
      const from = Math.max(2, i - half);
      const to = Math.min(n, i + half + 1);
      if (!(d2 > CLICK_RATIO * Math.sqrt((prefix[to] - prefix[from]) / (to - from)))) continue;
      let isolated = true;
      for (let j = from; j < to && isolated; j++) {
        if (Math.abs(j - i) > cluster && secondDifference(x, j) >= CLICK_PEER_RATIO * d2)
          isolated = false;
      }
      if (!isolated) continue;
      if (i - last > cluster) count++;
      last = i;
    }
  }
  return {
    count,
    method:
      `d2>${CLICK_RATIO}*rms(±${CLICK_WINDOW_SECONDS}s)&d2>${CLICK_FLOOR}` +
      `&isolated(<${CLICK_PEER_RATIO}*d2 beyond ${CLICK_CLUSTER_SECONDS}s);cluster ${CLICK_CLUSTER_SECONDS}s`,
  };
}

function stereoImage(left: Float32Array, right: Float32Array) {
  let lr = 0;
  let ll = 0;
  let rr = 0;
  let mid = 0;
  let side = 0;
  for (let i = 0; i < left.length; i++) {
    lr += left[i] * right[i];
    ll += left[i] * left[i];
    rr += right[i] * right[i];
    const m = (left[i] + right[i]) / 2;
    const s = (left[i] - right[i]) / 2;
    mid += m * m;
    side += s * s;
  }
  return {
    correlation: ll > 0 && rr > 0 ? lr / Math.sqrt(ll * rr) : null,
    width: mid > 0 ? Math.sqrt(side / mid) : side > 0 ? null : 0,
  };
}

const MAX_SPECTRAL_FRAMES = 2000;

export type SpectralBand = 'sub' | 'low' | 'mid' | 'high' | 'air';
const BANDS: readonly { readonly name: SpectralBand; readonly lo: number; readonly hi: number }[] =
  [
    { name: 'sub', lo: 20, hi: 120 },
    { name: 'low', lo: 120, hi: 500 },
    { name: 'mid', lo: 500, hi: 2500 },
    { name: 'high', lo: 2500, hi: 8000 },
    { name: 'air', lo: 8000, hi: 20000 },
  ];
/** Hann penceresinin ortalama karesi — gürültü gücü normalizasyonu (Parseval). */
const HANN_MEAN_SQUARE = 0.375;

/**
 * Welch ortalamalı güç spektrumu (mono indirgenmiş, Hann, %50 örtüşme).
 * Uzun sinyalde en çok 2000 çerçeve eşit aralıkla seçilir — maliyet sınırlı,
 * seçim deterministik.
 */
function averageSpectrum(mono: Float64Array, sampleRate: number) {
  let size = 2048;
  while (size > 64 && size > mono.length) size >>= 1;
  const hop = size / 2;
  const frames = Math.max(1, Math.floor((mono.length - size) / hop) + 1);
  const stride = Math.max(1, Math.ceil(frames / MAX_SPECTRAL_FRAMES));
  const window = Float64Array.from(
    { length: size },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size),
  );
  const power = new Float64Array(size / 2);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let used = 0;
  for (let f = 0; f < frames; f += stride) {
    used++;
    const start = f * hop;
    for (let i = 0; i < size; i++) {
      re[i] = (mono[start + i] ?? 0) * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
  }
  return { power, binHz: sampleRate / size, size, used };
}

function bandLevels(power: Float64Array, binHz: number, size: number, used: number) {
  const out = {} as Record<SpectralBand, number | null>;
  for (const band of BANDS) {
    let energy = 0;
    for (let k = 1; k < power.length; k++) {
      const f = k * binHz;
      if (f >= band.lo && f < band.hi) energy += 2 * power[k];
    }
    const mean = energy / (used * size * size * HANN_MEAN_SQUARE);
    out[band.name] = mean > 0 ? 10 * Math.log10(mean) : null;
  }
  return out;
}

function spectralDescriptors(mono: Float64Array, sampleRate: number) {
  const { power, binHz, size, used } = averageSpectrum(mono, sampleRate);
  const bandsDb = bandLevels(power, binHz, size, used);
  let total = 0;
  let weighted = 0;
  let logSum = 0;
  let peakBin = 1;
  for (let k = 1; k < power.length; k++) {
    total += power[k];
    weighted += power[k] * k * binHz;
    logSum += Math.log(power[k] + 1e-30);
    if (power[k] > power[peakBin]) peakBin = k;
  }
  if (!(total > 0))
    return { centroidHz: null, rolloff85Hz: null, flatness: null, peakHz: null, bandsDb };
  let cumulative = 0;
  let rolloff = power.length - 1;
  for (let k = 1; k < power.length; k++) {
    cumulative += power[k];
    if (cumulative >= 0.85 * total) {
      rolloff = k;
      break;
    }
  }
  const bins = power.length - 1;
  return {
    centroidHz: weighted / total,
    rolloff85Hz: rolloff * binHz,
    flatness: Math.exp(logSum / bins) / (total / bins),
    peakHz: peakBin * binHz,
    bandsDb,
  };
}

function temporalDescriptors(channels: readonly Float32Array[], sampleRate: number) {
  const hop = Math.max(1, Math.round(0.01 * sampleRate));
  const length = channels[0]?.length ?? 0;
  const envelope: number[] = [];
  for (let start = 0; start < length; start += hop) {
    let energy = 0;
    const end = Math.min(length, start + hop);
    for (const channel of channels)
      for (let i = start; i < end; i++) energy += channel[i] * channel[i];
    envelope.push(Math.sqrt(energy / ((end - start) * channels.length)));
  }
  let peak = 0;
  for (const v of envelope) peak = Math.max(peak, v);
  const seconds = (frame: number) => (frame * hop) / sampleRate;
  const silent = (v: number) => v < 1e-3;
  const firstLoud = envelope.findIndex((v) => !silent(v));
  const lastLoud = envelope.length - 1 - [...envelope].reverse().findIndex((v) => !silent(v));
  if (!(peak > 0) || firstLoud < 0) {
    const total = length / sampleRate;
    return {
      peakTimeSeconds: null,
      attackSeconds: null,
      decay40Seconds: null,
      activeSeconds: 0,
      leadingSilenceSeconds: total,
      trailingSilenceSeconds: total,
      temporalCentroidSeconds: null,
    };
  }
  const peakFrame = envelope.indexOf(peak);
  const rise10 = envelope.findIndex((v) => v >= 0.1 * peak);
  const rise90 = envelope.findIndex((v) => v >= 0.9 * peak);
  const below40 = envelope.findIndex((v, i) => i > peakFrame && v < 0.01 * peak);
  let weighted = 0;
  let energy = 0;
  envelope.forEach((v, i) => {
    weighted += v * v * seconds(i + 0.5);
    energy += v * v;
  });
  return {
    peakTimeSeconds: seconds(peakFrame),
    attackSeconds: seconds(rise90 - rise10),
    decay40Seconds: below40 < 0 ? null : seconds(below40 - peakFrame),
    activeSeconds: seconds(envelope.filter((v) => v >= 1e-3 * peak).length),
    leadingSilenceSeconds: seconds(firstLoud),
    trailingSilenceSeconds: Math.max(0, length / sampleRate - seconds(lastLoud + 1)),
    temporalCentroidSeconds: weighted / energy,
  };
}

/**
 * Kanonik analiz çekirdeği: CLI (`audio-qa`), publish kapısı ve testler
 * AYNI fonksiyonu çağırır. Yükseklik/tepe/kırpma alanları `measureAsset`in
 * KENDİ sonucudur — iki yol aynı fixture için birebir aynı değeri verir.
 */
export function analyzeAudio(
  channels: readonly Float32Array[],
  sampleRate: number,
  measuredFrom: MeasurementSource,
): AudioAnalysisReportV1 {
  const measured: AssetMeasurement = measureAsset(channels, sampleRate);
  const stats = channels.map(channelStats);
  const frames = channels[0]?.length ?? 0;
  const totalRms = Math.sqrt(
    stats.reduce((sum, s) => sum + s.rms * s.rms, 0) / Math.max(1, stats.length),
  );
  const mono = new Float64Array(frames);
  for (const channel of channels)
    for (let i = 0; i < frames; i++) mono[i] += channel[i] / channels.length;
  const peakDb = measured.samplePeakDbfs;
  const rmsDb = db(totalRms);
  return {
    schema: AUDIO_ANALYSIS_SCHEMA,
    analyzerVersion: ANALYZER_VERSION,
    measuredFrom,
    format: {
      sampleRate,
      channels: channels.length,
      frames,
      durationSeconds: measured.durationSeconds,
    },
    level: {
      samplePeakDbfs: peakDb,
      channelPeakDbfs: stats.map((s) => db(s.peak)),
      truePeakDbtp: measured.truePeakDbtp,
      rmsDbfs: rmsDb,
      channelRmsDbfs: stats.map((s) => db(s.rms)),
      integratedLufs: measured.integratedLufs,
      maxMomentaryLufs: measured.maxMomentaryLufs,
      crestFactorDb: peakDb === null || rmsDb === null ? null : peakDb - rmsDb,
    },
    dc: { channelOffset: stats.map((s) => s.mean) },
    defects: { clips: measured.clips, clicks: countClicks(channels, sampleRate) },
    stereo: channels.length === 2 ? stereoImage(channels[0], channels[1]) : null,
    spectral: spectralDescriptors(mono, sampleRate),
    temporal: temporalDescriptors(channels, sampleRate),
  };
}

/** Rapordan `evaluateAssetPolicy`nin beklediği ölçüm — alanlar `measureAsset` ile aynıdır. */
export function measurementOf(report: AudioAnalysisReportV1): AssetMeasurement {
  return {
    durationSeconds: report.format.durationSeconds,
    channels: report.format.channels,
    integratedLufs: report.level.integratedLufs,
    maxMomentaryLufs: report.level.maxMomentaryLufs,
    truePeakDbtp: report.level.truePeakDbtp,
    samplePeakDbfs: report.level.samplePeakDbfs,
    clips: report.defects.clips,
  };
}
