import type { RasterBuffer } from './transform';

/** Pikseller ilk await öncesinde kopyalanır; sonradan yapılan edit kayda karışmaz. */
export function encodePng(buffer: RasterBuffer): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = buffer.width;
  canvas.height = buffer.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('[encodePng] 2D context alınamadı');
  const image = context.createImageData(buffer.width, buffer.height);
  image.data.set(buffer.rgba);
  context.putImageData(image, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('[encodePng] PNG üretilemedi'));
    }, 'image/png');
  });
}
