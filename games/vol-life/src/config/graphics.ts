import type { RendererRequest } from '@volstudio/core';

export interface LifeGraphicsConfig {
  /** Rasterleme çözünürlüğü çarpanı; dünya ölçüsü değişmez, piksel sayısı düşer. */
  readonly renderScale: number;
  /**
   * Renderer AÇIKÇA istenir.
   *
   * `'webgl'` seçilir çünkü yoğun parçacık çizimi GPU'ya dayanır; hangi WebGL
   * yolunun kullanılacağı ölçümle seçilir (DESIGN.md §11). Canvas2D'ye sessizce
   * düşen bir koşu ölçümü de görüntüyü de yanıltır. Kurulamıyorsa belirsiz bir
   * yavaşlık yerine açık bir hata yeğdir.
   */
  readonly renderer: RendererRequest;
}

export const lifeGraphicsConfig: LifeGraphicsConfig = {
  renderScale: 1,
  renderer: 'webgl',
};
