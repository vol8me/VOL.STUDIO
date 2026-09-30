import { describe, expect, it } from 'vitest';
import { valueNoise } from '../../src/random/noise';

describe('valueNoise', () => {
  it('[0, 1) aralığında ve deterministiktir', () => {
    for (let index = 0; index < 500; index++) {
      const x = index * 0.37 - 40;
      const y = index * 0.11 + 7;
      const value = valueNoise(x, y, 1234);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(valueNoise(x, y, 1234)).toBe(value);
    }
  });

  it('kafes arasında süreklidir, tohuma bağlıdır', () => {
    expect(Math.abs(valueNoise(3.5, 2.5, 9) - valueNoise(3.5001, 2.5, 9))).toBeLessThan(0.01);
    let different = 0;
    for (let index = 0; index < 100; index++) {
      if (valueNoise(index * 0.7, 1.3, 5) !== valueNoise(index * 0.7, 1.3, 6)) different++;
    }
    expect(different).toBeGreaterThan(95);
  });

  it('kafes noktalarında komşu değerler bağımsızdır', () => {
    const values = new Set<number>();
    for (let index = 0; index < 64; index++) values.add(valueNoise(index, 0, 1));
    expect(values.size).toBe(64);
  });
});
