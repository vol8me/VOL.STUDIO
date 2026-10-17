import { DEFAULT_RENDER_BUDGET, type RenderCost } from './budget';

/**
 * Toplu (arama/aile) bütçesi — tek render bütçesinin ÜSTÜNDE aynı dünya
 * görüşüyle: tahmin ayırmadan ve render'dan ÖNCE yapılır, birim sayımı
 * deterministiktir. Seri yürütmede bellek toplanmaz (en ağır öğe belirler),
 * iş toplanır. `maxEstimatedSeconds` duvar saati DEĞİLDİR: iş birimlerinin
 * kalibrasyon sabitiyle (≈10 ns/birim) çevrilmiş tahminidir; gerçek süre
 * ölçülüp raporlanabilir ama hiçbir kararı ya da sırayı etkilemez.
 */
export interface BatchBudget {
  readonly maxItems: number;
  readonly maxTotalWorkUnits: number;
  readonly maxItemPeakBytes: number;
  readonly maxEstimatedSeconds: number;
}

/** Referans makine kalibrasyonu: DEFAULT_RENDER_BUDGET'in 6e9 birim ≈ 60 sn eşdeğeri. */
export const SECONDS_PER_WORK_UNIT = 1e-8;

/**
 * Kanonik analiz (`analyzeAudio`) maliyeti, kanal-örneği başına iş birimi.
 * Ölçüm: beyaz gürültüde 364–524 ns/örnek (true peak budaması gürültüde
 * işlemez — en kötü durum); 55 birim ≈ 550 ns muhafazakâr üst sınırdır.
 */
export const ANALYSIS_WORK_PER_SAMPLE = 55;

export const DEFAULT_BATCH_BUDGET: BatchBudget = {
  maxItems: 64,
  maxTotalWorkUnits: 3e10,
  maxItemPeakBytes: DEFAULT_RENDER_BUDGET.maxPeakBytes,
  maxEstimatedSeconds: 300,
};

export type BatchResource = 'items' | 'work' | 'memory' | 'time';

/** Toplu iş bütçeyi aştı; HİÇBİR öğe render edilmeden fırlatılır. */
export class BatchBudgetError extends Error {
  readonly resource: BatchResource;
  readonly estimate: number;
  readonly limit: number;

  constructor(label: string, resource: BatchResource, estimate: number, limit: number) {
    const what = {
      items: 'öğe sayısı',
      work: 'toplam iş',
      memory: 'öğe tepe belleği',
      time: 'tahmini süre (sn)',
    }[resource];
    super(
      `${label}: ${what} ${Number(estimate.toPrecision(6))} > bütçe ${Number(
        limit.toPrecision(6),
      )}. ` +
        'Aday/varyant sayısını, süreyi ya da boyut aralıklarını düşürün veya bütçeyi açıkça yükseltin.',
    );
    this.name = 'BatchBudgetError';
    this.resource = resource;
    this.estimate = estimate;
    this.limit = limit;
  }
}

export interface BatchEstimate {
  readonly items: number;
  readonly totalWorkUnits: number;
  readonly maxItemPeakBytes: number;
  readonly estimatedSeconds: number;
}

/** Öğe maliyetlerinden (render + kanonik analiz) toplu tahmin. */
export function estimateBatch(
  items: readonly { cost: RenderCost; samples: number }[],
): BatchEstimate {
  let work = 0;
  let peak = 0;
  for (const item of items) {
    work += item.cost.workUnits + item.samples * ANALYSIS_WORK_PER_SAMPLE;
    peak = Math.max(peak, item.cost.peakBytes);
  }
  return {
    items: items.length,
    totalWorkUnits: work,
    maxItemPeakBytes: peak,
    estimatedSeconds: work * SECONDS_PER_WORK_UNIT,
  };
}

export function assertBatchBudget(
  estimate: BatchEstimate,
  budget: BatchBudget,
  label: string,
): void {
  if (estimate.items > budget.maxItems) {
    throw new BatchBudgetError(label, 'items', estimate.items, budget.maxItems);
  }
  if (estimate.maxItemPeakBytes > budget.maxItemPeakBytes) {
    throw new BatchBudgetError(label, 'memory', estimate.maxItemPeakBytes, budget.maxItemPeakBytes);
  }
  if (estimate.totalWorkUnits > budget.maxTotalWorkUnits) {
    throw new BatchBudgetError(label, 'work', estimate.totalWorkUnits, budget.maxTotalWorkUnits);
  }
  if (estimate.estimatedSeconds > budget.maxEstimatedSeconds) {
    throw new BatchBudgetError(
      label,
      'time',
      estimate.estimatedSeconds,
      budget.maxEstimatedSeconds,
    );
  }
}
