/**
 * Tampon örnekleme — Aşama 2'nin çıkışı.
 *
 * Tamponlu bir düğüm (filtre, `warp`, `scatter`) sonucunu hedef
 * çözünürlükte bir tampona yazar; ondan sonra alan olarak okunabilmesi için
 * bir örnekleyiciye ihtiyacı olur.
 *
 * **Bu, D4'ün kabul ettiği tek yeniden örnekleme noktasıdır.** Aşama 1
 * boyunca dönüşümler tamdır; tampona yazılan bir sonuç ise ancak
 * örneklenerek okunabilir. `nearest` piksel sanatında keskinliği korur,
 * `bilinear` yüksek çözünürlükte yumuşaklık verir — seçim parametredir,
 * varsayılan değil.
 */

import type { FieldBuffer } from './buffer';
import type { FieldFn } from './fn';
import type { UnitSpace } from './space';

export type SampleMode = 'nearest' | 'bilinear';

/** Tampon sınırı dışında ne olacağı — `tileable` bunu belirler (§4.4). */
export type EdgeMode = 'clamp' | 'wrap';

function resolveIndex(index: number, size: number, edge: EdgeMode): number {
  if (edge === 'wrap') {
    const wrapped = index % size;
    return wrapped < 0 ? wrapped + size : wrapped;
  }
  return index < 0 ? 0 : index >= size ? size - 1 : index;
}

/** Tampondan tek piksel okur; sınır davranışı `edge` ile belirlenir. */
export function readPixel(buffer: FieldBuffer, px: number, py: number, edge: EdgeMode): number {
  const x = resolveIndex(px, buffer.width, edge);
  const y = resolveIndex(py, buffer.height, edge);
  return buffer.data[y * buffer.width + x];
}

/** Birim koordinatı piksel koordinatına çevirir — `UnitSpace.unitX`in tersi. */
export function toPixelX(space: UnitSpace, x: number): number {
  return (x * space.short + space.canvasWidth - 1) / 2 - space.offsetX;
}

export function toPixelY(space: UnitSpace, y: number): number {
  return (y * space.short + space.canvasHeight - 1) / 2 - space.offsetY;
}

/** Tamponu birim uzayda okunabilir bir alana çevirir. */
export function createBufferSampler(
  buffer: FieldBuffer,
  space: UnitSpace,
  mode: SampleMode,
  edge: EdgeMode,
): FieldFn {
  if (mode === 'nearest') {
    return (x, y) =>
      readPixel(buffer, Math.round(toPixelX(space, x)), Math.round(toPixelY(space, y)), edge);
  }

  return (x, y) => {
    const px = toPixelX(space, x);
    const py = toPixelY(space, y);
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const fx = px - x0;
    const fy = py - y0;

    const top =
      readPixel(buffer, x0, y0, edge) * (1 - fx) + readPixel(buffer, x0 + 1, y0, edge) * fx;
    const bottom =
      readPixel(buffer, x0, y0 + 1, edge) * (1 - fx) + readPixel(buffer, x0 + 1, y0 + 1, edge) * fx;
    return top * (1 - fy) + bottom * fy;
  };
}
