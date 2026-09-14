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
  /** Kontur örnekleme yoğunluğu; polygon köşe sayısı. */
  readonly habitatContourSegments: number;
  /** Void'in kıyıda içeri akan karanlık nabzı; fiziği DEĞİL alfayı oynatır. */
  readonly voidPulsePeriodMs: number;
  readonly voidPulseAlphaMin: number;
  readonly voidPulseAlphaMax: number;
  readonly voidGlowRingCount: number;
  readonly voidGlowRingSpacingUnits: number;
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
  habitatContourSegments: 192,
  voidPulsePeriodMs: 9000,
  voidPulseAlphaMin: 0.05,
  voidPulseAlphaMax: 0.16,
  voidGlowRingCount: 4,
  voidGlowRingSpacingUnits: 10,
  voidColor: 0x0b1020,
  voidBackgroundColor: 0x000000,
  voidDeathDurationMs: 520,
  voidDeathMaxGhosts: 48,
  voidDeathStretchMax: 2.6,
  particleVelocityStretchMax: 1.6,
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
  assertPositiveInteger(config.habitatContourSegments, 'Kontur segment sayısı');
  if (config.habitatContourSegments < 24) {
    throw new RangeError('Kontur en az 24 segmentle örneklenmeli.');
  }
  assertPositiveFinite(config.voidPulsePeriodMs, 'Void nabız periyodu');
  assertFiniteRange(config.voidPulseAlphaMin, 0, 1, 'Void nabız alt alfa');
  assertFiniteRange(config.voidPulseAlphaMax, config.voidPulseAlphaMin, 1, 'Void nabız üst alfa');
  assertPositiveInteger(config.voidGlowRingCount, 'Void halka sayısı');
  assertPositiveFinite(config.voidGlowRingSpacingUnits, 'Void halka aralığı');
  assertFiniteRange(config.voidColor, 0, 0xffffff, 'Void rengi');
  assertFiniteRange(config.voidBackgroundColor, 0, 0xffffff, 'Void arka plan rengi');
  assertPositiveFinite(config.voidDeathDurationMs, 'Void ölüm süresi');
  assertPositiveInteger(config.voidDeathMaxGhosts, 'Void hayalet tavanı');
  assertFiniteRange(config.voidDeathStretchMax, 1, 8, 'Void ölüm uzaması');
  assertFiniteRange(config.particleVelocityStretchMax, 1, 4, 'Hız uzaması');
  assertFiniteRange(config.particleFringeStretchMax, 1, 4, 'Fringe uzaması');
}
