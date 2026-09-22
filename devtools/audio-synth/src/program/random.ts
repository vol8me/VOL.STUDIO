import { createRandom, seedFromString, type Random } from '@volstudio/core/random';

/** Türetme şemasının sürümü; değişirse her stokastik çıktı değişir ve bu bir motor sürümü olayıdır. */
export const SUBSTREAM_SCHEME = 'substream-v1';

function fmix32(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Kök tohum + etiketten bağımsız 32-bit alt tohum. Etiket bir ADDIR (ör.
 * `layer:body/source/noise`), sıra değildir: yeni bir alt akış eklemek ya da
 * katman sırasını değiştirmek mevcut akışların dizisini kaydırmaz.
 */
export function deriveSeed(root: number, label: string): number {
  const labelHash = seedFromString(`${SUBSTREAM_SCHEME}|${label}`) >>> 0;
  return fmix32(labelHash ^ fmix32((root >>> 0) + 0x9e3779b9));
}

export function substream(root: number, label: string): Random {
  return createRandom(deriveSeed(root, label));
}
