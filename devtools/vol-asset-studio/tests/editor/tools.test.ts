import { describe, expect, it, vi } from 'vitest';
import { RasterSurface, type Rgba } from '../../src/editor/RasterSurface';
import {
  EyedropperTool,
  FillTool,
  PencilTool,
  brushOffsets,
  linePoints,
} from '../../src/editor/tools';
import type { ToolContext, ToolInput } from '../../src/editor/tools';

const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 };
const BLUE: Rgba = { r: 0, g: 0, b: 255, a: 255 };
const GREEN: Rgba = { r: 0, g: 255, b: 0, a: 255 };
const CLEAR: Rgba = { r: 0, g: 0, b: 0, a: 0 };

function makeContext(
  surface: RasterSurface,
  overrides: Partial<ToolContext> = {},
): ToolContext & { picked: Rgba | null } {
  const state = { picked: null as Rgba | null };
  return {
    surface,
    primaryColor: RED,
    secondaryColor: BLUE,
    brushSize: 1,
    setPrimaryColor: (color) => {
      state.picked = color;
    },
    isEditable: (x, y) => surface.contains(x, y),
    ...overrides,
    get picked() {
      return state.picked;
    },
  } as ToolContext & { picked: Rgba | null };
}

function input(x: number, y: number, button = 0): ToolInput {
  return { x, y, button, shiftKey: false, altKey: false };
}

describe('geometry', () => {
  it('Bresenham hızlı harekette boşluk bırakmaz', () => {
    const points = linePoints({ x: 0, y: 0 }, { x: 10, y: 4 });

    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points.at(-1)).toEqual({ x: 10, y: 4 });
    // Ardışık noktalar 8-komşuluk içinde kalmalı: aksi halde çizgi kesiklidir.
    for (let i = 1; i < points.length; i += 1) {
      expect(Math.abs(points[i].x - points[i - 1].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(points[i].y - points[i - 1].y)).toBeLessThanOrEqual(1);
    }
  });

  it('tek sayı fırça merkeze, çift sayı sola yaslanır', () => {
    expect(brushOffsets(1)).toEqual([{ x: 0, y: 0 }]);
    expect(brushOffsets(3)).toHaveLength(9);
    expect(brushOffsets(3)[0]).toEqual({ x: -1, y: -1 });
    expect(brushOffsets(2)[0]).toEqual({ x: 0, y: 0 });
  });
});

describe('PencilTool', () => {
  it('sürükleme boyunca tek komut üretir', () => {
    const surface = new RasterSurface(64, 64);
    const pencil = new PencilTool({ id: 'pencil', label: 'kalem' });
    const gesture = pencil.begin(makeContext(surface), input(2, 2));

    gesture?.update(input(20, 2));
    gesture?.update(input(20, 20));
    const command = gesture?.commit();

    expect(command).not.toBeNull();
    expect(surface.getPixel(2, 2)).toEqual(RED);
    expect(surface.getPixel(11, 2)).toEqual(RED); // ara nokta
    expect(surface.getPixel(20, 20)).toEqual(RED);
  });

  it('sağ tuş ikincil rengi kullanır', () => {
    const surface = new RasterSurface(32, 32);
    const pencil = new PencilTool({ id: 'pencil', label: 'kalem' });

    pencil.begin(makeContext(surface), input(4, 4, 2))?.commit();

    expect(surface.getPixel(4, 4)).toEqual(BLUE);
  });

  it('pointer cancel belgeyi gesture öncesine döndürür', () => {
    const surface = RasterSurface.fromRgba(32, 32, new Uint8ClampedArray(32 * 32 * 4));
    surface.setPixel(5, 5, GREEN);
    const pencil = new PencilTool({ id: 'pencil', label: 'kalem' });
    const gesture = pencil.begin(makeContext(surface), input(5, 5));

    gesture?.update(input(9, 9));
    gesture?.cancel();

    expect(surface.getPixel(5, 5)).toEqual(GREEN);
    expect(surface.getPixel(9, 9)).toEqual(CLEAR);
    expect(gesture?.commit()).toBeNull();
  });

  it('silgi saydam yazar ve aynı rengi tekrar silmez', () => {
    const surface = new RasterSurface(32, 32);
    surface.setPixel(3, 3, RED);
    const eraser = new PencilTool({ id: 'eraser', label: 'silgi', erase: true });

    eraser.begin(makeContext(surface), input(3, 3))?.commit();

    expect(surface.getPixel(3, 3)).toEqual(CLEAR);
    expect(eraser.begin(makeContext(surface), input(20, 20))?.commit()).toBeNull();
  });

  it('seçim dışına taşmaz', () => {
    const surface = new RasterSurface(32, 32);
    const context = makeContext(surface, {
      isEditable: (x, y) => surface.contains(x, y) && x < 10,
    });
    const pencil = new PencilTool({ id: 'pencil', label: 'kalem' });

    const gesture = pencil.begin(context, input(5, 5));
    gesture?.update(input(20, 5));
    gesture?.commit();

    expect(surface.getPixel(9, 5)).toEqual(RED);
    expect(surface.getPixel(10, 5)).toEqual(CLEAR);
  });

  it('fırça boyutu kare ayak izi bırakır', () => {
    const surface = new RasterSurface(32, 32);
    const pencil = new PencilTool({ id: 'pencil', label: 'kalem' });

    pencil.begin(makeContext(surface, { brushSize: 3 }), input(10, 10))?.commit();

    expect(surface.getPixel(9, 9)).toEqual(RED);
    expect(surface.getPixel(11, 11)).toEqual(RED);
    expect(surface.getPixel(12, 10)).toEqual(CLEAR);
  });
});

describe('FillTool', () => {
  it('bitişik alanı doldurur, komşu bölgeye sızmaz', () => {
    const surface = new RasterSurface(16, 16);
    // Dikey duvar: solu ve sağı ayrı bölgeler.
    for (let y = 0; y < 16; y += 1) surface.setPixel(8, y, GREEN);
    const fill = new FillTool({ label: 'doldur' });

    fill.begin(makeContext(surface), input(2, 2))?.commit();

    expect(surface.getPixel(0, 0)).toEqual(RED);
    expect(surface.getPixel(7, 15)).toEqual(RED);
    expect(surface.getPixel(8, 5)).toEqual(GREEN); // duvar
    expect(surface.getPixel(9, 5)).toEqual(CLEAR); // öteki bölge
  });

  it('hedef renk zaten aktif renkse komut üretmez', () => {
    const surface = new RasterSurface(16, 16);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) surface.setPixel(x, y, RED);
    }
    const fill = new FillTool({ label: 'doldur' });

    expect(fill.begin(makeContext(surface), input(4, 4))).toBeNull();
  });

  it('büyük tek renkli belgede yığın taşırmaz', () => {
    const surface = new RasterSurface(512, 512);
    const fill = new FillTool({ label: 'doldur' });

    const command = fill.begin(makeContext(surface), input(256, 256))?.commit();

    expect(command).not.toBeNull();
    expect(surface.getPixel(0, 0)).toEqual(RED);
    expect(surface.getPixel(511, 511)).toEqual(RED);
  });

  it('seçim sınırında durur', () => {
    const surface = new RasterSurface(32, 32);
    const context = makeContext(surface, {
      isEditable: (x, y) => surface.contains(x, y) && y < 8,
    });
    const fill = new FillTool({ label: 'doldur' });

    fill.begin(context, input(4, 4))?.commit();

    expect(surface.getPixel(4, 7)).toEqual(RED);
    expect(surface.getPixel(4, 8)).toEqual(CLEAR);
  });
});

describe('EyedropperTool', () => {
  it('rengi okur ve belgeyi değiştirmez', () => {
    const surface = new RasterSurface(32, 32);
    surface.setPixel(6, 6, GREEN);
    const context = makeContext(surface);
    const eyedropper = new EyedropperTool();
    const before = Array.from(surface.toRgba());

    const gesture = eyedropper.begin(context, input(6, 6));

    expect(context.picked).toEqual(GREEN);
    expect(gesture?.commit()).toBeNull();
    expect(Array.from(surface.toRgba())).toEqual(before);
  });

  it('sürükleme boyunca rengi canlı günceller', () => {
    const surface = new RasterSurface(32, 32);
    surface.setPixel(1, 1, GREEN);
    surface.setPixel(2, 2, BLUE);
    const context = makeContext(surface);

    const gesture = new EyedropperTool().begin(context, input(1, 1));
    gesture?.update(input(2, 2));

    expect(context.picked).toEqual(BLUE);
  });

  it('sağ tuşla başlamaz', () => {
    const surface = new RasterSurface(16, 16);
    const setPrimaryColor = vi.fn();

    const gesture = new EyedropperTool().begin(
      makeContext(surface, { setPrimaryColor }),
      input(1, 1, 2),
    );

    expect(gesture).toBeNull();
    expect(setPrimaryColor).not.toHaveBeenCalled();
  });
});
