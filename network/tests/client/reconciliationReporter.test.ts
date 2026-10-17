import { describe, expect, it, vi } from 'vitest';
import { ReconciliationReporter } from '../../src/client/reconciliationReporter';
import { isReconciliationSample } from '../../src/protocol/clientMetrics';
import type { ReconciliationSample } from '../../src/protocol/clientMetrics';

describe('ReconciliationReporter', () => {
  it('gerçek callbackleri ayırır, örnek kopyalar ve kadansı korur', () => {
    const send = vi.fn<(sample: ReconciliationSample) => void>();
    const reporter = new ReconciliationReporter(send, 1000);
    reporter.step(false);
    reporter.step(true);
    reporter.step(true);
    reporter.reconcile(0, false);
    reporter.reconcile(2, false);
    reporter.reconcile(200, true);
    expect(reporter.flush(50)).toBe(true);
    expect(send.mock.calls[0]?.[0]).toEqual({
      sequence: 1,
      liveSteps: 1,
      replaySteps: 2,
      reconciliations: 3,
      corrections: 2,
      snaps: 1,
      correctionLast: 200,
      correctionMax: 200,
    });
    for (const at of [49, 500, NaN, Infinity, -1]) expect(reporter.flush(at)).toBe(false);
    reporter.reconcile(1, false);
    expect(reporter.flush(1050)).toBe(true);
    expect(send.mock.calls[0]?.[0].correctionLast).toBe(200);
    expect(send.mock.calls[1]?.[0].correctionLast).toBe(1);
    reporter.dispose();
    reporter.dispose();
    reporter.step(false);
    reporter.reconcile(1000, true);
    expect(reporter.flush(3000)).toBe(false);
    expect(reporter.snapshot().reconciliations).toBe(4);
  });

  it('ölçülmeyeni sıfır saymaz; taşıma hatası kadansı ya da sırayı tüketmez', () => {
    const send = vi.fn().mockImplementationOnce(() => {
      throw new Error('closed');
    });
    const reporter = new ReconciliationReporter(send, 1000);
    reporter.reconcile(null, false);
    reporter.reconcile(NaN, true);
    expect(reporter.flush(0)).toBe(false);
    expect(reporter.flush(1)).toBe(true);
    expect(reporter.snapshot()).toMatchObject({
      sequence: 1,
      reconciliations: 1,
      correctionMax: null,
    });
    expect(isReconciliationSample(reporter.snapshot())).toBe(true);
    reporter.reconcile(2, false);
    reporter.reconcile(null, false);
    expect(isReconciliationSample(reporter.snapshot())).toBe(true);
    expect(() => new ReconciliationReporter(send, 0)).toThrow(RangeError);
  });
});
