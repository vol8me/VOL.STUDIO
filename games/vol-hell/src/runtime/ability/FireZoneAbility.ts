import { Ability, type AbilityContext } from './types';

/** Nişan yönü boşsa alan oyuncunun üstüne serilir. */
const AIM_EPSILON = 0.0001;

/**
 * Ateş alanı ability'si — nişan yönünde, oyuncunun biraz ilerisine süreli
 * hasar veren bir kor alanı serer.
 *
 * Alanı oyuncunun tam üstüne değil, nişan yönünde bırakır: oyuncu alandan
 * çıkıp düşmanı içinde tutabilsin diye.
 */
export class FireZoneAbility extends Ability {
  protected onActivate(context: AbilityContext): void {
    const params = this.definition.fire;
    if (!params) return;

    const length = Math.hypot(context.aimX, context.aimY);
    // Yerleştirme mesafesi alanın yarıçapına bağlı: büyük alan daha ileri düşer.
    const distance = params.radius * 0.6;
    const offsetX = length > AIM_EPSILON ? (context.aimX / length) * distance : 0;
    const offsetY = length > AIM_EPSILON ? (context.aimY / length) * distance : 0;

    const x = context.border.clampX(context.playerX + offsetX, params.radius);
    const y = context.border.clampY(context.playerY + offsetY, params.radius);
    context.world.spawnFireZone(x, y, this.definition);
  }
}
