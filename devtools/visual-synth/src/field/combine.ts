/**
 * Birleştiriciler — §4.3. Alan × alan → alan.
 *
 * `min`/`max` işaretli mesafede BİRLEŞİM/KESİŞİM demektir; ayrı bir boolean
 * primitifi gerekmez (D9).
 */

import { clamp, clamp01, lerp, remap } from '@volstudio/core/math/interpolation';
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

/**
 * Polinomik yumuşak minimum. `k <= 0` sert minimuma iner; bu sınır, eski
 * boolean davranışını yeni belgelerde de açıkça korur.
 */
export function smoothMinFields(a: FieldFn, b: FieldFn, k: number): FieldFn {
  if (!(k > 0)) return minFields(a, b);
  return (x, y) => {
    const av = a(x, y);
    const bv = b(x, y);
    const h = clamp01(0.5 + (0.5 * (bv - av)) / k);
    return (1 - h) * bv + h * av - k * h * (1 - h);
  };
}

/** Signed-distance yumuşak birleşimi. */
export function smoothUnionFields(a: FieldFn, b: FieldFn, k: number): FieldFn {
  return smoothMinFields(a, b, k);
}

/** Signed-distance yumuşak kesişimi: −smoothMin(−a, −b). */
export function smoothIntersectionFields(a: FieldFn, b: FieldFn, k: number): FieldFn {
  const result = smoothMinFields(
    (x, y) => -a(x, y),
    (x, y) => -b(x, y),
    k,
  );
  return (x, y) => -result(x, y);
}

/** Signed-distance yumuşak çıkarımı: a ∩ ¬b. */
export function smoothSubFields(a: FieldFn, b: FieldFn, k: number): FieldFn {
  const result = smoothMinFields((x, y) => -a(x, y), b, k);
  return (x, y) => -result(x, y);
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

export function subFields(a: FieldFn, b: FieldFn): FieldFn {
  return (x, y) => a(x, y) - b(x, y);
}

/** `1 − (1−a)(1−b)` — aydınlatır, 1'i aşmaz. */
export function screenFields(a: FieldFn, b: FieldFn): FieldFn {
  return (x, y) => 1 - (1 - a(x, y)) * (1 - b(x, y));
}

/** Koyu bölgede çarpma, açık bölgede screen: kontrastı artırır. */
export function overlayFields(a: FieldFn, b: FieldFn): FieldFn {
  return (x, y) => {
    const base = a(x, y);
    const blend = b(x, y);
    return base < 0.5 ? 2 * base * blend : 1 - 2 * (1 - base) * (1 - blend);
  };
}

/** Bir aralığı başka bir aralığa taşır; kelepçelemez (bilinçli ekstrapolasyon). */
export function remapField(
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
  input: FieldFn,
): FieldFn {
  return (x, y) => remap(input(x, y), inMin, inMax, outMin, outMax);
}

/**
 * Parçalı doğrusal aktarım eğrisi.
 *
 * Noktalar derleme anında x'e göre sıralanır ve ayrı dizilere açılır: piksel
 * başına nesne alanına erişmek, milyonlarca çağrıda ölçülebilir bir fark
 * yaratır. Aralık dışı girdi uç değerlerde KELEPÇELENİR — eğrinin dışına
 * ekstrapolasyon yapmak, kullanıcının çizmediği bir davranışı uydurmaktır.
 */
export function curveField(
  points: readonly (readonly [number, number])[],
  input: FieldFn,
): FieldFn {
  const sorted = [...points].sort((first, second) => first[0] - second[0]);
  const xs = Float64Array.from(sorted, (point) => point[0]);
  const ys = Float64Array.from(sorted, (point) => point[1]);
  const last = xs.length - 1;

  return (x, y) => {
    const value = input(x, y);
    if (value <= xs[0]) return ys[0];
    if (value >= xs[last]) return ys[last];

    // Aralık sayısı küçük olduğu için doğrusal tarama ikili aramadan hızlıdır.
    let i = 0;
    while (i < last && xs[i + 1] < value) i++;
    const span = xs[i + 1] - xs[i];
    if (span <= 0) return ys[i + 1];
    return lerp(ys[i], ys[i + 1], (value - xs[i]) / span);
  };
}

export function clampField(min: number, max: number, input: FieldFn): FieldFn {
  return (x, y) => clamp(input(x, y), min, max);
}

/** Mutlak değer — bir SDF'yi KONTURA çevirmenin yolu (§4.1). */
export function absField(input: FieldFn): FieldFn {
  return (x, y) => Math.abs(input(x, y));
}

/** `1 − x`; kapsama alanlarını tersine çevirir. */
export function invertField(input: FieldFn): FieldFn {
  return (x, y) => 1 - input(x, y);
}
