import { describe, expect, it } from 'vitest';
import { createLimbOutline, limbOutline } from '@/view/spider/limbShadow';

describe('limbOutline', () => {
  it('iki eklemli düz uzuv kalınlığı kadar bir dikdörtgendir', () => {
    const out = limbOutline([0, 10], [0, 0], [4, 4], 2, createLimbOutline());
    expect(out.count).toBe(4);
    const pts = out.points.slice(0, 8);
    // Sol kenar eklemden uca, sağ kenar uçtan eklemeye; eksen +x olduğundan normal +y'dir.
    expect(pts).toEqual([0, 2, 10, 2, 10, -2, 0, -2]);
  });

  it('üç eklemli uzuvda dirsek birleşimi iki kemiğin ortak köşesidir ve en çok sınır kadar genişler', () => {
    // Dik dirsek: (0,0) → (10,0) → (10,10).
    const out = limbOutline([0, 10, 10], [0, 0, 10], [2, 2, 2], 3, createLimbOutline());
    expect(out.count).toBe(6);
    const [, , kx, ky] = out.points;
    // Sol köşe dirsekte iki normalin ortalamasındadır: yarı genişlik 1, dik açıda 1/cos45° ≈ 1.41.
    expect(Math.hypot(kx - 10, ky - 0)).toBeCloseTo(Math.SQRT2, 3);
    const sharp = limbOutline([0, 10, 0.2], [0, 0, 0.1], [2, 2, 2], 3, createLimbOutline());
    for (let i = 0; i < sharp.count; i++) {
      expect(Number.isFinite(sharp.points[i * 2])).toBe(true);
      expect(Number.isFinite(sharp.points[i * 2 + 1])).toBe(true);
    }
    // Sivri açıda köşe 1.8 yarı genişlikten fazla uzamaz.
    expect(Math.hypot(sharp.points[2] - 10, sharp.points[3] - 0)).toBeLessThanOrEqual(1.8 + 1e-9);
  });

  it('çakışan eklemler (sıfır uzunlukta kemik) NaN üretmez', () => {
    const out = limbOutline([5, 5, 5], [5, 5, 5], [2, 2, 2], 3, createLimbOutline());
    for (let i = 0; i < out.count * 2; i++) expect(Number.isFinite(out.points[i])).toBe(true);
  });

  it('kalınlık uca doğru incelir: uçtaki iki köşenin arası daha dardır', () => {
    const out = limbOutline([0, 10, 20], [0, 0, 0], [8, 6, 3], 3, createLimbOutline());
    const width = (leftIndex: number, rightIndex: number): number =>
      Math.abs(out.points[leftIndex * 2 + 1] - out.points[rightIndex * 2 + 1]);
    expect(width(0, 5)).toBeCloseTo(8);
    expect(width(2, 3)).toBeCloseTo(3);
  });
});
