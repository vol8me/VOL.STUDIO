import { describe, expect, it } from 'vitest';
import { SIM_VERSION } from '../../src/config/factory';
import { SIM_MISMATCH, isSimMismatch } from '../../src/net/protocol';

describe('simülasyon sürümü uyuşmazlığı', () => {
  it('sürüm pozitif tamsayıdır', () => {
    expect(Number.isInteger(SIM_VERSION)).toBe(true);
    expect(SIM_VERSION).toBeGreaterThan(0);
  });

  it('yalnız kod ve ileti birlikte eşleşince tanınır', () => {
    expect(
      isSimMismatch(Object.assign(new Error(SIM_MISMATCH.message), { code: SIM_MISMATCH.code })),
    ).toBe(true);
    expect(isSimMismatch(Object.assign(new Error('başka'), { code: SIM_MISMATCH.code }))).toBe(
      false,
    );
    expect(isSimMismatch(Object.assign(new Error(SIM_MISMATCH.message), { code: 1 }))).toBe(false);
    expect(isSimMismatch(new Error(SIM_MISMATCH.message))).toBe(false);
    expect(isSimMismatch(null)).toBe(false);
    expect(isSimMismatch('sim-version')).toBe(false);
  });
});
