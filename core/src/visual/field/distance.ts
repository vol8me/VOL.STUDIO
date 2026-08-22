/**
 * Tam Öklid mesafe dönüşümü — Felzenszwalb & Huttenlocher, §5.4.
 *
 * **Chamfer/iki-geçişli yaklaşım kullanılmaz.** Hızlıdır ama ANİZOTROPİKTİR:
 * çapraz yönlerde hata birikir ve mesafeden türetilen her şey (dış çizgi
 * kalınlığı, kenar yumuşaklığı) yöne göre değişir. Bu algoritma O(n) ve
 * TAM Öklid karesi verir.
 *
 * Yöntem: her satır için parabollerin alt zarfı (lower envelope) hesaplanır,
 * sonra sütunlar için aynısı. Ayrılabilirliğin sebebi, kare Öklid
 * uzaklığının eksenler üzerinde toplanabilir olmasıdır.
 */

/** Sonsuz yerine kullanılan büyük sonlu değer — aritmetiği NaN'a düşürmez. */
const FAR = 1e20;

/**
 * Tek boyutlu mesafe dönüşümü (kare uzaklık).
 *
 * `f` girdi maliyetleri, `out` sonuç. `v` ve `z` çağıran tarafından verilen
 * scratch dizileridir; satır başına yeniden ayırmak 2048²'de binlerce
 * gereksiz tahsis demekti.
 */
export function distanceTransform1d(
  f: Float64Array,
  out: Float64Array,
  n: number,
  v: Int32Array,
  z: Float64Array,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;

  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const d = q - v[k];
    out[q] = d * d + f[v[k]];
  }
}

/**
 * İki boyutlu kare mesafe dönüşümü.
 *
 * `mask[i]` sıfırsa o piksel KAYNAKTIR (uzaklık 0), değilse uzaklık aranır.
 * `wrap` iken satır/sütun ÜÇ KEZ kopyalanıp orta üçte biri alınır: alt zarf
 * hesabı doğası gereği doğrusaldır ve sarmayı kendiliğinden bilmez. Üç kopya
 * yeterlidir çünkü sarmalı en yakın kaynak en fazla yarım periyot uzaktadır.
 */
export function squaredDistanceTransform(
  mask: Float64Array,
  width: number,
  height: number,
  wrap: boolean,
): Float64Array {
  const span = Math.max(width, height);
  const size = wrap ? span * 3 : span;
  const f = new Float64Array(size);
  const out = new Float64Array(size);
  const v = new Int32Array(size + 1);
  const z = new Float64Array(size + 2);
  const result = Float64Array.from(mask);

  const transformLine = (
    read: (i: number) => number,
    write: (i: number, value: number) => void,
    n: number,
  ): void => {
    if (!wrap) {
      for (let i = 0; i < n; i++) f[i] = read(i);
      distanceTransform1d(f, out, n, v, z);
      for (let i = 0; i < n; i++) write(i, out[i]);
      return;
    }
    for (let i = 0; i < n; i++) {
      const value = read(i);
      f[i] = value;
      f[i + n] = value;
      f[i + 2 * n] = value;
    }
    distanceTransform1d(f, out, n * 3, v, z);
    for (let i = 0; i < n; i++) write(i, out[i + n]);
  };

  for (let x = 0; x < width; x++) {
    transformLine(
      (y) => result[y * width + x],
      (y, value) => {
        result[y * width + x] = value;
      },
      height,
    );
  }

  for (let y = 0; y < height; y++) {
    const row = y * width;
    transformLine(
      (x) => result[row + x],
      (x, value) => {
        result[row + x] = value;
      },
      width,
    );
  }

  return result;
}

/**
 * İŞARETLİ mesafe alanı üretir: içeride negatif, dışarıda pozitif, piksel
 * cinsinden.
 *
 * İşaretsiz bırakmak alanı `min`/`max` ile birleştirilemez yapardı; işaretli
 * olması onu bir SDF üreticisi hâline getirir ve mevcut cebre bağlar (D9).
 * Bedeli tek bir ek geçiştir.
 */
export function signedDistanceField(
  source: Float32Array,
  width: number,
  height: number,
  threshold: number,
  wrap: boolean,
): Float64Array {
  const count = width * height;
  const inside = new Float64Array(count);
  const outside = new Float64Array(count);

  for (let i = 0; i < count; i++) {
    const isInside = source[i] >= threshold;
    outside[i] = isInside ? 0 : FAR;
    inside[i] = isInside ? FAR : 0;
  }

  const toSource = squaredDistanceTransform(outside, width, height, wrap);
  const toEdge = squaredDistanceTransform(inside, width, height, wrap);

  const result = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    result[i] = Math.sqrt(toSource[i]) - Math.sqrt(toEdge[i]);
  }
  return result;
}
