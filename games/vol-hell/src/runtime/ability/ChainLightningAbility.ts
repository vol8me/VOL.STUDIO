import { Ability, type AbilityContext } from './types';

/**
 * Zincir yıldırım ability'si — oyuncudan çıkıp düşmandan düşmana sıçrayan
 * bir yay başlatır. Hasar her sıçramada sabittir.
 *
 * Sıçrama sayısı ability'nin KENDİ parametresidir (dört temel stat'a ait
 * değildir): taban değer `ABILITY_CATALOG`'ta, kartlardan gelen artışlar
 * `AbilityUpgrades`'te durur ve yay doğarken toplanır.
 */
export class ChainLightningAbility extends Ability {
  /** Taban + kart bonusu sıçrama sayısı — HUD/kart metni ve test için. */
  getTotalBounces(context: AbilityContext): number {
    const base = this.definition.chain?.bounces ?? 0;
    return Math.max(0, base + context.upgrades.get('chainBounces'));
  }

  protected onActivate(context: AbilityContext): void {
    context.world.spawnChainLightning(context.playerX, context.playerY, this.definition);
  }
}
