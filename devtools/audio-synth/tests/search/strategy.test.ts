import { describe, expect, it } from 'vitest';
import { strategyPoints } from '../../src/search/strategy';

describe('scrambled-halton v1', () => {
  it('deterministiktir ve bütün koordinatlar [0, 1) içindedir', () => {
    const a = strategyPoints(42, ['a', 'b', 'c'], 64);
    expect(strategyPoints(42, ['a', 'b', 'c'], 64)).toEqual(a);
    for (const point of a) for (const u of point) expect(u >= 0 && u < 1).toBe(true);
  });

  it('önek kararlıdır: aday sayısını büyütmek önceki adayları değiştirmez', () => {
    const small = strategyPoints(9, ['x', 'y'], 10);
    const large = strategyPoints(9, ['x', 'y'], 40);
    expect(large.slice(0, 10)).toEqual(small);
  });

  it('tohum her boyutu değiştirir; permütasyon boyut ADINA bağlıdır, sırasına değil', () => {
    const base = strategyPoints(1, ['a', 'b', 'c'], 8);
    const reseeded = strategyPoints(2, ['a', 'b', 'c'], 8);
    for (let d = 0; d < 3; d++)
      expect(reseeded.map((p) => p[d])).not.toEqual(base.map((p) => p[d]));
    const renamed = strategyPoints(1, ['a', 'b', 'z'], 8);
    expect(renamed.map((p) => p.slice(0, 2))).toEqual(base.map((p) => p.slice(0, 2)));
    expect(renamed.map((p) => p[2])).not.toEqual(base.map((p) => p[2]));
  });

  it('karıştırma tabakalamayı korur: ilk p^k nokta her 1/p^k aralığına tek düşer', () => {
    const points = strategyPoints(1234, ['a', 'b', 'c'], 25);
    for (const [dim, base, count] of [
      [0, 2, 16],
      [1, 3, 9],
      [2, 5, 25],
    ] as const) {
      const cells = new Set(points.slice(0, count).map((p) => Math.floor(p[dim] * count)));
      expect(cells.size, `boyut ${dim} (taban ${base})`).toBe(count);
    }
  });

  it('dokuzuncu boyut reddedilir (asal tablosu ve spec sınırı)', () => {
    const names = Array.from({ length: 9 }, (_, i) => `d${i}`);
    expect(() => strategyPoints(1, names, 2)).toThrow(RangeError);
  });
});
