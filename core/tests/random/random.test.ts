import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEED,
  createRandom,
  createStatefulRandom,
  seedFromString,
} from '../../src/random/random';

function take(random: { next(): number }, count: number): number[] {
  return Array.from({ length: count }, () => random.next());
}

describe('createRandom', () => {
  it('aynı tohum aynı diziyi verir', () => {
    expect(take(createRandom(1234), 32)).toEqual(take(createRandom(1234), 32));
  });

  /*
   * Üretilmiş ses varlıkları bu diziye dayanır. Değişirse `audio-verify` ancak
   * signoff'ta düşer; bu test aynı kırılmayı her koşuda yakalar.
   */
  it('varsayılan tohumun dizisi sabittir', () => {
    expect(take(createRandom(), 4)).toEqual([
      0.7100320369936526, 0.286336648510769, 0.9519026265479624, 0.10175976227037609,
    ]);
    expect(take(createRandom(), 16)).toEqual(take(createRandom(DEFAULT_SEED), 16));
  });

  it('0 geçerli bir tohumdur, varsayılanın takma adı değildir', () => {
    expect(take(createRandom(0), 4)).toEqual([
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111,
    ]);
    expect(take(createRandom(0), 16)).not.toEqual(take(createRandom(), 16));
  });

  it('0 tohumu dejenere değildir ve [0, 1) aralığında kalır', () => {
    const values = take(createRandom(0), 256);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('tohum 32 bite indirgenir', () => {
    expect(take(createRandom(2 ** 32), 8)).toEqual(take(createRandom(0), 8));
    expect(take(createRandom(-1), 8)).toEqual(take(createRandom(0xffffffff), 8));
  });

  it('sonlu olmayan tohumu reddeder', () => {
    for (const seed of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => createRandom(seed)).toThrow(RangeError);
    }
  });

  it('bipolar() [-1, 1) aralığında kalır', () => {
    const random = createRandom(9);
    for (let i = 0; i < 512; i++) {
      const value = random.bipolar();
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('seedFromString', () => {
  it('aynı metin aynı 32-bit tohumu, farklı metin farklı tohumu verir', () => {
    expect(seedFromString('vol-studio')).toBe(seedFromString('vol-studio'));
    expect(Number.isInteger(seedFromString('vol-studio'))).toBe(true);
    expect(seedFromString('a')).not.toBe(seedFromString('b'));
  });
});

describe('createStatefulRandom', () => {
  it('durum geri yüklenince dizi aynı noktadan sürer', () => {
    const random = createStatefulRandom(42);
    take(random, 10);
    const state = random.getState();
    const expected = take(random, 16);

    random.setState(state);

    expect(take(random, 16)).toEqual(expected);
  });

  it('durum başka örneğe taşınabilir ve sıfır geçerli durumdur', () => {
    const source = createStatefulRandom(-0x6d2b79f5);
    source.next();
    expect(source.getState()).toBe(0);

    const target = createStatefulRandom(12345);
    target.setState(source.getState());

    expect(take(target, 16)).toEqual(take(source, 16));
  });

  it('createRandom dizisiyle pariteyi korur', () => {
    for (const seed of [2026, 0, -1, 0x5eed, 0x7fffffff]) {
      expect(take(createStatefulRandom(seed), 24)).toEqual(take(createRandom(seed), 24));
    }
  });

  it('gecersiz geri yüklemeyi durumu bozmadan reddeder', () => {
    const random = createStatefulRandom(3);
    expect(() => random.setState(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(random.getState()).toBe(3);
  });
});
