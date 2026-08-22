/**
 * Birleştiriciler — §4.3. Alan × alan → alan.
 *
 * `min`/`max` işaretli mesafede BİRLEŞİM/KESİŞİM demektir; ayrı bir boolean
 * primitifi gerekmez (D9).
 */

import { clamp01, lerp } from '../../math/interpolation';
import type { FieldFn } from './fn';

export function addFields(a: FieldFn, b: FieldFn): FieldFn {
  return (x, y) => a(x, y) + b(x, y);
}

export function mulFields(a: FieldFn, b: FieldFn): FieldFn {
  return (x, y) => a(x, y) * b(x, y);
}

/** İşaretli mesafede BİRLEŞİM. */
export function minFields(a: FieldFn, b: FieldFn): FieldFn {
  return (x, y) => Math.min(a(x, y), b(x, y));
}

/** İşaretli mesafede KESİŞİM. */
export function maxFields(a: FieldFn, b: FieldFn): FieldFn {
  return (x, y) => Math.max(a(x, y), b(x, y));
}

export function mixFields(a: FieldFn, b: FieldFn, t: number): FieldFn {
  return (x, y) => lerp(a(x, y), b(x, y), t);
}

/** Sert eşik. Çözünürlükten bağımsızdır — yumuşaklık isteyen `smoothstep` kullanır. */
export function stepField(edge: number, input: FieldFn): FieldFn {
  return (x, y) => (input(x, y) >= edge ? 1 : 0);
}

/**
 * Yumuşak eşik.
 *
 * `e0 > e1` verildiğinde rampa AZALIR; bir SDF'yi maskeye çevirmenin doğal
 * yolu budur (içerisi negatif olduğu için). Ayrı bir "ters eşik" primitifi
 * eklemek yerine mevcut parametreyi kullanmak D9'un gereğidir.
 *
 * `e0 === e1` sıfıra bölme demektir; o durumda sert eşiğe düşülür.
 */
export function smoothstepField(e0: number, e1: number, input: FieldFn): FieldFn {
  if (e0 === e1) return (x, y) => (input(x, y) >= e0 ? 1 : 0);
  const span = 1 / (e1 - e0);
  return (x, y) => {
    const t = clamp01((input(x, y) - e0) * span);
    return t * t * (3 - 2 * t);
  };
}
