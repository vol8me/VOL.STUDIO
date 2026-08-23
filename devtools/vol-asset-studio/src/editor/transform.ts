import type { SurfaceRect } from './RasterSurface';

export interface RasterBuffer {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

function emptyBuffer(width: number, height: number): RasterBuffer {
  return { width, height, rgba: new Uint8ClampedArray(width * height * 4) };
}

function copyPixel(
  source: RasterBuffer,
  sourceX: number,
  sourceY: number,
  target: RasterBuffer,
  targetX: number,
  targetY: number,
): void {
  if (sourceX < 0 || sourceY < 0 || sourceX >= source.width || sourceY >= source.height) return;
  if (targetX < 0 || targetY < 0 || targetX >= target.width || targetY >= target.height) return;
  const from = (sourceY * source.width + sourceX) * 4;
  const to = (targetY * target.width + targetX) * 4;
  target.rgba[to] = source.rgba[from];
  target.rgba[to + 1] = source.rgba[from + 1];
  target.rgba[to + 2] = source.rgba[from + 2];
  target.rgba[to + 3] = source.rgba[from + 3];
}

export function flipHorizontal(source: RasterBuffer): RasterBuffer {
  const target = emptyBuffer(source.width, source.height);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      copyPixel(source, x, y, target, source.width - 1 - x, y);
    }
  }
  return target;
}

export function flipVertical(source: RasterBuffer): RasterBuffer {
  const target = emptyBuffer(source.width, source.height);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      copyPixel(source, x, y, target, x, source.height - 1 - y);
    }
  }
  return target;
}

/** 90° adımlarla döndürür; kenarlar tek sayı katlarda takas olur. */
export function rotateQuarterTurns(source: RasterBuffer, turns: number): RasterBuffer {
  const steps = ((Math.trunc(turns) % 4) + 4) % 4;
  if (steps === 0) return { ...source, rgba: new Uint8ClampedArray(source.rgba) };
  const swapped = steps % 2 === 1;
  const target = emptyBuffer(
    swapped ? source.height : source.width,
    swapped ? source.width : source.height,
  );
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const [tx, ty] =
        steps === 1
          ? [source.height - 1 - y, x]
          : steps === 2
          ? [source.width - 1 - x, source.height - 1 - y]
          : [y, source.width - 1 - x];
      copyPixel(source, x, y, target, tx, ty);
    }
  }
  return target;
}

/**
 * Nearest-neighbor ölçekleme.
 *
 * Pixel-art'ta enterpolasyon YASAKTIR: bilinear ölçekleme her kenarı
 * bulanıklaştırır, paleti bozar ve indexed çıktıyı imkânsız kılar.
 */
export function scaleNearest(source: RasterBuffer, width: number, height: number): RasterBuffer {
  const targetWidth = Math.max(1, Math.trunc(width));
  const targetHeight = Math.max(1, Math.trunc(height));
  const target = emptyBuffer(targetWidth, targetHeight);
  const ratioX = source.width / targetWidth;
  const ratioY = source.height / targetHeight;
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor(y * ratioY));
    for (let x = 0; x < targetWidth; x += 1) {
      copyPixel(source, Math.min(source.width - 1, Math.floor(x * ratioX)), sourceY, target, x, y);
    }
  }
  return target;
}

/** Belgeyi verilen dikdörtgene kırpar; dışarı taşan bölge saydam kalır. */
export function crop(source: RasterBuffer, rect: SurfaceRect): RasterBuffer {
  const width = Math.max(1, Math.trunc(rect.width));
  const height = Math.max(1, Math.trunc(rect.height));
  const target = emptyBuffer(width, height);
  const originX = Math.trunc(rect.x);
  const originY = Math.trunc(rect.y);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      copyPixel(source, originX + x, originY + y, target, x, y);
    }
  }
  return target;
}

export type ResizeAnchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

/**
 * Tuval boyutunu değiştirir; içerik ÖLÇEKLENMEZ, yalnız yeniden konumlanır.
 *
 * `scaleNearest` ile karıştırılmamalı: canvas resize belgeye yer ekler ya da
 * keser, image resize ise pikselleri yeniden örnekler.
 */
export function resizeCanvas(
  source: RasterBuffer,
  width: number,
  height: number,
  anchor: ResizeAnchor = 'center',
): RasterBuffer {
  const targetWidth = Math.max(1, Math.trunc(width));
  const targetHeight = Math.max(1, Math.trunc(height));
  const target = emptyBuffer(targetWidth, targetHeight);
  const horizontal = anchor.includes('left') ? 0 : anchor.includes('right') ? 1 : 0.5;
  const vertical = anchor.includes('top') ? 0 : anchor.includes('bottom') ? 1 : 0.5;
  const offsetX = Math.round((targetWidth - source.width) * horizontal);
  const offsetY = Math.round((targetHeight - source.height) * vertical);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      copyPixel(source, x, y, target, x + offsetX, y + offsetY);
    }
  }
  return target;
}

/** Maske dışını temizler; seçim dışı pikseller saydamlaşır. */
export function clearOutsideMask(source: RasterBuffer, mask: Uint8Array): RasterBuffer {
  const target: RasterBuffer = {
    width: source.width,
    height: source.height,
    rgba: new Uint8ClampedArray(source.rgba),
  };
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 1) continue;
    target.rgba[index * 4 + 3] = 0;
  }
  return target;
}
