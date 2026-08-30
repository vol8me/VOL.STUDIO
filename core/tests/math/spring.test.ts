import { describe, it, expect } from 'vitest';
import { Spring1D } from '../../src/math/Spring';

const CONFIG = { stiffness: 120, damping: 14 };

describe('Spring1D', () => {
  it('sabit bir hedefe zamanla yakınsar', () => {
    const spring = new Spring1D(0);
    for (let i = 0; i < 300; i++) {
      spring.update(10, 16, CONFIG);
    }
    expect(spring.value).toBeCloseTo(10, 1);
    expect(spring.velocity).toBeCloseTo(0, 1);
  });

  it('deltaMs <= 0 veya sonsuz değilse value/velocity DEĞİŞMEZ', () => {
    const spring = new Spring1D(5);
    spring.velocity = 2;
    spring.update(100, 0, CONFIG);
    expect(spring.value).toBe(5);
    expect(spring.velocity).toBe(2);

    spring.update(100, -16, CONFIG);
    spring.update(100, NaN, CONFIG);
    expect(spring.value).toBe(5);
    expect(spring.velocity).toBe(2);
  });

  it('sonsuz olmayan hedef değeri/hızı değiştirmez', () => {
    const spring = new Spring1D(5);
    spring.update(NaN, 16, CONFIG);
    expect(spring.value).toBe(5);
  });

  it('geçersiz stiffness/damping (sonsuz değil ya da negatif) fırlatır', () => {
    const spring = new Spring1D(0);
    expect(() => spring.update(10, 16, { stiffness: NaN, damping: 10 })).toThrow(/sonlu/);
    expect(() => spring.update(10, 16, { stiffness: -1, damping: 10 })).toThrow();
    expect(() => spring.update(10, 16, { stiffness: 10, damping: -1 })).toThrow();
  });

  it('reset değeri ve hızı sıfırlar (verilen değere)', () => {
    const spring = new Spring1D(0);
    spring.update(10, 16, CONFIG);
    expect(spring.velocity).not.toBe(0);

    spring.reset(3);
    expect(spring.value).toBe(3);
    expect(spring.velocity).toBe(0);
  });

  it("büyük bir kare hitch'inde patlamaz (deltaMs kelepçelenir)", () => {
    const spring = new Spring1D(0);
    spring.update(10, 5000, CONFIG);
    expect(Number.isFinite(spring.value)).toBe(true);
    expect(Number.isFinite(spring.velocity)).toBe(true);
  });
});
