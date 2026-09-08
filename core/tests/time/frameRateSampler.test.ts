import { describe, expect, it } from 'vitest';
import { FrameRateSampler, RollingWindow } from '../../src/time/FrameRateSampler';

describe('RollingWindow', () => {
  it('boşken sıfır bildirir — bölme yapmaz', () => {
    const w = new RollingWindow(4);
    expect(w.count).toBe(0);
    expect(w.average).toBe(0);
    expect(w.min).toBe(0);
    expect(w.max).toBe(0);
  });

  it('kapasiteyi aşan en eski örneği düşürür', () => {
    const w = new RollingWindow(3);
    for (const v of [10, 20, 30, 40]) w.push(v);
    expect(w.count).toBe(3);
    expect(w.average).toBeCloseTo(30, 10);
  });

  /* Düşen değer uç değerlerden biriyse tam tarama gerekir; asıl tuzak burası. */
  it('uç değer pencereden düştüğünde min/max YENİDEN hesaplanır', () => {
    const w = new RollingWindow(3);
    w.push(1);
    w.push(50);
    w.push(5);
    expect(w.min).toBe(1);
    expect(w.max).toBe(50);

    w.push(7); // 1 düşer
    expect(w.min).toBe(5);
    expect(w.max).toBe(50);

    w.push(9); // 50 düşer
    expect(w.min).toBe(5);
    expect(w.max).toBe(9);
  });

  it('clear() pencereyi ve uçları sıfırlar', () => {
    const w = new RollingWindow(3);
    w.push(12);
    w.clear();
    expect(w.count).toBe(0);
    expect(w.average).toBe(0);
    expect(w.min).toBe(0);
    expect(w.max).toBe(0);
  });

  it('kapasite en az 1 olur', () => {
    const w = new RollingWindow(0);
    w.push(4);
    w.push(8);
    expect(w.count).toBe(1);
    expect(w.average).toBe(8);
  });
});

describe('FrameRateSampler', () => {
  it('İLK damga örnek üretmez — yalnız taban kurar', () => {
    const s = new FrameRateSampler();
    expect(s.sample(1000)).toBe(false);
    expect(s.count).toBe(0);
    expect(s.fps).toBe(0);
  });

  /*
   * `performance.now()` sayfa açılışında tam 0 dönebilir. Taban bir sentinel
   * değerle (lastMs > 0) izlenirse örnekleyici o koşuda HİÇ örnek üretmez ve
   * gösterge sonsuza kadar 0 FPS yazar.
   */
  it('taban SIFIR damgayla da kurulur', () => {
    const s = new FrameRateSampler();
    expect(s.sample(0)).toBe(false);
    expect(s.sample(16)).toBe(true);
    expect(s.count).toBe(1);
    expect(s.average).toBe(16);
  });

  it('damgalardan aralık, aralıklardan FPS türetir', () => {
    const s = new FrameRateSampler();
    let t = 0;
    s.sample(t);
    for (let i = 0; i < 10; i++) {
      t += 16.6667;
      s.sample(t);
    }
    expect(s.count).toBe(10);
    expect(s.average).toBeCloseTo(16.6667, 3);
    expect(s.fps).toBeCloseTo(60, 1);
  });

  /*
   * Sekme arka plandan döndüğünde aradaki boşluk bir kare aralığı DEĞİLDİR.
   * Pencereye girerse gösterge saniyelerce yanlış düşük kalır.
   */
  it('markBaseline duraklamayı pencereye SOKMAZ', () => {
    const s = new FrameRateSampler();
    let t = 0;
    s.sample(t);
    for (let i = 0; i < 5; i++) {
      t += 16;
      s.sample(t);
    }
    const before = s.fps;

    t += 30_000; // 30 sn arka planda
    s.markBaseline(t);
    t += 16;
    s.sample(t);

    expect(s.fps).toBeCloseTo(before, 0);
    expect(s.max).toBeLessThan(100);
  });

  it('push() ham süre ekler — damga değil', () => {
    const s = new FrameRateSampler();
    s.push(10);
    s.push(30);
    expect(s.count).toBe(2);
    expect(s.average).toBe(20);
    expect(s.min).toBe(10);
    expect(s.max).toBe(30);
  });

  it('clear() tabanı da düşürür', () => {
    const s = new FrameRateSampler();
    s.sample(100);
    s.sample(116);
    s.clear();
    expect(s.count).toBe(0);
    expect(s.sample(500)).toBe(false);
  });
});
