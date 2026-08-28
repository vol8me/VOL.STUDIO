/**
 * Kafes karması — gürültü ve serpme kaynağı.
 *
 * **PRNG değil KARMA kullanılır.** Gürültünün değeri KONUMUN fonksiyonu
 * olmalıdır, çağrı sırasının değil: sıralı bir üreteç aynı noktayı iki kez
 * okurken farklı değer verir ve `warp` gibi yeniden örnekleyen işlemler
 * bozulur. Tohum yine D5'in kuralıyla türetilir; değişen yalnızca tohumun
 * nasıl tüketildiğidir.
 */

/** Tamsayı kafes noktasından [0, 1) değeri. */
export function hash2(ix: number, iy: number, seed: number): number {
  let h = (seed ^ Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Aynı kafes noktasından İKİNCİ, bağımsız bir değer (hücre içi konum için). */
export function hash2b(ix: number, iy: number, seed: number): number {
  return hash2(ix, iy, (seed ^ 0x9e3779b9) | 0);
}

/** Tek tamsayıdan [0, 1) değeri — örnek indeksinden dönüşüm türetmek için. */
export function hash1(index: number, seed: number): number {
  let h = (seed ^ Math.imul(index | 0, 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Kafes noktasında birim uzunlukta bir gradyan vektörü (simplex için). */
export function gradient2(ix: number, iy: number, seed: number): [number, number] {
  const angle = hash2(ix, iy, seed) * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)];
}
