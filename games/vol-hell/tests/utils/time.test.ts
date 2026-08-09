import { describe, it, expect } from 'vitest';
import { formatTimeMs } from '@/utils/time';

describe('formatTimeMs', () => {
  it('0 ms -> 0:00', () => {
    expect(formatTimeMs(0)).toBe('0:00');
  });

  it('65 saniye -> 1:05', () => {
    expect(formatTimeMs(65_000)).toBe('1:05');
  });

  it('2 dakika 3 saniye -> 2:03', () => {
    expect(formatTimeMs(123_000)).toBe('2:03');
  });

  it('milisaniyeleri yuvarlar', () => {
    expect(formatTimeMs(66_999)).toBe('1:06');
  });

  it('negatif değerleri 0:00 olarak gösterir', () => {
    expect(formatTimeMs(-1000)).toBe('0:00');
  });

  it('çok uzun süreleri doğru formatlar', () => {
    expect(formatTimeMs(3_661_000)).toBe('61:01');
  });

  it('NaN ve Infinity değerlerini 0:00 olarak gösterir', () => {
    expect(formatTimeMs(NaN)).toBe('0:00');
    expect(formatTimeMs(Infinity)).toBe('0:00');
  });
});
