/** Oyun durumunu değiştirmeyen, isteğe bağlı istemci tanılama iletisi. */
export const CLIENT_METRICS_MESSAGE = 'net:client-metrics';

export interface ReconciliationSample {
  readonly sequence: number;
  readonly liveSteps: number;
  readonly replaySteps: number;
  readonly reconciliations: number;
  readonly corrections: number;
  readonly snaps: number;
  /** Ölçülmeyen büyüklük sıfır değildir. Birim, oyunun SDK poz sözleşmesidir. */
  readonly correctionLast: number | null;
  readonly correctionMax: number | null;
}

export const RECONCILIATION_COUNTERS = [
  'sequence',
  'liveSteps',
  'replaySteps',
  'reconciliations',
  'corrections',
  'snaps',
] as const;

/** Tel sınırı: sayaçlar taşamaz, düzeltme ve sıçrama uzlaştırma sayısını aşamaz. */
export function isReconciliationSample(value: unknown): value is ReconciliationSample {
  if (!value || typeof value !== 'object') return false;
  const sample = value as Record<string, unknown>;
  if (
    !RECONCILIATION_COUNTERS.every(
      (key) => Number.isSafeInteger(sample[key]) && (sample[key] as number) >= 0,
    )
  )
    return false;
  const { correctionLast: last, correctionMax: max } = sample;
  const magnitude = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0;
  return (
    (sample.sequence as number) > 0 &&
    (sample.snaps as number) <= (sample.corrections as number) &&
    (sample.corrections as number) <= (sample.reconciliations as number) &&
    ((last === null && max === null && sample.corrections === 0) ||
      (magnitude(max) && (last === null || (magnitude(last) && last <= max)))) &&
    (sample.corrections === 0) === (max === null || max === 0)
  );
}
