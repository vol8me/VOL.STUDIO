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
import { SpriteDocument } from '../../src/editor/SpriteDocument';
import {
  buildOnionSkin,
  buildRuntimeMetadata,
  buildSpriteSheet,
} from '../../src/editor/spriteSheet';
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

function makeDocument(frames = 1): SpriteDocument {
  const document = SpriteDocument.fromFlat('doc-1', 4, 4, new Uint8ClampedArray(4 * 4 * 4));
  for (let index = 1; index < frames; index += 1) document.addFrame(index - 1);
  return document;
}

describe('SpriteDocument', () => {
  it('düz rasterdan tek katman tek kare kurar', () => {
    const document = makeDocument();

    expect(document.layers).toHaveLength(1);
    expect(document.frameCount).toBe(1);
    expect(document.width).toBe(4);
  });

  it('katman ekler, günceller ve siler', () => {
    const document = makeDocument();
    document.addLayer({
      id: 'layer-2',
      name: 'Üst',
      visible: true,
      opacity: 1,
      blendMode: 'multiply',
      alphaLocked: false,
    });

    expect(document.layers).toHaveLength(2);
    expect(document.updateLayer('layer-2', { opacity: 0.5 })).toBe(true);
    expect(document.layers[1].opacity).toBe(0.5);
    expect(document.removeLayer('layer-2')).toBe(true);
    expect(document.layers).toHaveLength(1);
  });

  it('son katman ve son kare silinemez', () => {
    const document = makeDocument();

    expect(document.removeLayer('layer-1')).toBe(false);
    expect(document.removeFrame(0)).toBe(false);
  });

  it('kare kopyalama cel içeriğini taşır ama bağımsızdır', () => {
    const document = makeDocument();
    document.celSurface(0, 'layer-1').setPixel(1, 1, RED);

    document.addFrame(0, 0);
    document.celSurface(1, 'layer-1').setPixel(1, 1, BLUE);

    expect(document.celSurface(0, 'layer-1').getPixel(1, 1)).toEqual(RED);
    expect(document.celSurface(1, 'layer-1').getPixel(1, 1)).toEqual(BLUE);
  });

  it('kare süresi sıfıra inemez', () => {
    const document = makeDocument();

    document.setFrameDuration(0, 0);

    expect(document.frameAt(0)?.durationMs).toBe(1);
  });

  it('kare taşınabilir', () => {
    const document = makeDocument(3);
    const firstId = document.frameAt(0)?.id;

    expect(document.moveFrame(0, 2)).toBe(true);
    expect(document.frameAt(2)?.id).toBe(firstId);
  });

  it('bileşik kare katman sırasını uygular', () => {
    const document = makeDocument();
    document.addLayer({
      id: 'layer-2',
      name: 'Üst',
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      alphaLocked: false,
    });
    document.celSurface(0, 'layer-1').setPixel(0, 0, RED);
    document.celSurface(0, 'layer-2').setPixel(0, 0, BLUE);

    expect(pixelAt(document.compositeFrame(0), 0, 0)).toEqual(BLUE);
  });

  it('JSON çıktısı cel dosya adlarını çağırandan alır', () => {
    const document = makeDocument(2);
    document.pivot = { x: 2, y: 3 };
    document.palette = ['#ff0000'];
    document.metadata = { hitbox: 'yok' };

    // İkinci kareye dokunulur: cel ancak o katmanda içerik olduğunda yazılır.
    document.celSurface(1, 'layer-1').setPixel(0, 0, RED);

    const json = document.toJson((frame, layer) => `${layer}-${frame}.png`);

    expect(json.schemaVersion).toBe(1);
    expect(json.canvas).toEqual({ width: 4, height: 4 });
    expect(json.frames).toHaveLength(2);
    expect(json.frames[1].cels[0].file).toBe('layer-1-1.png');
    expect(json.pivot).toEqual({ x: 2, y: 3 });
    expect(json.metadata).toEqual({ hitbox: 'yok' });
  });

  it('hiç çizilmemiş kare boş cel listesiyle yazılır', () => {
    // Boş kare MEŞRUDUR (göz kırpma boşluğu); uydurma bir cel yazmak
    // belgeyi büyütür ve yeniden yüklemede saydam bir PNG bekletir.
    const document = makeDocument(2);

    const json = document.toJson((frame, layer) => `${layer}-${frame}.png`);

    expect(json.frames[1].cels).toEqual([]);
  });

  it('katman yığını aktif kareden kurulur', () => {
    const document = makeDocument();
    document.celSurface(0, 'layer-1').setPixel(0, 0, RED);

    const stack = document.buildLayerStack(0);

    expect(stack.length).toBe(1);
    expect(Array.from(stack.composite().subarray(0, 4))).toEqual([255, 0, 0, 255]);
  });
});

describe('spriteSheet', () => {
  it('yatay dizilim kareleri yan yana koyar', () => {
    const document = makeDocument(3);
    document.celSurface(1, 'layer-1').setPixel(0, 0, RED);

    const sheet = buildSpriteSheet(document, { layout: 'horizontal' });

    expect(sheet.buffer.width).toBe(12);
    expect(sheet.buffer.height).toBe(4);
    expect(sheet.frames).toHaveLength(3);
    expect(pixelAt(sheet.buffer, 4, 0)).toEqual(RED);
  });

  it('grid dizilimi satırlara böler ve dolgu uygular', () => {
    const document = makeDocument(4);

    const sheet = buildSpriteSheet(document, { layout: 'grid', columns: 2, padding: 2 });

    expect(sheet.columns).toBe(2);
    expect(sheet.rows).toBe(2);
    // Kenarda dolgu bırakılmaz: 2 hücre + aradaki tek dolgu.
    expect(sheet.buffer.width).toBe(4 * 2 + 2);
  });

  it('runtime metadata oyun bağımsızdır', () => {
    const document = makeDocument(2);
    document.pivot = { x: 1, y: 2 };
    const sheet = buildSpriteSheet(document);

    const metadata = buildRuntimeMetadata(document, sheet);

    expect(metadata.schemaVersion).toBe(1);
    expect(metadata.frames).toHaveLength(2);
    expect(metadata.frames[1].x).toBe(4);
    expect(metadata.pivot).toEqual({ x: 1, y: 2 });
    expect(JSON.stringify(metadata)).not.toMatch(/phaser|scene|sprite3d/i);
  });

  it('onion skin komşu kareleri azalan opaklıkla verir', () => {
    const document = makeDocument(3);

    const layers = buildOnionSkin(document, 1, 1, 1);

    expect(layers).toHaveLength(2);
    expect(layers[0].opacity).toBeGreaterThan(layers[1].opacity);
  });

  it('onion skin belge sınırında taşmaz', () => {
    const document = makeDocument(2);

    expect(buildOnionSkin(document, 0, 2, 0)).toHaveLength(0);
    expect(buildOnionSkin(document, 1, 0, 2)).toHaveLength(0);
  });
});
