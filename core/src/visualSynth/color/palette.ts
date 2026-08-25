/**
 * Palet — D6'nın uygulaması.
 *
 * Palet VERİDİR, gömülü değildir: motor asla renk sabiti taşımaz. `VOL_COLORS`
 * bu sisteme girmez — o, arayüzün paletidir, üretilen asset'in değil.
 *
 * Çözümlenmiş palet üç şey tutar: renk baytları (indeksle erişim), rampa
 * kimliğinden renk indekslerine eşleme (nicemleme bunu okur) ve paletteki
 * renklerin paketlenmiş kümesi (palet kilidi doğrulaması bunu okur).
 */

import type { RampSpec } from '../types';

/**
 * Çözümlemeye HAZIR palet verisi.
 *
 * `PaletteSpec`ten ayrıdır çünkü belgedeki palet sentez isteği de olabilir;
 * bu tip sentez çözüldükten SONRAKİ hâli tanımlar ve alanları zorunludur.
 */
export interface ResolvablePalette {
  colors: readonly string[];
  ramps: readonly RampSpec[];
}

export interface ResolvedPalette {
  /** `[r,g,b, r,g,b, …]` — uzunluk `colorCount * 3`. */
  readonly rgb: Uint8Array;
  readonly colorCount: number;
  /** Rampa kimliği → `colors` indeksleri (koyudan açığa). */
  readonly ramps: ReadonlyMap<number, readonly number[]>;
  /** Paketlenmiş `0xRRGGBB` kümesi — palet kilidi bunun üzerinden ölçülür. */
  readonly packed: ReadonlySet<number>;
}

/** `0xRRGGBB` paketleme — küme aramaları için tek sayıya indirir. */
export function packRgb(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/** `#rrggbb` metnini bileşenlerine ayırır. Doğrulama biçimi zaten denetler. */
export function parseHexColor(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

export function resolvePalette(spec: ResolvablePalette): ResolvedPalette {
  const colorCount = spec.colors.length;
  const rgb = new Uint8Array(colorCount * 3);
  const packed = new Set<number>();

  spec.colors.forEach((hex, i) => {
    const [r, g, b] = parseHexColor(hex);
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
    packed.add(packRgb(r, g, b));
  });

  const ramps = new Map<number, readonly number[]>();
  for (const ramp of spec.ramps) ramps.set(ramp.id, [...ramp.indices]);

  return { rgb, colorCount, ramps, packed };
}

/** Renk paletin içinde mi? Palet kilidi (D6) bu soruyu sorar. */
export function isPaletteColor(palette: ResolvedPalette, r: number, g: number, b: number): boolean {
  return palette.packed.has(packRgb(r, g, b));
}
