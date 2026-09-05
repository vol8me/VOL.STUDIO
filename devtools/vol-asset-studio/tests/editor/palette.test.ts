import { describe, expect, it } from 'vitest';
import {
  exportGpl,
  extractPalette,
  findUnusedColors,
  fromHex,
  generateOutline,
  importGpl,
  quantizeToPalette,
  replaceColor,
  toHex,
} from '../../src/editor/Palette';
import type { Rgba } from '../../src/editor/RasterSurface';
import type { RasterBuffer } from '../../src/editor/transform';

const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 };
const BLUE: Rgba = { r: 0, g: 0, b: 255, a: 255 };

function buffer(width: number, height: number): RasterBuffer {
  return { width, height, rgba: new Uint8ClampedArray(width * height * 4) };
}

function setPixel(target: RasterBuffer, x: number, y: number, color: Rgba): void {
  const index = (y * target.width + x) * 4;
  target.rgba[index] = color.r;
  target.rgba[index + 1] = color.g;
  target.rgba[index + 2] = color.b;
  target.rgba[index + 3] = color.a;
}

function pixelAt(source: RasterBuffer, x: number, y: number): Rgba {
  const index = (y * source.width + x) * 4;
  return {
    r: source.rgba[index],
    g: source.rgba[index + 1],
    b: source.rgba[index + 2],
    a: source.rgba[index + 3],
  };
}

describe('Palette', () => {
  it('hex dönüşümü çift yönlü tutarlıdır', () => {
    expect(toHex({ r: 18, g: 52, b: 86, a: 255 })).toBe('#123456');
    expect(fromHex('#123456')).toEqual({ r: 18, g: 52, b: 86, a: 255 });
    expect(fromHex('bozuk')).toEqual({ r: 0, g: 0, b: 0, a: 255 });
  });

  it('paleti kullanım sayısına göre çıkarır ve saydamı atlar', () => {
    const source = buffer(3, 1);
    setPixel(source, 0, 0, RED);
    setPixel(source, 1, 0, RED);
    setPixel(source, 2, 0, BLUE);

    const palette = extractPalette(source);

    expect(palette).toEqual([
      { hex: '#ff0000', count: 2 },
      { hex: '#0000ff', count: 1 },
    ]);
  });

  it('tümüyle saydam belge boş palet verir', () => {
    expect(extractPalette(buffer(4, 4))).toEqual([]);
  });

  it('kullanılmayan renkleri bulur', () => {
    const source = buffer(1, 1);
    setPixel(source, 0, 0, RED);

    expect(findUnusedColors(source, ['#ff0000', '#00ff00'])).toEqual(['#00ff00']);
  });

  it('renk değiştirme alfayı KORUR', () => {
    const source = buffer(2, 1);
    setPixel(source, 0, 0, { ...RED, a: 128 });
    setPixel(source, 1, 0, BLUE);

    const replaced = replaceColor(source, RED, { r: 0, g: 255, b: 0, a: 255 });

    expect(pixelAt(replaced, 0, 0)).toEqual({ r: 0, g: 255, b: 0, a: 128 });
    expect(pixelAt(replaced, 1, 0)).toEqual(BLUE);
  });

  it('renk değiştirme maskeye saygı duyar', () => {
    const source = buffer(2, 1);
    setPixel(source, 0, 0, RED);
    setPixel(source, 1, 0, RED);

    const replaced = replaceColor(source, RED, BLUE, new Uint8Array([1, 0]));

    expect(pixelAt(replaced, 0, 0)).toEqual(BLUE);
    expect(pixelAt(replaced, 1, 0)).toEqual(RED);
  });

  it('quantize her pikseli palete oturtur', () => {
    const source = buffer(2, 1);
    setPixel(source, 0, 0, { r: 250, g: 10, b: 10, a: 255 });
    setPixel(source, 1, 0, { r: 10, g: 10, b: 250, a: 255 });

    const quantized = quantizeToPalette(source, { palette: ['#ff0000', '#0000ff'] });

    expect(pixelAt(quantized, 0, 0)).toEqual(RED);
    expect(pixelAt(quantized, 1, 0)).toEqual(BLUE);
  });

  it('quantize saydam pikseli renklendirmez', () => {
    const source = buffer(1, 1);

    const quantized = quantizeToPalette(source, { palette: ['#ff0000'] });

    expect(pixelAt(quantized, 0, 0).a).toBe(0);
  });

  it('boş palet belgeyi değiştirmez', () => {
    const source = buffer(1, 1);
    setPixel(source, 0, 0, RED);

    expect(Array.from(quantizeToPalette(source, { palette: [] }).rgba)).toEqual(
      Array.from(source.rgba),
    );
  });

  it('dither sonucu yine palet içinde kalır', () => {
    const source = buffer(8, 8);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) setPixel(source, x, y, { r: 128, g: 128, b: 128, a: 255 });
    }

    const quantized = quantizeToPalette(source, {
      palette: ['#000000', '#ffffff'],
      dither: 'bayer4',
      ditherAmount: 1,
    });

    for (let index = 0; index < quantized.rgba.length; index += 4) {
      const value = quantized.rgba[index];
      expect(value === 0 || value === 255).toBe(true);
    }
  });

  it('outline yalnız saydam kenara çizer', () => {
    const source = buffer(3, 3);
    setPixel(source, 1, 1, RED);

    const outlined = generateOutline(source, BLUE);

    expect(pixelAt(outlined, 1, 1)).toEqual(RED);
    expect(pixelAt(outlined, 0, 1)).toEqual(BLUE);
    expect(pixelAt(outlined, 0, 0).a).toBe(0);
  });

  it('çapraz outline köşeleri de kapatır', () => {
    const source = buffer(3, 3);
    setPixel(source, 1, 1, RED);

    const outlined = generateOutline(source, BLUE, true);

    expect(pixelAt(outlined, 0, 0)).toEqual(BLUE);
  });

  it('GPL dışa/içe aktarımı çift yönlüdür', () => {
    const palette = ['#ff0000', '#00ff00', '#0000ff'];

    expect(importGpl(exportGpl('test', palette))).toEqual(palette);
  });
});
