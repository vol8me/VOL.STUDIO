import { describe, expect, it } from 'vitest';
import { FrameRateSampler } from '../../src/time/FrameRateSampler';

describe('FrameRateSampler', () => {
  it('bozuk damga ve taban geçerli aralığın ölçümünü düşürmez', () => {
    const sampler = new FrameRateSampler(2);
    expect(sampler.sample(NaN)).toBe(false);
    expect(sampler.sample(0)).toBe(false);
    expect(sampler.sample(Infinity)).toBe(false);
    sampler.markBaseline(NaN);
    expect(sampler.sample(16)).toBe(true);
    expect(sampler.count).toBe(1);
    expect(sampler.average).toBe(16);
    sampler.push(NaN);
    expect(sampler.count).toBe(1);
  });

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
