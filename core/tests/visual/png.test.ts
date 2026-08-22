import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import { decodePng, encodePng } from '../../src/visual/encode/png';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface Chunk {
  type: string;
  data: Buffer;
  crcValid: boolean;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let crc = -1;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

/** Bağımsız bir ayrıştırıcı: kodlayıcının kendi yardımcılarını kullanmaz. */
function parseChunks(png: Buffer): Chunk[] {
  const chunks: Chunk[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    const crc = png.readUInt32BE(offset + 8 + length);
    chunks.push({
      type,
      data,
      crcValid: crc32(png.subarray(offset + 4, offset + 8 + length)) === crc,
    });
    offset += 12 + length;
  }
  return chunks;
}

function solid(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) out.set(rgba, i * 4);
  return out;
}

describe('PNG kodlayıcı', () => {
  it('imza, IHDR ve IEND doğru sırada yazılır', () => {
    const png = encodePng(4, 3, solid(4, 3, [10, 20, 30, 255]));

    expect(Array.from(png.subarray(0, 8))).toEqual(SIGNATURE);

    const chunks = parseChunks(png);
    expect(chunks[0].type).toBe('IHDR');
    expect(chunks[chunks.length - 1].type).toBe('IEND');
    expect(chunks.every((chunk) => chunk.crcValid)).toBe(true);

    expect(chunks[0].data.readUInt32BE(0)).toBe(4);
    expect(chunks[0].data.readUInt32BE(4)).toBe(3);
    expect(chunks[0].data[8]).toBe(8);
  });

  it('az renkli görüntü İNDEKSLİ yazılır — palet kilidi dosyada da geçerlidir', () => {
    const png = encodePng(4, 4, solid(4, 4, [200, 100, 50, 255]));
    const chunks = parseChunks(png);
    const ihdr = chunks.find((chunk) => chunk.type === 'IHDR')!;
    const plte = chunks.find((chunk) => chunk.type === 'PLTE')!;

    expect(ihdr.data[9]).toBe(3);
    expect(plte).toBeDefined();
    expect(Array.from(plte.data)).toEqual([200, 100, 50]);
    // Tamamı opaksa tRNS yazılmaz.
    expect(chunks.some((chunk) => chunk.type === 'tRNS')).toBe(false);
  });

  it('saydam piksel varsa tRNS yazılır', () => {
    const rgba = new Uint8ClampedArray(2 * 1 * 4);
    rgba.set([0, 0, 0, 0], 0);
    rgba.set([255, 255, 255, 255], 4);

    const chunks = parseChunks(encodePng(2, 1, rgba));
    const trns = chunks.find((chunk) => chunk.type === 'tRNS')!;

    expect(trns).toBeDefined();
    // İlk görülen giriş saydam olan; tRNS oraya kadar yazılır.
    expect(Array.from(trns.data)).toEqual([0]);
  });

  it('indeksli piksel verisi gidiş-dönüşte korunur', () => {
    const width = 3;
    const height = 2;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) rgba.set([i * 10, 0, 0, 255], i * 4);

    const chunks = parseChunks(encodePng(width, height, rgba));
    const plte = chunks.find((chunk) => chunk.type === 'PLTE')!;
    const raw = inflateSync(chunks.find((chunk) => chunk.type === 'IDAT')!.data);

    for (let y = 0; y < height; y++) {
      // Her satır bir filtre baytıyla başlar; filtre 0 (None) kullanılıyor.
      expect(raw[y * (width + 1)]).toBe(0);
      for (let x = 0; x < width; x++) {
        const index = raw[y * (width + 1) + 1 + x];
        expect(plte.data[index * 3]).toBe((y * width + x) * 10);
      }
    }
  });

  it('256 rengi aşan görüntü truecolor biçimine düşer', () => {
    const width = 300;
    const rgba = new Uint8ClampedArray(width * 4);
    for (let i = 0; i < width; i++) {
      rgba.set([i & 0xff, (i >> 4) & 0xff, (i * 7) & 0xff, 255], i * 4);
    }

    const chunks = parseChunks(encodePng(width, 1, rgba));
    expect(chunks.find((chunk) => chunk.type === 'IHDR')!.data[9]).toBe(6);
    expect(chunks.some((chunk) => chunk.type === 'PLTE')).toBe(false);

    const raw = inflateSync(chunks.find((chunk) => chunk.type === 'IDAT')!.data);
    expect(raw[0]).toBe(0);
    expect(Array.from(raw.subarray(1, 5))).toEqual([0, 0, 0, 255]);
  });

  it('aynı girdi aynı baytları verir', () => {
    const rgba = solid(8, 8, [1, 2, 3, 255]);
    expect(encodePng(8, 8, rgba).equals(encodePng(8, 8, rgba))).toBe(true);
  });

  it('indexed ve truecolor Forge PNG dosyalarını piksele geri çözer', () => {
    const indexed = new Uint8ClampedArray([
      0, 0, 0, 0, 20, 40, 60, 255, 80, 100, 120, 180, 20, 40, 60, 255,
    ]);
    const many = new Uint8ClampedArray(300 * 4);
    for (let i = 0; i < 300; i++) {
      many.set([i & 0xff, (i >> 4) & 0xff, (i * 7) & 0xff, 255], i * 4);
    }

    expect(Array.from(decodePng(encodePng(2, 2, indexed)).rgba)).toEqual(Array.from(indexed));
    expect(Array.from(decodePng(encodePng(300, 1, many)).rgba)).toEqual(Array.from(many));
  });

  it('bozuk imza ve CRC sessizce kabul edilmez', () => {
    expect(() => decodePng(Buffer.from('png değil'))).toThrow(/imzası/);

    const png = encodePng(2, 2, solid(2, 2, [10, 20, 30, 255]));
    png[20] ^= 0xff;
    expect(() => decodePng(png)).toThrow(/CRC/);
  });

  it('bozuk boyut ve uyumsuz tampon reddedilir', () => {
    expect(() => encodePng(0, 4, new Uint8ClampedArray(0))).toThrow(/pozitif tam sayı/);
    expect(() => encodePng(2.5, 4, new Uint8ClampedArray(40))).toThrow(/pozitif tam sayı/);
    expect(() => encodePng(4, 4, new Uint8ClampedArray(10))).toThrow(/bayt olmalı/);
  });
});
