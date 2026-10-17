import { describe, it, expect } from 'vitest';
import {
  clamp,
  clamp01,
  lerp,
  inverseLerp,
  remap,
  approach,
  damp,
  wrap,
} from '../../src/math/interpolation';

describe('interpolasyon', () => {
  it('clamp aralığa kelepçeler', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });

  it('clamp ters verilen sınırları takas eder', () => {
    expect(clamp(5, 10, 0)).toBe(5);
    expect(clamp(-1, 10, 0)).toBe(0);
  });

  it('NaN girdisi sızmaz', () => {
    // Bozuk bir değerin konum/can gibi alanlara sızması, kaynağı çok sonra
    // fark edilen bir hata biçimidir.
    expect(clamp(NaN, 0, 10)).toBe(0);
    expect(lerp(NaN, 10, 0.5)).toBeNaN();
    expect(Number.isFinite(approach(NaN, 10, 1))).toBe(false);
  });

  it('lerp uçları ve ortayı verir', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it('lerp t değerini KELEPÇELEMEZ (ekstrapolasyon bilinçli)', () => {
    expect(lerp(0, 10, 2)).toBe(20);
    expect(lerp(0, 10, -1)).toBe(-10);
  });

  it('inverseLerp lerpin tersidir', () => {
    expect(inverseLerp(10, 20, 15)).toBeCloseTo(0.5, 10);
    expect(lerp(10, 20, inverseLerp(10, 20, 17))).toBeCloseTo(17, 10);
  });

  it('sıfır genişlikte aralıkta inverseLerp 0 döner (sıfıra bölme yok)', () => {
    expect(inverseLerp(5, 5, 5)).toBe(0);
  });

  it('remap aralıklar arası eşler', () => {
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
    expect(remap(0, 0, 10, 20, 30)).toBe(20);
  });

  it('approach hedefi AŞMAZ ve ona ULAŞIR', () => {
    // lerp'ten farkı bu: sabit hızla yaklaşır ve eşitlik kontrolü tutar.
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(approach(10, 0, 3)).toBe(7);
    expect(approach(1, 10, -3)).toBe(4); // negatif adım mutlak alınır
  });

  it('damp KARE HIZINDAN bağımsızdır', () => {
    // Naif lerp her karede aynı oranı uygular ve 30 vs 144 FPS'te farklı
    // yumuşatır; damp aynı toplam sürede aynı sonuca varmalı.
    const oneBigStep = damp(0, 100, 0.9, 1000);

    let manySmall = 0;
    for (let i = 0; i < 100; i++) manySmall = damp(manySmall, 100, 0.9, 10);

    expect(manySmall).toBeCloseTo(oneBigStep, 6);
  });

  it('damp uç değerleri: 1 anında, 0 hiç', () => {
    expect(damp(0, 100, 1, 16)).toBe(100);
    expect(damp(0, 100, 0, 16)).toBe(0);
  });

  it('damp sıfır/negatif delta ile ilerlemez', () => {
    expect(damp(5, 100, 0.5, 0)).toBe(5);
    expect(damp(5, 100, 0.5, -16)).toBe(5);
  });

  it('wrap aralığa sarar, üst sınır DIŞLAYICIDIR', () => {
    expect(wrap(370, 0, 360)).toBe(10);
    expect(wrap(360, 0, 360)).toBe(0);
    expect(wrap(-10, 0, 360)).toBe(350);
    expect(wrap(5, 0, 360)).toBe(5);
  });

  it('wrap geçersiz aralıkta min döner', () => {
    expect(wrap(5, 10, 10)).toBe(10);
    expect(wrap(5, 10, 0)).toBe(10);
  });

  it('clamp01 kısayolu', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });
});
