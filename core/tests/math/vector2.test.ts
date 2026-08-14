import { describe, it, expect } from 'vitest';
import { Vector2 } from '../../src/math/Vector2';

describe('Vector2', () => {
  it('normalize sıfır olmayan vektörü birim uzunluğa çeker', () => {
    const v = new Vector2(3, 4).normalize();
    expect(v.length()).toBeCloseTo(1, 10);
    expect(v.x).toBeCloseTo(0.6, 10);
    expect(v.y).toBeCloseTo(0.8, 10);
  });

  it('normalize sıfır vektörü için (0,0) döner', () => {
    const v = new Vector2(0, 0).normalize();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('normalize NaN/Infinity bileşenler için (0,0) döner', () => {
    expect(new Vector2(NaN, 1).normalize()).toEqual(new Vector2(0, 0));
    expect(new Vector2(1, Infinity).normalize()).toEqual(new Vector2(0, 0));
    expect(new Vector2(Infinity, Infinity).normalize()).toEqual(new Vector2(0, 0));
  });

  it('normalizeInPlace aynı korumayı yerinde uygular', () => {
    const v = new Vector2(3, 4);
    v.normalizeInPlace();
    expect(v.length()).toBeCloseTo(1, 10);

    v.set(NaN, 5);
    v.normalizeInPlace();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });
});
