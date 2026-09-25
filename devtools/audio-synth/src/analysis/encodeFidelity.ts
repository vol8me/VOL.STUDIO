import { integratedLoudness, maxMomentaryLoudness, truePeakDb } from './loudness';
import { powerSpectrum } from './spectrum';

/**
 * Kodek sonrası sadakat (`decoded-fidelity-v1`): kaynak PCM ile kodlanıp
 * ÇÖZÜLMÜŞ dosyanın 1/3 oktav bantlarda, zamanda ve seviyede ne kadar
 * ayrıştığı. Bu bir ÖLÇÜM sözleşmesidir, algısal şeffaflık iddiası değildir:
 * algısal kodek maskelenen içeriği bilerek atar; ölçü o yüzden her karede
 * en güçlü bandın 30 dB altına kadar olan hücrelere bakar.
 */
export const FIDELITY_METHOD = 'decoded-fidelity-v1';

const FRAME = 4096;
const HOP = FRAME / 2;
/** Karenin en güçlü bandına göre ölçüme giren hücre tabanı. */
const CELL_RANGE_DB = 30;
/** Bu enerjinin altındaki kare sessiz sayılır (dBFS, kare ortalaması). */
const SILENT_FRAME_DB = -70;
/** Uzun dönem spektrumunda anlamlı sayılan bant tabanı (en güçlü banda göre). */
const SIGNIFICANT_DB = 50;
/** Bant genişliği: çözülmüş uzun dönem enerjisi kaynağın bu kadar altına inmeyen en yüksek bant. */
const CUTOFF_TOLERANCE_DB = 6;

export interface EncodeFidelityV1 {
  readonly method: typeof FIDELITY_METHOD;
  /** Hücre başına |10·log10(çözülmüş/kaynak)| ortalaması ve 95. yüzdeliği (dB). */
  readonly bandErrorMeanDb: number;
  readonly bandErrorP95Db: number;
  /** Kaynağın anlamlı en yüksek bandı ve çözülmüşte korunan en yüksek bant (Hz, bant merkezi). */
  readonly sourceCutoffHz: number;
  readonly cutoffHz: number;
  readonly loudnessDeltaLu: number | null;
  readonly truePeakDeltaDb: number | null;
}

/** 1/3 oktav bant merkezleri, 50 Hz – 16 kHz (1000·2^(k/3)). */
export const THIRD_OCTAVE_CENTERS: readonly number[] = Array.from(
  { length: 26 },
  (_, i) => 1000 * 2 ** ((i - 13) / 3),
);

function hann(size: number): Float64Array {
  return Float64Array.from(
    { length: size },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size),
  );
}

function bandEnergies(power: Float64Array, sampleRate: number): Float64Array {
  const out = new Float64Array(THIRD_OCTAVE_CENTERS.length);
  const binHz = sampleRate / FRAME;
  THIRD_OCTAVE_CENTERS.forEach((center, b) => {
    const from = Math.max(1, Math.ceil((center * 2 ** (-1 / 6)) / binHz));
    const to = Math.min(power.length - 1, Math.floor((center * 2 ** (1 / 6)) / binHz));
    for (let k = from; k <= to; k++) out[b] += power[k];
  });
  return out;
}

const round = (x: number) => Number(x.toFixed(3));
const db = (ratio: number) => 10 * Math.log10(ratio);

function loudnessOf(channels: readonly Float32Array[], sampleRate: number): number {
  const integrated = integratedLoudness(channels, sampleRate);
  return Number.isFinite(integrated) ? integrated : maxMomentaryLoudness(channels, sampleRate);
}

function delta(a: number, b: number): number | null {
  return Number.isFinite(a) && Number.isFinite(b) ? round(a - b) : null;
}

/** Kaynak ile çözülmüş sinyalin sadakati; iki sinyal aynı hizada ve aynı oranda olmalı. */
export function measureEncodeFidelity(
  source: readonly Float32Array[],
  decoded: readonly Float32Array[],
  sampleRate: number,
): EncodeFidelityV1 {
  const frames = Math.min(source[0].length, decoded[0].length);
  const window = hann(FRAME);
  const errors: number[] = [];
  const longSource = new Float64Array(THIRD_OCTAVE_CENTERS.length);
  const longDecoded = new Float64Array(THIRD_OCTAVE_CENTERS.length);
  const silent = FRAME * 10 ** (SILENT_FRAME_DB / 10);
  for (let ch = 0; ch < source.length; ch++) {
    for (let at = 0; at < Math.max(1, frames - HOP); at += HOP) {
      let energy = 0;
      for (let i = at; i < Math.min(frames, at + FRAME); i++) energy += source[ch][i] ** 2;
      if (energy < silent) continue;
      const s = bandEnergies(powerSpectrum(source[ch], at, FRAME, window), sampleRate);
      const d = bandEnergies(powerSpectrum(decoded[ch], at, FRAME, window), sampleRate);
      const floor = Math.max(...s) * 10 ** (-CELL_RANGE_DB / 10);
      s.forEach((value, b) => {
        longSource[b] += value;
        longDecoded[b] += d[b];
        if (value > 0 && value >= floor) errors.push(Math.abs(db((d[b] + 1e-30) / value)));
      });
    }
  }
  errors.sort((a, b) => a - b);
  const significant = Math.max(...longSource) * 10 ** (-SIGNIFICANT_DB / 10);
  let sourceCutoff = 0;
  let cutoff = 0;
  longSource.forEach((value, b) => {
    if (value <= 0 || value < significant) return;
    sourceCutoff = THIRD_OCTAVE_CENTERS[b];
    if (longDecoded[b] >= value * 10 ** (-CUTOFF_TOLERANCE_DB / 10)) cutoff = sourceCutoff;
  });
  const mean = errors.reduce((sum, e) => sum + e, 0) / Math.max(1, errors.length);
  const trimmed = decoded.map((c) => c.subarray(0, frames));
  const reference = source.map((c) => c.subarray(0, frames));
  return {
    method: FIDELITY_METHOD,
    bandErrorMeanDb: round(mean),
    bandErrorP95Db: round(errors[Math.floor(0.95 * (errors.length - 1))] ?? 0),
    sourceCutoffHz: Math.round(sourceCutoff),
    cutoffHz: Math.round(cutoff),
    loudnessDeltaLu: delta(loudnessOf(trimmed, sampleRate), loudnessOf(reference, sampleRate)),
    truePeakDeltaDb: delta(truePeakDb(trimmed, sampleRate), truePeakDb(reference, sampleRate)),
  };
}
