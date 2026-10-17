import {
  isReconciliationSample,
  RECONCILIATION_COUNTERS,
  type ReconciliationSample,
} from '../protocol/clientMetrics';

interface Entry {
  sample: ReconciliationSample | null;
  receivedAt: number;
}

/** Yalnız oda tarafından açılmış istemciler tutulur; ayrılan istemci `forget` ile bırakılır. */
export class ClientMetricsRegistry {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly minimumIntervalMs = 250) {
    if (!Number.isFinite(minimumIntervalMs) || minimumIntervalMs < 0)
      throw new RangeError('Rapor kabul aralığı negatif olamaz.');
  }

  open(key: string): void {
    if (!this.entries.has(key)) this.entries.set(key, { sample: null, receivedAt: -Infinity });
  }

  accept(key: string, value: unknown, nowMs: number): boolean {
    const entry = this.entries.get(key);
    if (
      !entry ||
      !Number.isFinite(nowMs) ||
      nowMs < 0 ||
      nowMs - entry.receivedAt < this.minimumIntervalMs ||
      !isReconciliationSample(value)
    )
      return false;
    const previous = entry.sample;
    if (
      previous &&
      (value.sequence <= previous.sequence ||
        RECONCILIATION_COUNTERS.some((field) => value[field] < previous[field]) ||
        (previous.correctionMax !== null &&
          (value.correctionMax === null || value.correctionMax < previous.correctionMax)))
    )
      return false;
    // Yalnız sözleşme alanları kopyalanır: ek alanlarla kimlik ya da sınırsız nesne depolanamaz.
    entry.sample = {
      sequence: value.sequence,
      liveSteps: value.liveSteps,
      replaySteps: value.replaySteps,
      reconciliations: value.reconciliations,
      corrections: value.corrections,
      snaps: value.snaps,
      correctionLast: value.correctionLast,
      correctionMax: value.correctionMax,
    };
    entry.receivedAt = nowMs;
    return true;
  }

  read(key: string, nowMs: number) {
    const entry = this.entries.get(key);
    if (!entry?.sample) return null;
    return {
      source: 'client-reported' as const,
      ageMs: Number.isFinite(nowMs) ? Math.max(0, nowMs - entry.receivedAt) : null,
      ...entry.sample,
    };
  }

  forget(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
