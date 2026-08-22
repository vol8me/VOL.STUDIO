/**
 * Üreteçler — §4.1. Birim uzaydaki bir noktayı skalere çevirirler.
 *
 * Her biri parametreleri ÖNCEDEN alır ve bir `FieldFn` döndürür: açı-radyan
 * dönüşümü, kosinüs/sinüs, ters yarıçap gibi sabitler piksel başına değil
 * derleme anında bir kez hesaplanır.
 */

import { clamp01, inverseLerp } from '../../math/interpolation';
import { quintic, type FieldFn } from './fn';

/** Sabit alan; maske ve karışım için taban. */
export function constantField(value: number): FieldFn {
  return () => value;
}

/**
 * Kafes noktası karması.
 *
 * PRNG değil KARMA kullanılır: gürültünün değeri konumun fonksiyonu olmalı,
 * çağrı sırasının değil. Sıralı bir üreteç, aynı noktayı iki kez okurken
 * farklı değer verirdi ve `warp` gibi tekrar örnekleyen işlemler (Tur 2)
 * bozulurdu.
 */
function latticeHash(ix: number, iy: number, seed: number): number {
  let h = (seed ^ Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Değer gürültüsü. `freq` KISA KENAR boyunca hücre sayısıdır; birim uzay o
 * eksende `[-1, 1]` olduğu için kafes koordinatı `x * freq / 2`dir.
 */
export function valueNoiseField(freq: number, seed: number): FieldFn {
  const scale = freq / 2;
  return (x, y) => {
    const u = x * scale;
    const v = y * scale;
    const ix = Math.floor(u);
    const iy = Math.floor(v);
    const wx = quintic(u - ix);
    const wy = quintic(v - iy);

    const n00 = latticeHash(ix, iy, seed);
    const n10 = latticeHash(ix + 1, iy, seed);
    const n01 = latticeHash(ix, iy + 1, seed);
    const n11 = latticeHash(ix + 1, iy + 1, seed);

    const top = n00 + (n10 - n00) * wx;
    const bottom = n01 + (n11 - n01) * wx;
    return top + (bottom - top) * wy;
  };
}

/**
 * Doğrusal gradyan. `from`/`to` eksen üzerindeki BİRİM UZAY KONUMLARIdır;
 * değer aralığını değiştirmek `remap`in işidir (Tur 2), gradyanın değil.
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

/** Daire işaretli mesafesi; negatif içeridedir. */
export function circleSdfField(cx: number, cy: number, r: number): FieldFn {
  return (x, y) => Math.hypot(x - cx, y - cy) - r;
}

/**
 * Kutu işaretli mesafesi; negatif içeridedir.
 *
 * Dışarıda köşeye olan gerçek Öklid uzaklığı, içeride en yakın kenara olan
 * uzaklık. İki parçalı olması şart: yalnızca `max(qx, qy)` kullanmak dışarıda
 * köşelerde Chebyshev mesafesi verir ve dış çizgi (Tur 3) köşelerde kalınlaşır.
 */
export function boxSdfField(cx: number, cy: number, hx: number, hy: number): FieldFn {
  return (x, y) => {
    const qx = Math.abs(x - cx) - hx;
    const qy = Math.abs(y - cy) - hy;
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
    const inside = Math.min(Math.max(qx, qy), 0);
    return outside + inside;
  };
}
