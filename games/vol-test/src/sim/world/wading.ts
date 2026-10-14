import { WADING } from '@/config/lakes';

/**
 * Yüzemeyen şasinin (tank, yürüyücü) derinliğe göre hız çarpanı: kıyıda hafif, derinde dik düşer.
 * Hız kaybı kesintisizdir (basamak yok), böylece kıyıdan dönmek mümkündür ama derine inen kolay çıkamaz.
 */
export function wadingSpeed(depth: number): number {
  if (!(depth > 0)) return 1;
  const clamped = depth > 1 ? 1 : depth;
  return 1 - (1 - WADING.speedFloor) * clamped ** WADING.speedCurve;
}

/**
 * Yüzemeyen şasinin bu derinlikte saniyede yitirdiği azami can oranı (`WADING.hurtPerSecond`'a
 * kadar): diz boyu suda sıfırdır, derinleştikçe kareli büyür.
 */
export function drowningRate(depth: number): number {
  if (depth <= WADING.hurtDepth) return 0;
  const t = Math.min(1, (depth - WADING.hurtDepth) / (1 - WADING.hurtDepth));
  return WADING.hurtPerSecond * t * t;
}
