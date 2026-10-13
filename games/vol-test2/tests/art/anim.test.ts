import { describe, expect, it } from 'vitest';
import { animationRange, animationValue, type AnimSpec } from '../../src/art/anim';

describe('animationValue', () => {
  it('spin: rpm başına tam tur, 360 derecede sarar', () => {
    const spec: AnimSpec = { kind: 'spin', rpm: 60 };
    expect(animationValue(spec, 0)).toBe(0);
    expect(animationValue(spec, 0.25)).toBeCloseTo(90);
    expect(animationValue(spec, 1)).toBeCloseTo(0);
    expect(animationValue(spec, 1.5)).toBeCloseTo(180);
    expect(animationValue({ kind: 'spin', rpm: -60 }, 0.25)).toBeCloseTo(270);
  });

  it('sweep: orta açı çevresinde salınır', () => {
    const spec: AnimSpec = { kind: 'sweep', centerDeg: 10, amplitudeDeg: 40, hz: 1 };
    expect(animationValue(spec, 0)).toBeCloseTo(10);
    expect(animationValue(spec, 0.25)).toBeCloseTo(50);
    expect(animationValue(spec, 0.75)).toBeCloseTo(-30);
  });

  it('pulse: min ile max arasında kalır ve yarım periyotta uçları gezer', () => {
    const spec: AnimSpec = { kind: 'pulse', min: 0.4, max: 1, hz: 2 };
    expect(animationValue(spec, 0)).toBeCloseTo(0.7);
    expect(animationValue(spec, 0.125)).toBeCloseTo(1);
    expect(animationValue(spec, 0.375)).toBeCloseTo(0.4);
  });

  it('scroll: periyotta sarar ve geriye de sarar', () => {
    const spec: AnimSpec = { kind: 'scroll', unitsPerSecond: 32, period: 64 };
    expect(animationValue(spec, 0.5)).toBeCloseTo(16);
    expect(animationValue(spec, 2)).toBeCloseTo(0);
    expect(animationValue(spec, 2.5)).toBeCloseTo(16);
    expect(animationValue({ kind: 'scroll', unitsPerSecond: -32, period: 64 }, 0.5)).toBeCloseTo(
      48,
    );
  });

  it('kick: her periyotta tepeden başlar ve üstel olarak söner', () => {
    const spec: AnimSpec = { kind: 'kick', units: 6, periodMs: 1000, decayMs: 100 };
    expect(animationValue(spec, 0)).toBeCloseTo(-6);
    expect(animationValue(spec, 0.1)).toBeCloseTo(-6 * Math.exp(-1));
    expect(animationValue(spec, 0.9)).toBeGreaterThan(-0.01);
    expect(animationValue(spec, 1)).toBeCloseTo(-6); // yeni periyot
  });

  it('flash: 1den başlar, doğrusal sönüp 0da kalır', () => {
    const spec: AnimSpec = { kind: 'flash', periodMs: 1000, decayMs: 200 };
    expect(animationValue(spec, 0)).toBe(1);
    expect(animationValue(spec, 0.1)).toBeCloseTo(0.5);
    expect(animationValue(spec, 0.2)).toBeCloseTo(0);
    expect(animationValue(spec, 0.6)).toBe(0);
  });

  it('faz kayması iki özdeş nesneyi birbirinden ayırır', () => {
    const spec: AnimSpec = { kind: 'spin', rpm: 60 };
    expect(animationValue(spec, 1, 0.5)).toBeCloseTo(180);
    expect(animationValue(spec, 1, 0)).not.toBeCloseTo(animationValue(spec, 1, 0.5));
  });

  it('aynı zaman aynı değeri verir (durum tutulmaz)', () => {
    const spec: AnimSpec = { kind: 'sweep', centerDeg: 0, amplitudeDeg: 30, hz: 0.7 };
    expect(animationValue(spec, 3.3)).toBe(animationValue(spec, 3.3));
  });

  it('değer her zaman bildirilen aralıkta kalır', () => {
    const specs: AnimSpec[] = [
      { kind: 'spin', rpm: 45 },
      { kind: 'sweep', centerDeg: 10, amplitudeDeg: 25, hz: 0.4 },
      { kind: 'pulse', min: 0.3, max: 0.9, hz: 1.3 },
      { kind: 'scroll', unitsPerSecond: 40, period: 64 },
      { kind: 'kick', units: 5, periodMs: 700, decayMs: 90 },
      { kind: 'flash', periodMs: 700, decayMs: 120 },
    ];
    for (const spec of specs) {
      const { min, max } = animationRange(spec);
      for (let t = -3; t < 9; t += 0.0371) {
        const value = animationValue(spec, t, 0.13);
        expect(value, spec.kind).toBeGreaterThanOrEqual(min - 1e-9);
        expect(value, spec.kind).toBeLessThanOrEqual(max + 1e-9);
      }
    }
  });
});
