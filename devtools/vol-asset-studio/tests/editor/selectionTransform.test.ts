import { describe, expect, it } from 'vitest';
import { RasterSurface, type Rgba } from '../../src/editor/RasterSurface';
import { SelectionModel } from '../../src/editor/SelectionModel';
import {
  clearOutsideMask,
  crop,
  flipHorizontal,
  flipVertical,
  resizeCanvas,
  rotateQuarterTurns,
  scaleNearest,
  type RasterBuffer,
} from '../../src/editor/transform';

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

describe('SelectionModel', () => {
  it('seçim yokken BÜTÜN belge düzenlenebilirdir', () => {
    const selection = new SelectionModel(8, 8);

    expect(selection.isEmpty).toBe(true);
    expect(selection.isEditable(0, 0)).toBe(true);
    expect(selection.isEditable(7, 7)).toBe(true);
    expect(selection.isEditable(8, 0)).toBe(false);
  });

  it('dikdörtgen seçim sınırlarını ve kutusunu verir', () => {
    const selection = new SelectionModel(10, 10);

    selection.applyRect({ x: 2, y: 3, width: 4, height: 2 });

    expect(selection.isEmpty).toBe(false);
    expect(selection.bounds).toEqual({ x: 2, y: 3, width: 4, height: 2 });
    expect(selection.contains(2, 3)).toBe(true);
    expect(selection.contains(5, 4)).toBe(true);
    expect(selection.contains(6, 4)).toBe(false);
    expect(selection.isEditable(0, 0)).toBe(false);
  });

  it('ekleme, çıkarma ve kesişim birleştirir', () => {
    const selection = new SelectionModel(10, 10);
    selection.applyRect({ x: 0, y: 0, width: 5, height: 5 });

    selection.applyRect({ x: 4, y: 0, width: 5, height: 5 }, 'add');
    expect(selection.bounds?.width).toBe(9);

    selection.applyRect({ x: 0, y: 0, width: 2, height: 10 }, 'subtract');
    expect(selection.contains(1, 1)).toBe(false);
    expect(selection.contains(3, 1)).toBe(true);

    selection.applyRect({ x: 0, y: 0, width: 4, height: 4 }, 'intersect');
    expect(selection.contains(3, 3)).toBe(true);
    expect(selection.contains(5, 1)).toBe(false);
  });

  it('lasso çokgeni doldurur', () => {
    const selection = new SelectionModel(10, 10);

    selection.applyPolygon([
      { x: 1, y: 1 },
      { x: 8, y: 1 },
      { x: 8, y: 8 },
      { x: 1, y: 8 },
    ]);

    expect(selection.contains(4, 4)).toBe(true);
    expect(selection.contains(0, 0)).toBe(false);
  });

  it('sihirli değnek bitişik alanı seçer, duvarı geçmez', () => {
    const surface = new RasterSurface(10, 10);
    for (let y = 0; y < 10; y += 1) surface.setPixel(5, y, BLUE);
    const selection = new SelectionModel(10, 10);

    selection.applyMagicWand(surface, 1, 1, 0);

    expect(selection.contains(0, 0)).toBe(true);
    expect(selection.contains(4, 9)).toBe(true);
    expect(selection.contains(5, 5)).toBe(false);
    expect(selection.contains(6, 5)).toBe(false);
  });

  it('tolerans yakın renkleri kapsar', () => {
    const surface = new RasterSurface(4, 1);
    surface.setPixel(0, 0, { r: 100, g: 100, b: 100, a: 255 });
    surface.setPixel(1, 0, { r: 108, g: 100, b: 100, a: 255 });
    surface.setPixel(2, 0, { r: 200, g: 100, b: 100, a: 255 });
    const selection = new SelectionModel(4, 1);

    selection.applyMagicWand(surface, 0, 0, 10);

    expect(selection.contains(1, 0)).toBe(true);
    expect(selection.contains(2, 0)).toBe(false);
  });

  it('snapshot ve restore maskeyi birebir taşır', () => {
    const selection = new SelectionModel(6, 6);
    selection.applyRect({ x: 1, y: 1, width: 3, height: 3 });
    const snapshot = selection.snapshot();

    selection.clear();
    expect(selection.isEmpty).toBe(true);
    selection.restore(snapshot);

    expect(selection.bounds).toEqual({ x: 1, y: 1, width: 3, height: 3 });
  });

  it('selectAll ve clear uçları kapsar', () => {
    const selection = new SelectionModel(4, 4);

    selection.selectAll();
    expect(selection.bounds).toEqual({ x: 0, y: 0, width: 4, height: 4 });

    selection.clear();
    expect(selection.bounds).toBeNull();
  });
});

describe('transform', () => {
  it('yatay ve dikey aynalama', () => {
    const source = buffer(3, 2);
    setPixel(source, 0, 0, RED);

    expect(pixelAt(flipHorizontal(source), 2, 0)).toEqual(RED);
    expect(pixelAt(flipVertical(source), 0, 1)).toEqual(RED);
  });

  it('90 derece döndürmede kenarlar takas olur', () => {
    const source = buffer(4, 2);
    setPixel(source, 0, 0, RED);

    const rotated = rotateQuarterTurns(source, 1);

    expect(rotated.width).toBe(2);
    expect(rotated.height).toBe(4);
    expect(pixelAt(rotated, 1, 0)).toEqual(RED);
  });

  it('dört çeyrek dönüş başlangıca döner', () => {
    const source = buffer(3, 3);
    setPixel(source, 0, 1, RED);
    setPixel(source, 2, 2, BLUE);

    const round = rotateQuarterTurns(source, 4);

    expect(Array.from(round.rgba)).toEqual(Array.from(source.rgba));
  });

  it('nearest-neighbor ölçekleme ara renk üretmez', () => {
    const source = buffer(2, 2);
    setPixel(source, 0, 0, RED);
    setPixel(source, 1, 1, BLUE);

    const scaled = scaleNearest(source, 4, 4);

    expect(scaled.width).toBe(4);
    // Enterpolasyon olsaydı burada karışım rengi çıkardı.
    const colors = new Set<string>();
    for (let i = 0; i < scaled.rgba.length; i += 4) {
      colors.add(
        `${scaled.rgba[i]},${scaled.rgba[i + 1]},${scaled.rgba[i + 2]},${scaled.rgba[i + 3]}`,
      );
    }
    expect(colors.has('255,0,0,255')).toBe(true);
    expect(colors.has('0,0,255,255')).toBe(true);
    expect(colors.size).toBeLessThanOrEqual(3);
  });

  it('crop dışarı taşan bölgeyi saydam bırakır', () => {
    const source = buffer(4, 4);
    setPixel(source, 3, 3, RED);

    const cropped = crop(source, { x: 2, y: 2, width: 4, height: 4 });

    expect(cropped.width).toBe(4);
    expect(pixelAt(cropped, 1, 1)).toEqual(RED);
    expect(pixelAt(cropped, 3, 3).a).toBe(0);
  });

  it('canvas resize içeriği ÖLÇEKLEMEZ, yeniden konumlar', () => {
    const source = buffer(2, 2);
    setPixel(source, 0, 0, RED);

    const grown = resizeCanvas(source, 4, 4, 'center');

    expect(grown.width).toBe(4);
    expect(pixelAt(grown, 1, 1)).toEqual(RED);
  });

  it('resize çapası içeriği doğru köşeye yaslar', () => {
    const source = buffer(2, 2);
    setPixel(source, 0, 0, RED);

    const topLeft = resizeCanvas(source, 4, 4, 'top-left');
    const bottomRight = resizeCanvas(source, 4, 4, 'bottom-right');

    expect(pixelAt(topLeft, 0, 0)).toEqual(RED);
    expect(pixelAt(bottomRight, 2, 2)).toEqual(RED);
  });

  it('maske dışını temizler', () => {
    const source = buffer(2, 1);
    setPixel(source, 0, 0, RED);
    setPixel(source, 1, 0, BLUE);
    const mask = new Uint8Array([1, 0]);

    const cleared = clearOutsideMask(source, mask);

    expect(pixelAt(cleared, 0, 0)).toEqual(RED);
    expect(pixelAt(cleared, 1, 0).a).toBe(0);
  });
});
