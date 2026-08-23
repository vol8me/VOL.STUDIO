import { describe, expect, it } from 'vitest';
import { DerivedDocument } from '../../src/editor/DerivedDocument';
import type { Rgba } from '../../src/editor/RasterSurface';

const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 };
const BLUE: Rgba = { r: 0, g: 0, b: 255, a: 255 };
const GREEN: Rgba = { r: 0, g: 255, b: 0, a: 255 };

function base(width: number, height: number, color: Rgba): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = color.r;
    rgba[i + 1] = color.g;
    rgba[i + 2] = color.b;
    rgba[i + 3] = color.a;
  }
  return rgba;
}

function makeDocument(): DerivedDocument {
  return new DerivedDocument({
    width: 4,
    height: 4,
    base: base(4, 4, RED),
    baseRevision: 'a'.repeat(64),
  });
}

describe('DerivedDocument', () => {
  it('düzenleme yokken taban aynen döner', () => {
    const document = makeDocument();

    expect(document.editCount).toBe(0);
    expect(document.getPixel(1, 1)).toEqual(RED);
  });

  it('düzenleme delta olarak tutulur ve bileşiğe yansır', () => {
    const document = makeDocument();

    expect(document.setPixel(1, 1, BLUE)).toBe(true);

    expect(document.editCount).toBe(1);
    expect(document.getPixel(1, 1)).toEqual(BLUE);
    expect(Array.from(document.compose().rgba.subarray(20, 24))).toEqual([0, 0, 255, 255]);
  });

  it('tabanla aynı değeri yazmak deltayı ŞİŞİRMEZ', () => {
    const document = makeDocument();
    document.setPixel(1, 1, BLUE);

    document.setPixel(1, 1, RED);

    expect(document.editCount).toBe(0);
  });

  it('aynı deltayı tekrar yazmak değişiklik saymaz', () => {
    const document = makeDocument();
    document.setPixel(2, 2, BLUE);

    expect(document.setPixel(2, 2, BLUE)).toBe(false);
  });

  it('YENİDEN ÜRETİMDE kullanıcı katmanı korunur', () => {
    const document = makeDocument();
    document.setPixel(1, 1, BLUE);

    const result = document.rebase(base(4, 4, GREEN), 'b'.repeat(64));

    expect(result.kept).toBe(1);
    expect(document.baseRevision).toBe('b'.repeat(64));
    // Kullanıcının düzelttiği piksel yerinde; gerisi yeni tabandan geliyor.
    expect(document.getPixel(1, 1)).toEqual(BLUE);
    expect(document.getPixel(0, 0)).toEqual(GREEN);
  });

  it('yeni tabanla aynılaşan düzenleme temizlenir', () => {
    const document = makeDocument();
    document.setPixel(1, 1, GREEN);

    const result = document.rebase(base(4, 4, GREEN), 'b'.repeat(64));

    expect(result.dropped).toBe(1);
    expect(result.kept).toBe(0);
  });

  it('boyutu değişen tabanı reddeder', () => {
    const document = makeDocument();

    expect(() => document.rebase(base(2, 2, GREEN), 'c'.repeat(64))).toThrow(RangeError);
  });

  it('tarif deterministik sıralanır', () => {
    const document = makeDocument();
    document.setPixel(3, 3, BLUE);
    document.setPixel(0, 0, BLUE);
    document.setPixel(1, 2, BLUE);

    const recipe = document.toRecipe('2026-01-01T00:00:00.000Z');

    expect(recipe.edits.map((edit) => edit.index)).toEqual([0, 9, 15]);
    expect(recipe.schemaVersion).toBe(1);
    expect(recipe.baseRevision).toBe('a'.repeat(64));
  });

  it('tarif round-trip aynı bileşiği verir', () => {
    const document = makeDocument();
    document.setPixel(1, 1, BLUE);
    document.setPixel(2, 3, GREEN);
    const recipe = document.toRecipe();
    const expected = Array.from(document.compose().rgba);

    const restored = new DerivedDocument({
      width: 4,
      height: 4,
      base: base(4, 4, RED),
      baseRevision: 'a'.repeat(64),
      recipe,
    });

    expect(Array.from(restored.compose().rgba)).toEqual(expected);
  });

  it('uyumsuz tuval ölçüsündeki tarifi reddeder', () => {
    const document = makeDocument();
    const recipe = document.toRecipe();
    recipe.canvas = { width: 8, height: 8 };

    expect(() => document.applyRecipe(recipe)).toThrow(RangeError);
  });

  it('sınır dışı indeks taşıyan tarif girdisi atlanır', () => {
    const document = makeDocument();
    const recipe = document.toRecipe();
    recipe.edits = [{ index: 9999, r: 1, g: 2, b: 3, a: 4 }];

    document.applyRecipe(recipe);

    expect(document.editCount).toBe(0);
  });

  it('sınır dışı yazım yok sayılır', () => {
    const document = makeDocument();

    expect(document.setPixel(-1, 0, BLUE)).toBe(false);
    expect(document.setPixel(4, 0, BLUE)).toBe(false);
    expect(document.editCount).toBe(0);
  });

  it('clearEdits tabanı geri verir', () => {
    const document = makeDocument();
    document.setPixel(1, 1, BLUE);

    document.clearEdits();

    expect(document.editCount).toBe(0);
    expect(document.getPixel(1, 1)).toEqual(RED);
  });
});
