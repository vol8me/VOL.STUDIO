import { describe, expect, it } from 'vitest';
import { seeded } from '../../src/lab/random';

describe('seeded', () => {
  it('aynı tohum aynı diziyi, farklı tohum farklı diziyi verir', () => {
    const take = (seed: number): number[] => {
      const random = seeded(seed);
      return Array.from({ length: 8 }, () => random());
    };
    expect(take(11)).toEqual(take(11));
    expect(take(11)).not.toEqual(take(12));
  });

  it('değerler [0,1) aralığındadır ve 10 kutuya düzgün dağılır', () => {
    const random = seeded(42);
    const bins = new Array<number>(10).fill(0);
    for (let index = 0; index < 50_000; index++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      bins[Math.floor(value * 10)]++;
    }
    for (const count of bins) expect(Math.abs(count - 5000)).toBeLessThan(300);
  });

  it('küçük ardışık tohumların ilk çekilişleri kümelenmez', () => {
    // Ham mulberry32'de 11 gibi küçük tohumlar ilk dizide 0,5 çevresinde toplanır; sürü hep aynı yere doğardı.
    const firsts = Array.from({ length: 200 }, (_, seed) => seeded(seed)());
    const mean = firsts.reduce((sum, value) => sum + value, 0) / firsts.length;
    const variance = firsts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / firsts.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.07);
    expect(Math.sqrt(variance)).toBeGreaterThan(0.25);
    const early = (seed: number): number[] => {
      const random = seeded(seed);
      return Array.from({ length: 6 }, () => random());
    };
    const spread = Math.max(...early(11)) - Math.min(...early(11));
    expect(spread).toBeGreaterThan(0.4);
  });

  it('tohum tamsayıya indirgenir: negatif ve büyük değerler geçerlidir', () => {
    expect(() => seeded(-5)()).not.toThrow();
    expect(seeded(2 ** 40)()).toBeGreaterThanOrEqual(0);
  });
});
