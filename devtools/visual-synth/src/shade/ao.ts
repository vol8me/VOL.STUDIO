/**
 * Örtüşme gölgesi (ambient occlusion) — §4.5.
 *
 * Yöntem: yükseklik alanının YEREL ORTALAMASI ile kendisinin farkı. Nokta
 * çevresinin altındaysa çukurdadır ve ışığın bir kısmı ona ulaşmaz. Işın
 * izleme ya da yarım küre örnekleme yapılmaz — 2.5B bir yükseklik alanında
 * fark kadar bilgi taşımazlar ve maliyetleri kat kat yüksektir.
 */

import { clamp01 } from '@volstudio/core/math/interpolation';
import { boxBlur } from '../field/filter';
import type { EdgeMode } from '../field/sample';

/**
 * Yerel ortalama farkını kullanılabilir bir aralığa taşıyan kazanç.
 *
 * Tipik bir yükseklik alanında `ortalama − değer` farkı 0.05–0.25 arasında
 * kalır; kazanç olmadan `strength: 1` bile gözle görülmezdi. Sabit olması,
 * `strength` parametresinin 0..1 aralığında anlamlı davranmasını sağlar.
 */
const AO_GAIN = 4;

/** Örtüşme miktarı, 0..1. Gölge bununla ÇARPILMAZ, `1 − ao` ile çarpılır. */
export function computeAo(
  height: Float32Array,
  width: number,
  rows: number,
  radiusPx: number,
  strength: number,
  edge: EdgeMode,
): Float32Array {
  const count = width * rows;
  const occlusion = new Float32Array(count);
  if (radiusPx < 1 || strength <= 0) return occlusion;

  const average = Float32Array.from(height);
  boxBlur(average, width, rows, radiusPx, edge);

  for (let i = 0; i < count; i++) {
    occlusion[i] = clamp01((average[i] - height[i]) * AO_GAIN * strength);
  }
  return occlusion;
}
