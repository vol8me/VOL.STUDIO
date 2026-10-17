import { maxMomentaryLoudness } from './loudness';
import { analyzeAudio } from './report';

/**
 * İşleme katmanının yön ölçüleri (`treatment-cues-v1`). Bir mesafe ya da
 * engel profili sesi "uzaklaştırıyorsa" üç ölçü aynı yöne gider:
 *
 * - `centroidHz`: spektral ağırlık merkezi — tiz soğurması düşürür.
 * - `attackRatioDb`: başlangıçtan sonraki ilk 5 ms'nin enerjisi / sonraki
 *   95 ms — atak yumuşadıkça düşer.
 * - `directnessDb`: ilk 50 ms'nin enerjisi / geri kalanı (C50 benzeri
 *   netlik, sinyalin kendisinden) — yansıma payı arttıkça düşer.
 *
 * Başlangıç: 1 ms'lik RMS zarfının en büyük değerinin −20 dB'ini ilk aşan
 * kare. Ölçüler mono katlamada yapılır; seviye ayrıca `maxMomentaryLufs`.
 */
export const TREATMENT_CUES_METHOD = 'treatment-cues-v1';

export interface TreatmentCuesV1 {
  readonly method: typeof TREATMENT_CUES_METHOD;
  readonly centroidHz: number | null;
  readonly attackRatioDb: number | null;
  readonly directnessDb: number | null;
  readonly maxMomentaryLufs: number | null;
}

const round = (x: number) => Number(x.toFixed(3));
const finite = (x: number) => (Number.isFinite(x) ? round(x) : null);

function envelope(x: Float32Array, width: number): Float64Array {
  const out = new Float64Array(Math.floor(x.length / width));
  for (let f = 0; f < out.length; f++) {
    let e = 0;
    for (let i = f * width; i < (f + 1) * width; i++) e += x[i] * x[i];
    out[f] = e;
  }
  return out;
}

function energyRatioDb(env: Float64Array, from: number, split: number, to: number): number {
  let early = 0;
  let late = 0;
  for (let f = from; f < Math.min(to, env.length); f++) {
    if (f < split) early += env[f];
    else late += env[f];
  }
  return late > 0 && early > 0 ? 10 * Math.log10(early / late) : NaN;
}

export function measureTreatmentCues(
  channels: readonly Float32Array[],
  sampleRate: number,
): TreatmentCuesV1 {
  const mono =
    channels.length === 1 ? channels[0] : channels[0].map((x, i) => 0.5 * (x + channels[1][i]));
  const ms = Math.max(1, Math.round(sampleRate / 1000));
  const env = envelope(mono, ms);
  const peak = env.reduce((m, e) => Math.max(m, e), 0);
  const onset = env.findIndex((e) => e > peak * 0.01);
  const report = analyzeAudio([mono], sampleRate, 'source-pcm');
  return {
    method: TREATMENT_CUES_METHOD,
    centroidHz: report.spectral.centroidHz === null ? null : round(report.spectral.centroidHz),
    attackRatioDb: onset < 0 ? null : finite(energyRatioDb(env, onset, onset + 5, onset + 100)),
    directnessDb: onset < 0 ? null : finite(energyRatioDb(env, onset, onset + 50, env.length)),
    maxMomentaryLufs: finite(maxMomentaryLoudness(channels, sampleRate)),
  };
}
