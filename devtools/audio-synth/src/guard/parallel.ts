import { availableParallelism } from 'node:os';
import type { BatchEstimate } from './batch';
import { DEFAULT_RENDER_BUDGET } from './budget';

/**
 * Toplu işlerin eşzamanlılık politikası. Seri yürütmede bellek toplanmaz;
 * paralelde her worker kendi öğesinin tepe belleğini tutar, bu yüzden
 * worker sayısı öğe tepe belleğinden ve eşzamanlı bellek tavanından türer.
 * Karar deterministik iş birimi tahminine dayanır; sonuçların içeriğini ve
 * sırasını hiçbir koşulda etkilemez.
 */
export interface ParallelPolicy {
  /** Aynı anda canlı kalabilecek öğe tepe belleklerinin toplamı. */
  readonly maxConcurrentPeakBytes: number;
  /**
   * Worker başına en az bu kadar tahmini iş düşer; toplamı bunun altında kalan
   * toplu iş seri koşar. Worker açılışı (tsx derlemesi) bu mertebededir;
   * ölçüm DESIGN.md "Paralel toplu render"dadır.
   */
  readonly minParallelSeconds: number;
  readonly maxWorkers: number;
}

/**
 * Bellek tavanı: referans makinede dört eşzamanlı en ağır render
 * (DESIGN.md "Kaynak bütçesi"). Worker sayısı çekirdek sayısının bir eksiği:
 * ana iş parçacığı sonuçları toplar ve kayıtları yazar.
 */
export const DEFAULT_PARALLEL_POLICY: ParallelPolicy = {
  maxConcurrentPeakBytes: 4 * DEFAULT_RENDER_BUDGET.maxPeakBytes,
  minParallelSeconds: 2,
  maxWorkers: Math.max(1, availableParallelism() - 1),
};

/**
 * `AUDIO_SYNTH_WORKERS=N` worker sayısını N'e sabitler (1 = seri); eşik
 * atlanır, bellek tavanı ve öğe sayısı yine sınırdır.
 */
export const WORKERS_ENV = 'AUDIO_SYNTH_WORKERS';

function envWorkers(): number | undefined {
  const raw = process.env[WORKERS_ENV];
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? value : undefined;
}

/**
 * Toplu iş için worker sayısı. `requested` (test ya da çağıran) eşiği atlar
 * ama bellek tavanını ve öğe sayısını aşamaz.
 */
export function batchWorkers(
  estimate: BatchEstimate,
  requested?: number,
  policy: ParallelPolicy = DEFAULT_PARALLEL_POLICY,
): number {
  const byMemory = Math.max(
    1,
    Math.floor(policy.maxConcurrentPeakBytes / Math.max(1, estimate.maxItemPeakBytes)),
  );
  const ceiling = Math.max(1, Math.min(byMemory, estimate.items));
  const explicit = requested ?? envWorkers();
  if (explicit !== undefined) return Math.min(explicit, ceiling);
  if (estimate.estimatedSeconds < policy.minParallelSeconds) return 1;
  const byWork = Math.floor(estimate.estimatedSeconds / policy.minParallelSeconds);
  return Math.max(1, Math.min(policy.maxWorkers, ceiling, byWork));
}
