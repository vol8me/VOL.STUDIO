import type { RendererRequest } from '@volstudio/core';
import { assertFiniteRange, assertPositiveFinite, assertPositiveInteger } from './validation';

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
  readonly cameraMaxZoomFactor: number;
  readonly cameraInitialZoomFactor: number;
  /** Habitat içi alan dokusunun kıyıya yaklaşırken karardığı mesafe. */
  readonly habitatEdgeFadeUnits: number;
  /** Kıyı ışıması dokusunun kenar çözünürlüğü; ölçümle seçilir (DESIGN §6). */
  readonly habitatGlowResolution: number;
  /** Void tarafında ışımanın e katı söndüğü mesafe. */
  readonly habitatGlowDecayUnits: number;
  /** Kıyı vurgusunun yarı genişliği. */
  readonly habitatGlowShoreWidthUnits: number;
  /** Habitat içinde ışımanın tamamen bittiği mesafe. */
  readonly habitatGlowInteriorFadeUnits: number;
  readonly habitatGlowVoidAlpha: number;
  readonly habitatGlowShoreAlpha: number;
  /**
   * Işıma rasteri kare başına bu bütçe kadar satır işler. 512² raster tek
   * seferde 723 ms sürüyor ve ana iş parçacığını kilitliyordu (DESIGN §18);
   * ölçülen satır maliyeti 1,41 ms olduğundan 6 ms ≈ 4 satır/kare, doku
   * ~128 karede (≈2,1 sn) dolar ve hiçbir kare bir satırdan fazla taşmaz.
   */
  readonly habitatGlowRasterBudgetMs: number;
  /** Void'in kıyıda içeri akan karanlık nabzı; fiziği DEĞİL alfayı oynatır. */
  readonly voidPulsePeriodMs: number;
  readonly voidPulseAlphaMin: number;
  readonly voidPulseAlphaMax: number;
  readonly voidColor: number;
  /** Depolama dikdörtgeninin ötesindeki kamera arka planı; Void'in kendisi. */
  readonly voidBackgroundColor: number;
  /** Void ölüm hayaletinin ömrü ve aynı anda çizilecek azami hayalet. */
  readonly voidDeathDurationMs: number;
  readonly voidDeathMaxGhosts: number;
  readonly voidDeathStretchMax: number;
  /** Parçacık glyph'inin hız yönünde ve Void normali yönünde azami uzaması. */
  readonly particleVelocityStretchMax: number;
  readonly particleFringeStretchMax: number;
}

export const lifeGraphicsConfig: LifeGraphicsConfig = {
  renderScale: 1,
  renderer: 'webgl',
  cameraMaxZoomFactor: 3,
  cameraInitialZoomFactor: 1,
  habitatEdgeFadeUnits: 64,
  habitatGlowResolution: 512,
  habitatGlowDecayUnits: 40,
  habitatGlowShoreWidthUnits: 12,
  habitatGlowInteriorFadeUnits: 28,
  habitatGlowVoidAlpha: 0.85,
  habitatGlowShoreAlpha: 1,
  habitatGlowRasterBudgetMs: 6,
  voidPulsePeriodMs: 9000,
  voidPulseAlphaMin: 0.05,
  voidPulseAlphaMax: 0.16,
  voidColor: 0x0b1020,
  voidBackgroundColor: 0x000000,
  voidDeathDurationMs: 520,
  voidDeathMaxGhosts: 48,
  voidDeathStretchMax: 2.6,
  particleVelocityStretchMax: 1.25,
  particleFringeStretchMax: 1.9,
};

export function validateLifeGraphicsConfig(config: LifeGraphicsConfig): void {
  assertPositiveFinite(config.renderScale, 'Render ölçeği');
  assertFiniteRange(config.cameraMaxZoomFactor, 1, 16, 'Kamera azami zoom çarpanı');
  assertFiniteRange(
    config.cameraInitialZoomFactor,
    1,
    config.cameraMaxZoomFactor,
    'Kamera başlangıç zoom çarpanı',
  );
  assertPositiveFinite(config.habitatEdgeFadeUnits, 'Habitat kıyı karartma mesafesi');
  assertPositiveInteger(config.habitatGlowResolution, 'Işıma çözünürlüğü');
  if ((config.habitatGlowResolution & (config.habitatGlowResolution - 1)) !== 0) {
    throw new RangeError('Işıma çözünürlüğü ikinin kuvveti olmalı (WebGL1 doku sözleşmesi).');
  }
  assertPositiveFinite(config.habitatGlowDecayUnits, 'Işıma sönüm mesafesi');
  assertPositiveFinite(config.habitatGlowShoreWidthUnits, 'Kıyı vurgusu genişliği');
  assertPositiveFinite(config.habitatGlowInteriorFadeUnits, 'Işımanın habitat içi bitiş mesafesi');
  assertFiniteRange(config.habitatGlowVoidAlpha, 0, 1, 'Işıma Void alfası');
  assertFiniteRange(config.habitatGlowShoreAlpha, 0, 1, 'Işıma kıyı alfası');
  assertPositiveFinite(config.habitatGlowRasterBudgetMs, 'Işıma raster bütçesi');
  assertPositiveFinite(config.voidPulsePeriodMs, 'Void nabız periyodu');
  assertFiniteRange(config.voidPulseAlphaMin, 0, 1, 'Void nabız alt alfa');
  assertFiniteRange(config.voidPulseAlphaMax, config.voidPulseAlphaMin, 1, 'Void nabız üst alfa');
  assertFiniteRange(config.voidColor, 0, 0xffffff, 'Void rengi');
  assertFiniteRange(config.voidBackgroundColor, 0, 0xffffff, 'Void arka plan rengi');
  assertPositiveFinite(config.voidDeathDurationMs, 'Void ölüm süresi');
  assertPositiveInteger(config.voidDeathMaxGhosts, 'Void hayalet tavanı');
  assertFiniteRange(config.voidDeathStretchMax, 1, 8, 'Void ölüm uzaması');
  assertFiniteRange(config.particleVelocityStretchMax, 1, 4, 'Hız uzaması');
  assertFiniteRange(config.particleFringeStretchMax, 1, 4, 'Fringe uzaması');
}
