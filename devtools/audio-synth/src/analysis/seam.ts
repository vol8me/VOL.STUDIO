import { blackmanHarris, powerSpectrum } from './spectrum';

/**
 * Loop dikişi QA'sı: çalma sonundan başa geçişin sinyalin KENDİ iç
 * değişkenliğinden daha büyük bir süreksizlik yaratıp yaratmadığı. Üç
 * ölçüm, her biri sinyalin içindeki komşu pencerelerin dağılımıyla kıyaslanır
 * (sabit eşik değil — durağan olmayan dokular için adil):
 *
 * - `jumpRatio`: |x[0] − x[L−1]| / iç birinci farkların %99.5 yüzdeliği.
 * - `levelStepDb`: son ve ilk 50 ms RMS farkı − iç komşu pencere farklarının %95'i.
 * - `spectralStepDb`: son/ilk 2048 örneklik log-spektral uzaklık − iç komşu
 *   pencere uzaklıklarının %95'i.
 */
export const SEAM_METHOD = 'loop-seam-v1';

export interface LoopSeamV1 {
  readonly method: typeof SEAM_METHOD;
  readonly jumpRatio: number;
  readonly levelStepDb: number;
  readonly spectralStepDb: number;
  readonly pass: boolean;
  readonly reasons: readonly string[];
}

export const SEAM_LIMITS = { jumpRatio: 1.5, levelStepDb: 1.5, spectralStepDb: 1.5 } as const;

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function rmsDb(x: Float32Array, from: number, length: number): number {
  let e = 0;
  for (let i = from; i < from + length; i++) e += x[i] * x[i];
  return 10 * Math.log10(e / length + 1e-20);
}

function logSpectrum(x: Float32Array, from: number, size: number): Float64Array {
  const power = powerSpectrum(x, from, size, blackmanHarris(size));
  return power.map((p) => 10 * Math.log10(p + 1e-20));
}

function spectralDistance(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let k = 1; k < a.length; k++) sum += (a[k] - b[k]) ** 2;
  return Math.sqrt(sum / (a.length - 1));
}

export function measureLoopSeam(channels: readonly Float32Array[], sampleRate: number): LoopSeamV1 {
  const n = channels[0].length;
  let jumpRatio = 0;
  let levelStepDb = -Infinity;
  let spectralStepDb = -Infinity;
  const win = Math.max(64, Math.round(0.05 * sampleRate));
  const size = 2048;
  for (const x of channels) {
    const diffs: number[] = [];
    for (let i = 1; i < n; i += 3) diffs.push(Math.abs(x[i] - x[i - 1]));
    const typical = percentile(diffs, 0.995) + 1e-12;
    jumpRatio = Math.max(jumpRatio, Math.abs(x[0] - x[n - 1]) / typical);
    const levels: number[] = [];
    for (let at = 0; at + 2 * win <= n; at += win)
      levels.push(Math.abs(rmsDb(x, at, win) - rmsDb(x, at + win, win)));
    const seamLevel = Math.abs(rmsDb(x, n - win, win) - rmsDb(x, 0, win));
    levelStepDb = Math.max(levelStepDb, seamLevel - percentile(levels, 0.95));
    if (n >= 2 * size) {
      const distances: number[] = [];
      let previous = logSpectrum(x, 0, size);
      for (let at = size; at + size <= n; at += size) {
        const current = logSpectrum(x, at, size);
        distances.push(spectralDistance(previous, current));
        previous = current;
      }
      const seam = spectralDistance(logSpectrum(x, n - size, size), logSpectrum(x, 0, size));
      spectralStepDb = Math.max(spectralStepDb, seam - percentile(distances, 0.95));
    }
  }
  const reasons: string[] = [];
  if (jumpRatio > SEAM_LIMITS.jumpRatio)
    reasons.push(`sıçrama ${jumpRatio.toFixed(2)}× iç tepe farkı`);
  if (levelStepDb > SEAM_LIMITS.levelStepDb)
    reasons.push(`seviye basamağı +${levelStepDb.toFixed(2)} dB`);
  if (spectralStepDb > SEAM_LIMITS.spectralStepDb)
    reasons.push(`spektral basamak +${spectralStepDb.toFixed(2)} dB`);
  return {
    method: SEAM_METHOD,
    jumpRatio: Number(jumpRatio.toFixed(4)),
    levelStepDb: Number(levelStepDb.toFixed(3)),
    spectralStepDb: Number(Number.isFinite(spectralStepDb) ? spectralStepDb.toFixed(3) : '0'),
    pass: reasons.length === 0,
    reasons,
  };
}
