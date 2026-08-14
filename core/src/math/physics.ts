import { TECH } from '../constants';

/**
 * piksel/saniye cinsinden hızı, Matter.js `setVelocity` için piksel/adım'a çevirir.
 * Matter `setVelocity` piksel/adım bekler, config hızları piksel/saniye dir.
 *
 * @param pixelsPerSecond — piksel/saniye cinsinden hız
 * @param deltaMs — adım süresi (ms). Verilmezse 60 FPS fixed timestep (16.67ms).
 * @returns piksel/adım cinsinden hız
 */
export function toStepVelocity(
  pixelsPerSecond: number,
  deltaMs: number = TECH.MS_PER_SECOND / 60,
): number {
  // Geçersiz veya negatif adım süresi fiziksel anlam taşımaz; sıfırla.
  // Sonsuz/NaN hız da aynı şekilde yutulur, yoksa Matter.js'a taşar.
  if (!Number.isFinite(pixelsPerSecond) || !Number.isFinite(deltaMs) || deltaMs < 0) {
    return 0;
  }
  return pixelsPerSecond * (Math.max(0, deltaMs) / TECH.MS_PER_SECOND);
}
