/**
 * Yükseklikten normal — §4.5.
 *
 * Sobel türeviyle yükseklik alanının eğimi bulunur ve yüzey normaline
 * çevrilir. Bir yükseklik alanı `h(x, y)` için normal `(−∂h/∂x, −∂h/∂y, 1)`
 * yönündedir; `strength` z ölçeğini değil XY katkısını büyüterek kabartmayı
 * belirginleştirir.
 *
 * **Türev BİRİM uzayda alınır, piksel başına değil.** Piksel farkı
 * çözünürlükle küçülür: aynı belge 512²'de 64²'ye göre sekiz kat daha yassı
 * görünürdü. Bölen `2 · pixelUnit` olduğunda eğim çözünürlükten bağımsız
 * kalır (D2).
 */

import type { EdgeMode } from '../field/sample';

export interface NormalChannel {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
}

/** Sobel çekirdeğinin normalizasyon katsayısı. */
const SOBEL_SCALE = 8;

export function computeNormals(
  height: Float32Array,
  width: number,
  rows: number,
  strength: number,
  pixelUnit: number,
  edge: EdgeMode,
): NormalChannel {
  const count = width * rows;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);

  const at = (px: number, py: number): number => {
    let cx = px;
    let cy = py;
    if (edge === 'wrap') {
      cx = ((px % width) + width) % width;
      cy = ((py % rows) + rows) % rows;
    } else {
      cx = px < 0 ? 0 : px >= width ? width - 1 : px;
      cy = py < 0 ? 0 : py >= rows ? rows - 1 : py;
    }
    return height[cy * width + cx];
  };

  const spacing = SOBEL_SCALE * pixelUnit;

  for (let py = 0; py < rows; py++) {
    for (let px = 0; px < width; px++) {
      const gx =
        at(px + 1, py - 1) +
        2 * at(px + 1, py) +
        at(px + 1, py + 1) -
        (at(px - 1, py - 1) + 2 * at(px - 1, py) + at(px - 1, py + 1));
      const gy =
        at(px - 1, py + 1) +
        2 * at(px, py + 1) +
        at(px + 1, py + 1) -
        (at(px - 1, py - 1) + 2 * at(px, py - 1) + at(px + 1, py - 1));

      const nx = (-gx / spacing) * strength;
      const ny = (-gy / spacing) * strength;
      const length = Math.hypot(nx, ny, 1);
      const index = py * width + px;
      x[index] = nx / length;
      y[index] = ny / length;
      z[index] = 1 / length;
    }
  }

  return { x, y, z };
}
