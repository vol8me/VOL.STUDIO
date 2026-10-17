import type { ReconciliationSample } from '../protocol/clientMetrics';

/** SDK adım/uzlaştırma callbacklerini toplar; saat ve taşıma çağırana aittir, timer kurmaz. */
export class ReconciliationReporter {
  private sequence = 0;
  private liveSteps = 0;
  private replaySteps = 0;
  private reconciliations = 0;
  private corrections = 0;
  private snaps = 0;
  private correctionLast: number | null = null;
  private correctionMax: number | null = null;
  private sentAt = -Infinity;
  private disposed = false;

  constructor(
    private readonly send: (sample: ReconciliationSample) => void,
    private readonly intervalMs: number,
  ) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0)
      throw new RangeError('Rapor aralığı pozitif ve sonlu olmalı.');
  }

  step(replay: boolean): void {
    if (this.disposed) return;
    if (replay) this.replaySteps++;
    else this.liveSteps++;
  }

  reconcile(magnitude: number | null, snapped: boolean): void {
    if (this.disposed) return;
    if (magnitude !== null && (!Number.isFinite(magnitude) || magnitude < 0)) return;
    this.reconciliations++;
    this.correctionLast = magnitude;
    if (magnitude !== null) {
      this.correctionMax = Math.max(this.correctionMax ?? 0, magnitude);
      if (magnitude > 0) this.corrections++;
      if (magnitude > 0 && snapped) this.snaps++;
    }
  }

  snapshot(): ReconciliationSample {
    return {
      sequence: this.sequence,
      liveSteps: this.liveSteps,
      replaySteps: this.replaySteps,
      reconciliations: this.reconciliations,
      corrections: this.corrections,
      snaps: this.snaps,
      correctionLast: this.correctionLast,
      correctionMax: this.correctionMax,
    };
  }

  /** Geri giden/geçersiz saat gönderim üretmez; başarısız taşıma sonraki karede tekrar denenir. */
  flush(nowMs: number): boolean {
    if (
      this.disposed ||
      !Number.isFinite(nowMs) ||
      nowMs < 0 ||
      nowMs - this.sentAt < this.intervalMs
    )
      return false;
    this.sequence++;
    try {
      this.send(this.snapshot());
      this.sentAt = nowMs;
      return true;
    } catch {
      this.sequence--;
      return false;
    }
  }

  dispose(): void {
    this.disposed = true;
  }
}
