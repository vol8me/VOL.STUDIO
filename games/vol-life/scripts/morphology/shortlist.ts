import type { ReasonCode } from './phaseClassifier';

/**
 * Development audition kısa listesi (F5).
 *
 * Seçim YALNIZ SKORLA yapılmaz. En yüksek skorlu sekiz aday birbirinin
 * kopyası olabilir; insan ön-elemesi o listeden hiçbir şey öğrenmez. Liste
 * önce FAZ çeşitliliğini, sonra metrik uzayında birbirinden UZAKLIĞI gözetir.
 */
export interface ShortlistEntry {
  readonly index: number;
  readonly digest: string;
  readonly primary: ReasonCode | null;
  readonly score: number;
  /** Karşılaştırmada kullanılan normalize metrik vektörü. */
  readonly metrics: readonly number[];
}

export interface ShortlistConfig {
  readonly minSize: number;
  readonly maxSize: number;
}

export const defaultShortlistConfig: ShortlistConfig = { minSize: 3, maxSize: 8 };

export interface ShortlistResult {
  readonly selected: readonly ShortlistEntry[];
  readonly phaseCoverage: readonly (ReasonCode | null)[];
  /** Seçilenler arası en küçük metrik uzaklığı; çeşitliliğin ölçüsü. */
  readonly minPairwiseDistance: number;
}

export function selectShortlist(
  candidates: readonly ShortlistEntry[],
  config: ShortlistConfig = defaultShortlistConfig,
): ShortlistResult {
  if (candidates.length === 0) throw new RangeError('Kısa liste en az bir aday ister.');
  if (config.minSize > config.maxSize) throw new RangeError('Kısa liste sınırları tutarsız.');

  const byScore = [...candidates].sort((a, b) => b.score - a.score || a.index - b.index);
  const selected: ShortlistEntry[] = [];
  const seenPhases = new Set<string>();

  // 1) Her fazdan EN İYİ aday: faz çeşitliliği skordan önce gelir.
  for (const candidate of byScore) {
    if (selected.length >= config.maxSize) break;
    const key = candidate.primary ?? 'ÇOĞUNLUK_YOK';
    if (seenPhases.has(key)) continue;
    seenPhases.add(key);
    selected.push(candidate);
  }

  // 2) Kalan yerler metrik uzayında EN UZAK adaylarla doldurulur (farthest-first).
  while (selected.length < config.maxSize) {
    let best: ShortlistEntry | null = null;
    let bestDistance = -1;
    for (const candidate of byScore) {
      if (selected.some((entry) => entry.index === candidate.index)) continue;
      const distance = Math.min(
        ...selected.map((entry) => euclidean(entry.metrics, candidate.metrics)),
      );
      if (distance > bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    if (!best) break;
    selected.push(best);
  }

  return {
    selected,
    phaseCoverage: [...new Set(selected.map((entry) => entry.primary))],
    minPairwiseDistance: minPairwise(selected),
  };
}

function euclidean(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let index = 0; index < length; index++) sum += (a[index] - b[index]) ** 2;
  return Math.sqrt(sum);
}

function minPairwise(entries: readonly ShortlistEntry[]): number {
  if (entries.length < 2) return 0;
  let smallest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      smallest = Math.min(smallest, euclidean(entries[i].metrics, entries[j].metrics));
    }
  }
  return smallest;
}
