import { Ability, type AbilityContext } from './types';

/**
 * Kule ability'si — oyuncunun bulunduğu noktaya bir savunma kulesi diker.
 *
 * TEK KULE kuralı burada değil, `AbilityWorld.replaceTurret()` içinde uygulanır:
 * kural ability'ler ARASI geçerlidir (Q'daki kule ile E'deki farklı bir kule
 * kartı aynı limiti paylaşır).
 */
export class TurretAbility extends Ability {
  protected onActivate(context: AbilityContext): void {
    // Kule oyuncunun ayağının altına kurulur; nişan yönü kule için anlamsız.
    context.world.replaceTurret(context.playerX, context.playerY, this.definition);
  }
}
