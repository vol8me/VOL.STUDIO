import { describe, expect, it } from 'vitest';
import {
  isPointInNormalizedRegion,
  resolveNormalizedInputRegion,
  screenToCameraLayer,
} from '../../src/input/InputUtils';

/** İleri dönüşüm: kamera matrisi bir `scrollFactor: 0` katmanı böyle çizer. */
const toScreen = (layer: number, origin: number, halfSize: number, zoom: number): number =>
  (layer - halfSize) * zoom + halfSize + origin;

describe('screenToCameraLayer', () => {
  it.each([0.5, 0.71, 1, 2.75, 3])('zoom %s: dönüşüm gerçekten TERSİDİR', (zoom) => {
    const halfSize = 1170;
    const origin = 0;

    for (const screen of [0, 1, 400, halfSize, 2000, 2340]) {
      const layer = screenToCameraLayer(screen, origin, halfSize, zoom);
      expect(toScreen(layer, origin, halfSize, zoom)).toBeCloseTo(screen, 6);
    }
  });

  it('kamera ötelemesini hesaba katar', () => {
    const layer = screenToCameraLayer(500, 120, 400, 2);
    expect(toScreen(layer, 120, 400, 2)).toBeCloseTo(500, 6);
  });

  it('orta nokta zoomdan BAĞIMSIZ olarak yerinde kalır', () => {
    // Ölçek merkez etrafında uygulandığı için merkez sabit noktadır.
    for (const zoom of [0.25, 1, 4]) {
      expect(screenToCameraLayer(1170, 0, 1170, zoom)).toBeCloseTo(1170, 9);
    }
  });

  it('yalnız bölen naif dönüşümden AYRIŞIR — sapma ölçülebilir', () => {
    const halfSize = 1170;
    const zoom = 2.75;
    const screen = 400;

    const naive = screen / zoom;
    const correct = screenToCameraLayer(screen, 0, halfSize, zoom);

    // Sapma tam olarak `yarıBoyut × (1 − 1/zoom)` kadardır.
    expect(correct - naive).toBeCloseTo(halfSize * (1 - 1 / zoom), 6);
    expect(Math.abs(correct - naive)).toBeGreaterThan(700);
  });

  it('geçersiz zoom 1 sayılır — bozuk bir kare çubuğu ışınlamaz', () => {
    for (const zoom of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(screenToCameraLayer(400, 0, 1170, zoom)).toBe(400);
    }
  });
});

describe('isPointInNormalizedRegion', () => {
  const lowerLeft = { minX: 0, maxX: 0.48, minY: 0.42, maxY: 1 };

  it('yalnız tanımlı başparmak bölgesini kabul eder', () => {
    expect(isPointInNormalizedRegion(0.2, 0.8, lowerLeft)).toBe(true);
    expect(isPointInNormalizedRegion(0.7, 0.8, lowerLeft)).toBe(false);
    expect(isPointInNormalizedRegion(0.2, 0.2, lowerLeft)).toBe(false);
  });

  it('sınırları kapalı aralık olarak kabul eder', () => {
    expect(isPointInNormalizedRegion(0, 0.42, lowerLeft)).toBe(true);
    expect(isPointInNormalizedRegion(0.48, 1, lowerLeft)).toBe(true);
  });

  it('geçersiz sayı ve ters aralık tüm ekranı yanlışlıkla açmaz', () => {
    expect(isPointInNormalizedRegion(Number.NaN, 0.5, lowerLeft)).toBe(false);
    expect(isPointInNormalizedRegion(0.5, 0.5, { minX: 0.8, maxX: 0.2, minY: 0, maxY: 1 })).toBe(
      false,
    );
  });
});

describe('resolveNormalizedInputRegion', () => {
  const fallback = { minX: 0, maxX: 0.5, minY: 0, maxY: 1 };

  it('yalnız undefined için varsayılana döner', () => {
    expect(resolveNormalizedInputRegion(undefined, fallback)).toBe(fallback);
  });

  it('null değerini stick kapatma niyeti olarak korur', () => {
    expect(resolveNormalizedInputRegion(null, fallback)).toBeNull();
  });

  it('verilen özel bölgeyi değiştirmez', () => {
    const custom = { minX: 0, maxX: 0.48, minY: 0.42, maxY: 1 };
    expect(resolveNormalizedInputRegion(custom, fallback)).toBe(custom);
  });
});
