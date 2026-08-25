import { describe, expect, it } from 'vitest';
import {
  clampFinite,
  hasFiniteDirection,
  safeDeltaMs,
  saturatingAdd,
  saturatingAddSigned,
} from '@/runtime/utils/numeric';

describe('runtime numeric sınırları', () => {
  it('geçersiz delta simülasyonu ilerletmez, aşırı delta üst sınıra iner', () => {
    expect(safeDeltaMs(Number.NaN)).toBe(0);
    expect(safeDeltaMs(Infinity)).toBe(0);
    expect(safeDeltaMs(-16)).toBe(0);
    expect(safeDeltaMs(100, 33)).toBe(33);
  });

  it('clampFinite geçersiz değeri güvenli yedeğe düşürür', () => {
    expect(clampFinite(Number.NaN, 0, 1, 0.5)).toBe(0.5);
    expect(clampFinite(Infinity, 0, 1, 0.5)).toBe(0.5);
    expect(clampFinite(2, 0, 1, 0.5)).toBe(1);
  });

  it('sayaç eklemesi Infinity üretmez', () => {
    expect(saturatingAdd(Number.MAX_SAFE_INTEGER, 10)).toBe(Number.MAX_SAFE_INTEGER);
    expect(saturatingAdd(10, Number.NaN)).toBe(10);
  });

  it('işaretli sayaçta negatif yükseltme sonrası pozitif artış doğru toparlar', () => {
    expect(saturatingAddSigned(-1, 1)).toBe(0);
    expect(saturatingAddSigned(Number.MAX_SAFE_INTEGER, 10)).toBe(Number.MAX_SAFE_INTEGER);
    expect(saturatingAddSigned(-Number.MAX_SAFE_INTEGER, -10)).toBe(-Number.MAX_SAFE_INTEGER);
  });

  it('sıfır ve geçersiz yön ayrıştırılır', () => {
    expect(hasFiniteDirection(0, 0)).toBe(false);
    expect(hasFiniteDirection(Number.NaN, 1)).toBe(false);
    expect(hasFiniteDirection(1, 0)).toBe(true);
  });
});
