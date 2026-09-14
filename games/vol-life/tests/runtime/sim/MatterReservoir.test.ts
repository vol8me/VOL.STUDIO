import { describe, expect, it } from 'vitest';
import { MatterReservoir, validateMatterReservoirSnapshot } from '@/runtime/sim/MatterReservoir';

describe('MatterReservoir', () => {
  it('başlangıçta her iki sayaç sıfırdır', () => {
    const reservoir = new MatterReservoir();
    expect(reservoir.external).toBe(0);
    expect(reservoir.voidLossTotal).toBe(0);
  });

  it('recordVoidLoss her iki sayacı artırır', () => {
    const reservoir = new MatterReservoir();
    reservoir.recordVoidLoss(3);
    expect(reservoir.external).toBe(3);
    expect(reservoir.voidLossTotal).toBe(3);
    reservoir.recordVoidLoss(2);
    expect(reservoir.external).toBe(5);
    expect(reservoir.voidLossTotal).toBe(5);
  });

  it('recordVoidLoss varsayılan sayısı 1dir', () => {
    const reservoir = new MatterReservoir();
    reservoir.recordVoidLoss();
    expect(reservoir.external).toBe(1);
  });

  it('geçersiz kayıp sayısını reddeder', () => {
    const reservoir = new MatterReservoir();
    expect(() => reservoir.recordVoidLoss(0)).toThrow(RangeError);
    expect(() => reservoir.recordVoidLoss(-1)).toThrow(RangeError);
    expect(() => reservoir.recordVoidLoss(1.5)).toThrow(RangeError);
  });

  it('snapshot/restore değerleri birebir geri yükler', () => {
    const reservoir = new MatterReservoir();
    reservoir.recordVoidLoss(7);
    const snapshot = reservoir.snapshot();
    expect(snapshot).toEqual({ external: 7, voidLossTotal: 7 });

    const fresh = new MatterReservoir();
    fresh.restore(snapshot);
    expect(fresh.external).toBe(7);
    expect(fresh.voidLossTotal).toBe(7);
  });

  it('validateMatterReservoirSnapshot geçersiz değerleri reddeder', () => {
    expect(() => validateMatterReservoirSnapshot({ external: -1, voidLossTotal: 0 })).toThrow(
      RangeError,
    );
    expect(() => validateMatterReservoirSnapshot({ external: 1.5, voidLossTotal: 2 })).toThrow(
      RangeError,
    );
    expect(() => validateMatterReservoirSnapshot({ external: 5, voidLossTotal: 3 })).toThrow(
      RangeError,
    );
    expect(() =>
      validateMatterReservoirSnapshot({ external: 0xffffffff + 1, voidLossTotal: 0xffffffff + 1 }),
    ).toThrow(RangeError);
  });

  it('validateMatterReservoirSnapshot geçerli değerleri kabul eder', () => {
    expect(() => validateMatterReservoirSnapshot({ external: 0, voidLossTotal: 0 })).not.toThrow();
    expect(() => validateMatterReservoirSnapshot({ external: 3, voidLossTotal: 5 })).not.toThrow();
  });
});
