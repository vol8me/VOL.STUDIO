import { describe, expect, it } from 'vitest';
import { createSimRandom } from '@/runtime/sim/rng';
import { createRandom } from '@volstudio/core';

describe('createSimRandom', () => {
  it('aynı seed aynı diziyi verir', () => {
    const a = createSimRandom(1234);
    const b = createSimRandom(1234);
    const left = Array.from({ length: 32 }, () => a.next());
    const right = Array.from({ length: 32 }, () => b.next());
    expect(left).toEqual(right);
  });

  it('farklı seed farklı dizi verir', () => {
    const a = createSimRandom(1);
    const b = createSimRandom(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('next() [0, 1) aralığında kalır', () => {
    const rng = createSimRandom(7);
    for (let i = 0; i < 512; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('bipolar() [-1, 1) aralığında kalır', () => {
    const rng = createSimRandom(9);
    for (let i = 0; i < 512; i++) {
      const value = rng.bipolar();
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThan(1);
    }
  });

  /* Kaydedilebilir dünyanın koşulu: durum okunup geri konduğunda dizi aynen sürer. */
  it('getState/setState diziyi kayıt anından SÜRDÜRÜR', () => {
    const rng = createSimRandom(42);
    for (let i = 0; i < 10; i++) rng.next();

    const snapshot = rng.getState();
    const expected = Array.from({ length: 16 }, () => rng.next());

    rng.setState(snapshot);
    const replayed = Array.from({ length: 16 }, () => rng.next());

    expect(replayed).toEqual(expected);
  });

  it('geri yükleme BAŞKA bir örneğe de taşınır', () => {
    const source = createSimRandom(99);
    for (let i = 0; i < 5; i++) source.next();

    const target = createSimRandom(1);
    target.setState(source.getState());

    expect(target.next()).toBe(source.next());
  });

  it('seed 0 dejenere diziye düşmez', () => {
    const rng = createSimRandom(0);
    const values = new Set(Array.from({ length: 16 }, () => rng.next()));
    expect(values.size).toBeGreaterThan(1);
  });

  it('seed 0 varsayılan tohumun takma adı değildir', () => {
    const zero = createSimRandom(0);
    const fallback = createSimRandom(0x5eed);
    expect(Array.from({ length: 16 }, () => zero.next())).not.toEqual(
      Array.from({ length: 16 }, () => fallback.next()),
    );
  });

  it('setState(0) da dejenere diziye düşmez', () => {
    const rng = createSimRandom(5);
    rng.setState(0);
    const values = new Set(Array.from({ length: 16 }, () => rng.next()));
    expect(values.size).toBeGreaterThan(1);
  });

  it('sıfır durumuna ulaşmış snapshot başka örneğe aktarıldığında ayrışmaz', () => {
    const source = createSimRandom(-0x6d2b79f5);
    source.next();
    expect(source.getState()).toBe(0);

    const target = createSimRandom(12345);
    target.setState(source.getState());
    expect(target.getState()).toBe(0);

    const sourceSequence = Array.from({ length: 16 }, () => source.next());
    const targetSequence = Array.from({ length: 16 }, () => target.next());
    expect(targetSequence).toEqual(sourceSequence);
  });

  it('sonlu olmayan tohum ve durum reddedilir, durum bozulmaz', () => {
    expect(() => createSimRandom(Number.NaN)).toThrow(RangeError);

    const rng = createSimRandom(3);
    expect(() => rng.setState(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(rng.getState()).toBe(3);
  });

  /*
   * Bu dizinin CORE'unkiyle aynı olması bir tesadüf değil sözleşmedir: burada
   * eklenen tek şey durumun OKUNABİLİR olmasıdır. Ayrışırlarsa CORE ile
   * üretilmiş bir tohumlama vol-life'ta başka bir dünya verir. Sınır tohumları
   * (0, negatif, 32 bitin tepesi) ayrışmanın en olası olduğu yerlerdir.
   */
  it('CORE createRandom ile aynı diziyi üretir', () => {
    for (const seed of [2026, 0, -1, 0x5eed, 0x7fffffff]) {
      const mine = createSimRandom(seed);
      const core = createRandom(seed);
      const left = Array.from({ length: 24 }, () => mine.next());
      const right = Array.from({ length: 24 }, () => core.next());
      expect(left).toEqual(right);
    }
  });
});
