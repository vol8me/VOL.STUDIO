import type { BehaviorContext, VelocityOutput } from './types';
import { finiteOr, nonNegativeFinite } from '@/runtime/utils/numeric';

/**
 * Temel takip: hedefe doğru tam hızda gider, `stopDistance` mesafesine
 * gelince durur (içine girmez). `base` arketipin tüm hareketi budur; rusher
 * ve swarmer da yaklaşma fazlarında bunu kullanır.
 */
export function applySeekBehavior(
  context: BehaviorContext,
  stopDistance: number,
  out: VelocityOutput,
): void {
  const x = finiteOr(context.x, 0);
  const y = finiteOr(context.y, 0);
  const targetX = finiteOr(context.targetX, x);
  const targetY = finiteOr(context.targetY, y);
  const speed = nonNegativeFinite(context.speed);
  const safeStopDistance = nonNegativeFinite(stopDistance);
  const dx = targetX - x;
  const dy = targetY - y;
  const distance = Math.hypot(dx, dy);

  if (distance <= safeStopDistance || distance === 0) {
    out.x = 0;
    out.y = 0;
    return;
  }

  out.x = (dx / distance) * speed;
  out.y = (dy / distance) * speed;
}

/**
 * Mesafe koruma: hedef `standoffDistance`'tan uzaksa yaklaşır, çok yakınsa
 * geri çekilir, bant içindeyse durur. Swarmer'ın konumlanması bunu kullanır.
 *
 * `toleranceRatio` bandın genişliğini belirler; salınımı (yaklaş-kaç titremesi)
 * engeller.
 */
export function applyStandoffBehavior(
  context: BehaviorContext,
  standoffDistance: number,
  toleranceRatio: number,
  out: VelocityOutput,
): void {
  const x = finiteOr(context.x, 0);
  const y = finiteOr(context.y, 0);
  const targetX = finiteOr(context.targetX, x);
  const targetY = finiteOr(context.targetY, y);
  const speed = nonNegativeFinite(context.speed);
  const safeStandoff = nonNegativeFinite(standoffDistance);
  const safeToleranceRatio = nonNegativeFinite(toleranceRatio);
  const dx = targetX - x;
  const dy = targetY - y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    out.x = 0;
    out.y = 0;
    return;
  }

  const tolerance = safeStandoff * safeToleranceRatio;
  if (distance > safeStandoff + tolerance) {
    out.x = (dx / distance) * speed;
    out.y = (dy / distance) * speed;
    return;
  }

  if (distance < safeStandoff - tolerance) {
    out.x = -(dx / distance) * speed;
    out.y = -(dy / distance) * speed;
    return;
  }

  out.x = 0;
  out.y = 0;
}
