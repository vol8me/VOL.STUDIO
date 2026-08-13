import type { BehaviorContext, VelocityOutput } from './types';

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
  const dx = context.targetX - context.x;
  const dy = context.targetY - context.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= stopDistance || distance === 0) {
    out.x = 0;
    out.y = 0;
    return;
  }

  out.x = (dx / distance) * context.speed;
  out.y = (dy / distance) * context.speed;
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
  const dx = context.targetX - context.x;
  const dy = context.targetY - context.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    out.x = 0;
    out.y = 0;
    return;
  }

  const tolerance = standoffDistance * toleranceRatio;
  if (distance > standoffDistance + tolerance) {
    out.x = (dx / distance) * context.speed;
    out.y = (dy / distance) * context.speed;
    return;
  }

  if (distance < standoffDistance - tolerance) {
    out.x = -(dx / distance) * context.speed;
    out.y = -(dy / distance) * context.speed;
    return;
  }

  out.x = 0;
  out.y = 0;
}
