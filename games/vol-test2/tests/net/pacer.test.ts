import { describe, expect, it } from 'vitest';
import { Pacer } from '../../src/net/pacer';

const options = { rate: 30, targetLag: 4, maxSteps: 8 } as const;

describe('Pacer', () => {
  it('hedef tamponda gerçek zamanlı ilerler', () => {
    const pacer = new Pacer(options);
    let steps = 0;
    for (let frame = 0; frame < 60; frame++) steps += pacer.next(1000 / 60, 4);
    expect(steps).toBe(30);
  });

  it('tampon büyüdükçe hızlanır, küçüldükçe yavaşlar', () => {
    const run = (lag: number): number => {
      const pacer = new Pacer({ ...options, maxSteps: 64 });
      let steps = 0;
      for (let frame = 0; frame < 60; frame++) steps += pacer.next(1000 / 60, lag);
      return steps;
    };
    expect(run(12)).toBeGreaterThan(run(4));
    expect(run(1)).toBeLessThan(run(4));
    // Hız sınırı: ×0,5 ile ×4 arasında.
    expect(run(1)).toBeGreaterThanOrEqual(15);
    expect(run(60)).toBeLessThanOrEqual(120);
  });

  it('tek karede maxSteps ve mevcut tampondan fazla adım vermez', () => {
    const pacer = new Pacer(options);
    expect(pacer.next(10_000, 100)).toBe(8);
    expect(pacer.next(10_000, 3)).toBe(3);
  });

  it('sınıra dayanan bütçe birikmez', () => {
    const pacer = new Pacer(options);
    pacer.next(10_000, 100);
    expect(pacer.fraction).toBe(0);
  });

  it('tampon boşsa ya da süre geçersizse durur ve kesri sıfırlar', () => {
    const pacer = new Pacer(options);
    pacer.next(20, 4);
    expect(pacer.next(16, 0)).toBe(0);
    expect(pacer.fraction).toBe(0);
    expect(pacer.next(-5, 4)).toBe(0);
    expect(pacer.next(Number.NaN, 4)).toBe(0);
    expect(pacer.next(Number.POSITIVE_INFINITY, 4)).toBe(0);
  });

  it('adım kesri 0 ile 1 arasındadır ve reset sıfırlar', () => {
    const pacer = new Pacer(options);
    pacer.next(20, 4);
    expect(pacer.fraction).toBeGreaterThanOrEqual(0);
    expect(pacer.fraction).toBeLessThan(1);
    pacer.reset();
    expect(pacer.fraction).toBe(0);
  });
});
