import { describe, expect, it } from 'vitest';
import { RollingWindow } from '../../src/collections/RollingWindow';

describe('RollingWindow', () => {
  it('boş pencere bölmeden sıfır istatistik verir', () => {
    const window = new RollingWindow();
    expect(window.count).toBe(0);
    expect(window.average).toBe(0);
    expect(window.min).toBe(0);
    expect(window.max).toBe(0);
    expect(window.percentile(0.5)).toBe(0);
  });

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'geçersiz kapasiteyi sessizce düzeltmez: %s',
    (capacity) => {
      expect(() => new RollingWindow(capacity)).toThrow(RangeError);
    },
  );

  it('halka birkaç kez döndüğünde yalnız son N örneği özetler', () => {
    const window = new RollingWindow(3);
    for (const value of [10, 20, 30, 40, 50, 60, 70, 80]) window.push(value);
    expect(window.count).toBe(3);
    expect(window.average).toBe(70);
    expect(window.min).toBe(60);
    expect(window.max).toBe(80);
    expect(window.percentile(0.5)).toBe(70);
  });

  it('düşen uçtan sonraki yeni uçlar tembel okumada da günceldir', () => {
    const window = new RollingWindow(3);
    for (const value of [1, 50, 5]) window.push(value);
    expect(window.min).toBe(1);
    expect(window.max).toBe(50);
    for (const value of [7, 9]) window.push(value);
    expect(window.min).toBe(5);
    expect(window.max).toBe(9);
    window.push(100);
    expect(window.max).toBe(100);
  });

  it('negatif örneklerin maksimumunu sıfıra yükseltmez ve sıfırı örnek sayar', () => {
    const window = new RollingWindow(3);
    for (const value of [-8, -4, -6]) window.push(value);
    expect(window.average).toBe(-6);
    expect(window.min).toBe(-8);
    expect(window.max).toBe(-4);
    window.push(0);
    expect(window.count).toBe(3);
    expect(window.max).toBe(0);
    expect(window.average).toBeCloseTo(-10 / 3);
  });

  it('bozuk örnek kapasite tüketmez ve geçerli pencereyi zehirlemez', () => {
    const window = new RollingWindow(2);
    window.push(4);
    window.push(8);
    for (const value of [NaN, Infinity, -Infinity]) window.push(value);
    expect(window.count).toBe(2);
    expect(window.average).toBe(6);
    expect(window.min).toBe(4);
    expect(window.max).toBe(8);
    expect(window.percentile(0.5)).toBe(8);
  });

  it('yüzdelik mevcut floor(N × oran) sözleşmesini ve uçları korur', () => {
    const window = new RollingWindow(4);
    for (const value of [30, 10, 40, 20]) window.push(value);
    expect(window.percentile(0)).toBe(10);
    expect(window.percentile(0.25)).toBe(20);
    expect(window.percentile(0.5)).toBe(30);
    expect(window.percentile(0.95)).toBe(40);
    expect(window.percentile(1)).toBe(40);
    window.push(5);
    expect(window.percentile(0.5)).toBe(20);
    expect(window.min).toBe(5);
    expect(window.max).toBe(40);
  });

  it.each([-0.01, 1.01, NaN, Infinity, -Infinity])(
    'boş ve dolu pencerede geçersiz yüzdelik oranını reddeder: %s',
    (fraction) => {
      const window = new RollingWindow(2);
      expect(() => window.percentile(fraction)).toThrow(RangeError);
      window.push(1);
      expect(() => window.percentile(fraction)).toThrow(RangeError);
    },
  );

  it('clear eski sıralamayı, uçları ve halka konumunu bırakır', () => {
    const window = new RollingWindow(3);
    for (const value of [1, 2, 3, 4]) window.push(value);
    expect(window.percentile(0.5)).toBe(3);
    window.clear();
    expect(window.count).toBe(0);
    expect(window.average).toBe(0);
    expect(window.min).toBe(0);
    expect(window.max).toBe(0);
    expect(window.percentile(1)).toBe(0);
    window.push(-5);
    expect(window.count).toBe(1);
    expect(window.average).toBe(-5);
    expect(window.min).toBe(-5);
    expect(window.max).toBe(-5);
    expect(window.percentile(0.5)).toBe(-5);
  });

  it('tek yuvada önceki örnek bütünüyle düşer', () => {
    const window = new RollingWindow(1);
    window.push(12);
    window.push(-3);
    expect(window.count).toBe(1);
    expect(window.average).toBe(-3);
    expect(window.min).toBe(-3);
    expect(window.max).toBe(-3);
  });

  it('büyük örnek düşerken yanında yutulmuş küçük örneğin toplamını korur', () => {
    const window = new RollingWindow(2);
    window.push(1e16);
    window.push(1);
    window.push(1);
    expect(window.average).toBe(1);
  });

  it('sonlu büyük örneklerin taşan toplamı ortalamayı ve sonraki pencereyi bozmaz', () => {
    const window = new RollingWindow(2);
    window.push(Number.MAX_VALUE);
    window.push(Number.MAX_VALUE);
    expect(window.average).toBe(Number.MAX_VALUE);
    window.push(-Number.MAX_VALUE);
    expect(window.average).toBe(0);
    window.push(2);
    window.push(4);
    expect(window.average).toBe(3);
  });
});
