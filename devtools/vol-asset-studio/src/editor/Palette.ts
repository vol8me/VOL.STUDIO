import {
  nearestPaletteIndex,
  resolveDitherMatrix,
  rgbToOklab,
  type DitherKind,
  type Oklab,
} from '@volstudio/visual-synth/color';
import type { Rgba } from './RasterSurface';
import type { RasterBuffer } from './transform';

export interface PaletteEntry {
  /** `#rrggbb` biçiminde, küçük harf. */
  hex: string;
  /** Belgede kaç piksel bu rengi kullanıyor. */
  count: number;
}

export function toHex(color: Rgba): string {
  const part = (value: number): string => value.toString(16).padStart(2, '0');
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}

export function fromHex(hex: string, alpha = 255): Rgba {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return { r: 0, g: 0, b: 0, a: alpha };
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255, a: alpha };
}

/**
 * Belgedeki renkleri kullanım sayısıyla çıkarır.
 *
 * Tamamen saydam pikseller ATLANIR: altlarında kalan renk görünmez, palete
 * girerse "kullanılmayan renk" temizliğini ve indexed çıktıyı yanıltır.
 */
export function extractPalette(buffer: RasterBuffer, limit = 256): PaletteEntry[] {
  const counts = new Map<number, number>();
  for (let index = 0; index < buffer.rgba.length; index += 4) {
    if (buffer.rgba[index + 3] === 0) continue;
    const packed =
      (buffer.rgba[index] << 16) | (buffer.rgba[index + 1] << 8) | buffer.rgba[index + 2];
    counts.set(packed, (counts.get(packed) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, Math.max(1, limit))
    .map(([packed, count]) => ({
      hex: `#${packed.toString(16).padStart(6, '0')}`,
      count,
    }));
}

/** Belgede hiç kullanılmayan palet girdilerini bulur. */
export function findUnusedColors(buffer: RasterBuffer, palette: readonly string[]): string[] {
  const used = new Set(extractPalette(buffer, Number.MAX_SAFE_INTEGER).map((entry) => entry.hex));
  return palette.filter((hex) => !used.has(hex.toLowerCase()));
}

/** Bir rengi diğeriyle değiştirir; alfa korunur. */
export function replaceColor(
  buffer: RasterBuffer,
  from: Rgba,
  to: Rgba,
  mask?: Uint8Array,
): RasterBuffer {
  const target: RasterBuffer = {
    width: buffer.width,
    height: buffer.height,
    rgba: new Uint8ClampedArray(buffer.rgba),
  };
  for (let index = 0; index < target.rgba.length; index += 4) {
    if (mask !== undefined && mask[index / 4] !== 1) continue;
    if (target.rgba[index + 3] === 0) continue;
    if (
      target.rgba[index] !== from.r ||
      target.rgba[index + 1] !== from.g ||
      target.rgba[index + 2] !== from.b
    ) {
      continue;
    }
    target.rgba[index] = to.r;
    target.rgba[index + 1] = to.g;
    target.rgba[index + 2] = to.b;
    // Alfa BİLEREK korunur: renk değişimi silüeti değiştirmemelidir.
  }
  return target;
}

export interface QuantizeOptions {
  palette: readonly string[];
  dither?: DitherKind;
  /** Dither sapmasının gücü, 0..1. */
  ditherAmount?: number;
  mask?: Uint8Array;
}

/**
 * Belgeyi verilen palete indirger.
 *
 * En yakın renk OKLab'da aranır; RGB Öklid mesafesi algısal değildir ve koyu
 * mavilerde gözle alakasız eşleşmeler üretir (CORE `nearestPaletteIndex`).
 * Dither, ölçekten bağımsız olması için PİKSEL konumuna göre okunur.
 */
export function quantizeToPalette(buffer: RasterBuffer, options: QuantizeOptions): RasterBuffer {
  const entries = options.palette.map((hex) => fromHex(hex));
  if (entries.length === 0) {
    return { ...buffer, rgba: new Uint8ClampedArray(buffer.rgba) };
  }
  const lab: Oklab[] = entries.map((color) => rgbToOklab(color.r, color.g, color.b));
  const matrix = resolveDitherMatrix(options.dither ?? 'none');
  const amount = Math.max(0, Math.min(1, options.ditherAmount ?? 0.5));
  const target: RasterBuffer = {
    width: buffer.width,
    height: buffer.height,
    rgba: new Uint8ClampedArray(buffer.rgba),
  };

  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const pixel = y * buffer.width + x;
      if (options.mask !== undefined && options.mask[pixel] !== 1) continue;
      const index = pixel * 4;
      if (target.rgba[index + 3] === 0) continue;
      let color = rgbToOklab(target.rgba[index], target.rgba[index + 1], target.rgba[index + 2]);
      if (matrix !== null && amount > 0) {
        const offset = matrix.values[(y % matrix.size) * matrix.size + (x % matrix.size)] - 0.5;
        // Sapma yalnız AÇIKLIK eksenine uygulanır; renk ekseninde gürültü
        // paleti bozar ve pixel-art'ta kirli görünür.
        color = { ...color, L: Math.max(0, Math.min(1, color.L + offset * amount * 0.25)) };
      }
      const nearest = entries[nearestPaletteIndex(color, lab)];
      target.rgba[index] = nearest.r;
      target.rgba[index + 1] = nearest.g;
      target.rgba[index + 2] = nearest.b;
    }
  }
  return target;
}

/**
 * Silüet dış çizgisi üretir.
 *
 * Yalnız saydam komşusu olan opak pikseller çizgi alır; içeride kalanlar
 * dokunulmaz. `includeDiagonals` kapalıyken 4-komşuluk kullanılır ve
 * pixel-art'ta daha temiz köşe verir.
 */
export function generateOutline(
  buffer: RasterBuffer,
  color: Rgba,
  includeDiagonals = false,
): RasterBuffer {
  const target: RasterBuffer = {
    width: buffer.width,
    height: buffer.height,
    rgba: new Uint8ClampedArray(buffer.rgba),
  };
  const neighbours = includeDiagonals
    ? [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ]
    : [
        [0, -1],
        [-1, 0],
        [1, 0],
        [0, 1],
      ];
  const opaqueAt = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) return false;
    return buffer.rgba[(y * buffer.width + x) * 4 + 3] > 0;
  };

  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      if (opaqueAt(x, y)) continue;
      if (!neighbours.some(([dx, dy]) => opaqueAt(x + dx, y + dy))) continue;
      const index = (y * buffer.width + x) * 4;
      target.rgba[index] = color.r;
      target.rgba[index + 1] = color.g;
      target.rgba[index + 2] = color.b;
      target.rgba[index + 3] = color.a;
    }
  }
  return target;
}

/** GPL (GIMP palette) biçiminde dışa aktarır. */
export function exportGpl(name: string, palette: readonly string[]): string {
  const lines = ['GIMP Palette', `Name: ${name}`, 'Columns: 8', '#'];
  for (const hex of palette) {
    const color = fromHex(hex);
    lines.push(
      `${String(color.r).padStart(3)} ${String(color.g).padStart(3)} ${String(color.b).padStart(
        3,
      )}\t${hex}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

/** GPL içeriğinden palet okur; yorum ve başlık satırları atlanır. */
export function importGpl(source: string): string[] {
  const palette: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || /^[A-Za-z]/.test(trimmed)) continue;
    const match = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/.exec(trimmed);
    if (!match) continue;
    palette.push(
      toHex({
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
        a: 255,
      }),
    );
  }
  return palette;
}
