/**
 * Dış çizgi — §4.6, piksel uzayda.
 *
 * `dilate(coverage, px) − coverage` ve kardeşleri. Kalınlık PİKSEL
 * cinsindendir ve bu D2'nin gereğidir: bir piksellik dış çizgi her
 * çözünürlükte bir pikseldir; birim uzayda verilseydi 1024²'de kalınlaşırdı.
 *
 * Yapısal eleman KAREdir (ayrılabilir maks/min), yani köşeler 8-komşuluk
 * kuralıyla doldurulur. Piksel sanatının alışılmış dış çizgisi budur;
 * 4-komşuluk köşelerde kopuk görünür.
 */

import { dilate, erode } from '../field/filter';
import type { EdgeMode } from '../field/sample';

export type OutlineMode = 'outside' | 'inside' | 'centered';

/** Kapsamanın "dolu" sayıldığı eşik — kenar yumuşatma açıkken de kararlıdır. */
const SOLID = 0.5;

/**
 * Dış çizgi maskesi üretir (1 = çizgi pikseli).
 *
 * `outside` ve `centered` silüeti BÜYÜTÜR; çağıran maskeyi kapsamaya da
 * yazmalıdır. `inside` silüeti değiştirmez.
 *
 * Tek sayıda kalınlıkta `centered` DIŞA doğru fazladan piksel alır: silüetin
 * görsel ağırlığını korumak, içeriden yemekten daha az bozucudur.
 */
export function computeOutline(
  coverage: Float32Array,
  width: number,
  rows: number,
  px: number,
  mode: OutlineMode,
  edge: EdgeMode,
): Uint8Array {
  const count = width * rows;
  const mask = new Uint8Array(count);
  if (px < 1) return mask;

  const solid = new Float32Array(count);
  for (let i = 0; i < count; i++) solid[i] = coverage[i] >= SOLID ? 1 : 0;

  const outer = mode === 'inside' ? 0 : mode === 'outside' ? px : Math.ceil(px / 2);
  const inner = mode === 'outside' ? 0 : mode === 'inside' ? px : Math.floor(px / 2);

  const grown = Float32Array.from(solid);
  if (outer > 0) dilate(grown, width, rows, outer, edge);

  const shrunk = Float32Array.from(solid);
  if (inner > 0) erode(shrunk, width, rows, inner, edge);

  for (let i = 0; i < count; i++) {
    mask[i] = grown[i] >= SOLID && shrunk[i] < SOLID ? 1 : 0;
  }
  return mask;
}
