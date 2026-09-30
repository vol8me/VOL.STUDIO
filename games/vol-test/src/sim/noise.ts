/**
 * Tohumlu 2B değer gürültüsü: yol titreşimi ve kamera sarsıntısı için
 * deterministik, yumuşak bir sinyal. Kafes değeri tamsayı karmasıyla bulunur.
 */
function latticeValue(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** [0, 1) aralığında yumuşak değer gürültüsü. */
export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = latticeValue(x0, y0, seed);
  const b = latticeValue(x0 + 1, y0, seed);
  const c = latticeValue(x0, y0 + 1, seed);
  const d = latticeValue(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}
