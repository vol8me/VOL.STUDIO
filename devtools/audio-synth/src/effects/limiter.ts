import { interSamplePeaks, truePeakDb } from '../analysis/loudness';

/**
 * İleriye bakan true-peak sınırlayıcı (offline; gecikme yok, çünkü bütün
 * tampon eldedir). Gereken kazanç örnekler-ARASI tepeden (4× çok fazlı ara
 * değer, BS.1770 Ek 2 çekirdeği) okunur:
 *
 * 1. `need[n]` = min(1, tavan / tepe[n]) — [n, n+1) aralığının tepesi hem n
 *    hem n+1 örneğine yazılır (ara değer iki örneğin kazancından etkilenir).
 * 2. `hold[n]` = min(need[n … n+L]) — L örneklik ileri bakış.
 * 3. `box[n]` = hold'un [n−L, n] ortalaması. Her terim n'yi kapsayan bir
 *    pencerenin minimumu olduğundan box[n] ≤ need[n]: tepe anında kazanç
 *    zaten yeterince inmiştir ve iniş L örneğe yayılır (tık yok).
 * 4. Bırakma: kazanç yükselirken tek kutuplu yumuşatma; yükseliş yavaşladıkça
 *    kazanç box'un ALTINDA kalır, garanti bozulmaz.
 *
 * Kazanç modülasyonu ara değerleri çok az değiştirebildiğinden sonuç ölçülür;
 * tavan aşılırsa etkin tavan aşım kadar indirilip ORİJİNAL girişten yeniden
 * hesaplanır (deterministik, en çok `MAX_PASSES` tur).
 */
export interface LimiterSettings {
  readonly ceilingDb: number;
  readonly lookaheadSeconds: number;
  readonly releaseSeconds: number;
}

export interface LimiterOutcome {
  /** Uygulanan en derin kazanç azaltımı (dB, ≤ 0). */
  readonly maxReductionDb: number;
  /** Çıkışın ölçülen true peak'i (dBTP). */
  readonly truePeakDb: number;
  readonly passes: number;
}

const MAX_PASSES = 6;
const TOLERANCE_DB = 0.002;

function gainEnvelope(
  peaks: readonly Float32Array[],
  ceiling: number,
  lookahead: number,
  release: number,
): Float32Array {
  const frames = peaks[0].length;
  const need = new Float64Array(frames);
  for (let n = 0; n < frames; n++) {
    let peak = 0;
    for (const p of peaks) peak = Math.max(peak, p[n], n > 0 ? p[n - 1] : 0);
    need[n] = peak > ceiling ? ceiling / peak : 1;
  }
  const hold = new Float64Array(frames);
  const deque = new Int32Array(frames);
  let head = 0;
  let tail = 0;
  let next = 0;
  for (let n = 0; n < frames; n++) {
    const hi = Math.min(frames - 1, n + lookahead);
    for (; next <= hi; next++) {
      while (tail > head && need[deque[tail - 1]] >= need[next]) tail--;
      deque[tail++] = next;
    }
    while (deque[head] < n) head++;
    hold[n] = need[deque[head]];
  }
  const out = new Float32Array(frames);
  const width = lookahead + 1;
  let sum = hold[0] * width;
  let gain = 1;
  for (let n = 0; n < frames; n++) {
    sum += hold[n] - (n - width >= 0 ? hold[n - width] : hold[0]);
    const box = Math.min(1, sum / width);
    gain = box < gain ? box : gain + (box - gain) * (1 - release);
    out[n] = gain;
  }
  return out;
}

/** Kanalları YERİNDE sınırlar (bağlı: tek kazanç zarfı, stereo görüntü korunur). */
export function limitTruePeak(
  channels: readonly Float32Array[],
  sampleRate: number,
  s: LimiterSettings,
): LimiterOutcome {
  const original = channels.map((c) => c.slice());
  const peaks = original.map((c) => interSamplePeaks(c, sampleRate));
  const lookahead = Math.max(1, Math.round(s.lookaheadSeconds * sampleRate));
  const release = s.releaseSeconds > 0 ? Math.exp(-1 / (s.releaseSeconds * sampleRate)) : 0;
  let target = s.ceilingDb;
  let measured = -Infinity;
  let minGain = 1;
  let passes = 0;
  while (passes < MAX_PASSES) {
    passes++;
    const gains = gainEnvelope(peaks, Math.pow(10, target / 20), lookahead, release);
    minGain = 1;
    channels.forEach((channel, ch) => {
      const source = original[ch];
      for (let n = 0; n < channel.length; n++) channel[n] = source[n] * gains[n];
    });
    for (const g of gains) if (g < minGain) minGain = g;
    measured = truePeakDb(channels, sampleRate);
    if (!(measured > s.ceilingDb + TOLERANCE_DB)) break;
    target -= measured - s.ceilingDb + TOLERANCE_DB;
  }
  return {
    maxReductionDb: minGain < 1 ? 20 * Math.log10(minGain) : 0,
    truePeakDb: measured,
    passes,
  };
}
