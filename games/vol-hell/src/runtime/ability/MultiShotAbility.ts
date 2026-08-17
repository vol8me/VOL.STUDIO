import { Ability, type AbilityContext } from './types';
import { sfxVolumes } from '@/config/audio';

/** Nişan yönü yoksa sağa doğru ateşlenir. */
const DEFAULT_AIM_X = 1;

/**
 * Çoklu mermi ability'si — tek aktivasyonda yelpaze şeklinde birden fazla
 * mermi fırlatır.
 *
 * Mermiler normal silah altyapısını (`BulletManager`) kullanır ama ateş
 * cooldown'unu ATLAR: ability'nin kendi cooldown'u zaten sınırlayıcıdır.
 * Mermi başına hasar `damageScale` ile düşürülür — toplam hasar kontrollü
 * kalsın, "çok mermi" tek başına ezici olmasın.
 */
export class MultiShotAbility extends Ability {
  /** Taban + kart bonusu mermi sayısı. */
  getProjectileCount(context: AbilityContext): number {
    const base = this.definition.multiShot?.projectiles ?? 0;
    return Math.max(1, base + context.upgrades.get('multiShotProjectiles'));
  }

  protected onActivate(context: AbilityContext): void {
    const params = this.definition.multiShot;
    if (!params) return;

    const count = this.getProjectileCount(context);
    const damage = Math.max(0, context.playerStats.getValue('damage') * params.damageScale);

    const length = Math.hypot(context.aimX, context.aimY);
    const aimAngle =
      length > 0 ? Math.atan2(context.aimY, context.aimX) : Math.atan2(0, DEFAULT_AIM_X);

    // Salvo tek bir "patlama" gibi okunsun: mermilerden önce namlu parlaması.
    context.world.playSfx('multiShot', sfxVolumes.multiShot);
    context.effects.play(
      'multiShotCast',
      context.playerX,
      context.playerY,
      (aimAngle * 180) / Math.PI,
    );

    const spreadRad = (params.spreadDeg * Math.PI) / 180;
    // 360 derecelik yelpazede ilk ve son mermi çakışmasın diye adım sayısı
    // farklı: tam daire mermileri eşit aralıklı dağıtılır.
    const isFullCircle = params.spreadDeg >= 360;
    const step = isFullCircle ? spreadRad / count : count > 1 ? spreadRad / (count - 1) : 0;
    const start = isFullCircle ? aimAngle : aimAngle - spreadRad / 2;

    for (let i = 0; i < count; i++) {
      const angle = start + step * i;
      context.world.fireBullet(
        context.playerX,
        context.playerY,
        Math.cos(angle),
        Math.sin(angle),
        damage,
      );
    }
  }
}
