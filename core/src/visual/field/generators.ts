/**
 * Sabit alan ve gradyanlar — §4.1.
 *
 * Her biri parametreleri ÖNCEDEN alır ve bir `FieldFn` döndürür: açı-radyan
 * dönüşümü, kosinüs/sinüs, ters yarıçap gibi sabitler piksel başına değil
 * derleme anında bir kez hesaplanır.
 *
 * Gürültü `noise.ts`, işaretli mesafe alanları `sdf.ts`, desenler
 * `patterns.ts` içindedir.
 */

import { clamp01, inverseLerp } from '../../math/interpolation';
import type { FieldFn } from './fn';

const TAU = Math.PI * 2;

/** Sabit alan; maske ve karışım için taban. */
export function constantField(value: number): FieldFn {
  return () => value;
}

/**
 * Doğrusal gradyan. `from`/`to` eksen üzerindeki BİRİM UZAY KONUMLARIdır;
 * değer aralığını değiştirmek `remap`in işidir, gradyanın değil.
 */
export function linearGradientField(angleRad: number, from: number, to: number): FieldFn {
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);
  return (x, y) => clamp01(inverseLerp(from, to, x * dx + y * dy));
}

/** Dairesel gradyan: merkezde 1, `radius`ta 0. */
export function radialGradientField(cx: number, cy: number, radius: number): FieldFn {
  const invRadius = 1 / radius;
  return (x, y) => clamp01(1 - Math.hypot(x - cx, y - cy) * invRadius);
}

/**
 * Kutupsal açı gradyanı: bir tam turda 0→1.
 *
 * Merkezin kendisinde açı tanımsızdır; `atan2(0, 0)` sıfır döndürdüğü için
 * değer sürekli kalır ve tek bir piksel sıçraması oluşmaz.
 */
export function angularGradientField(cx: number, cy: number, offsetRad: number): FieldFn {
  return (x, y) => {
    const angle = Math.atan2(y - cy, x - cx) - offsetRad;
    const wrapped = angle - TAU * Math.floor(angle / TAU);
    return wrapped / TAU;
  };
}

/** Manhattan gradyanı: merkezde 1, `size` uzaklığında 0. Eşkenar dörtgen. */
export function diamondGradientField(cx: number, cy: number, size: number): FieldFn {
  const invSize = 1 / size;
  return (x, y) => clamp01(1 - (Math.abs(x - cx) + Math.abs(y - cy)) * invSize);
}
