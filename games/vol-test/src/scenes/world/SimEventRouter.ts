import { vibrate } from '@volstudio/core';
import { FEEL } from '@/config/feel';
import type { FollowCamera } from '@/sim/camera/FollowCamera';
import type { SimEvent } from '@/sim/events';
import type { ArenaView } from '@/view/ArenaView';
import type { EffectsView } from '@/view/EffectsView';
import type { TankView } from '@/view/TankView';

export interface SimEventTargets {
  readonly tank: Pick<TankView, 'fire'>;
  readonly effects: Pick<EffectsView, 'muzzle' | 'impact' | 'wallHit'>;
  readonly arena: Pick<ArenaView, 'strike'>;
  readonly camera: Pick<FollowCamera, 'kick' | 'addTrauma'>;
}

/**
 * Simülasyon olaylarını sunuma dağıtır: görünüm, efekt, kamera ve titreşim.
 * Olay → tepki eşlemesinin tek yeri burasıdır; ölçüler `config/feel.ts`ten
 * gelir. Simülasyona geri yazmaz.
 */
export function routeSimEvents(events: readonly SimEvent[], targets: SimEventTargets): void {
  for (const event of events) {
    switch (event.kind) {
      case 'fired':
        targets.tank.fire();
        targets.effects.muzzle(event.x, event.y, event.angle);
        targets.camera.kick(event.angle, FEEL.fire.cameraKick);
        targets.camera.addTrauma(FEEL.fire.trauma);
        vibrate('tap');
        break;
      case 'impact':
        targets.effects.impact(event.x, event.y, event.angle);
        break;
      case 'wallHit': {
        const wall = FEEL.wall;
        const strength = Math.min(1, event.speed / wall.fullSpeed);
        targets.arena.strike(event.x, event.y, event.normalX, event.speed);
        targets.effects.wallHit(event.x, event.y, event.normalX, event.normalY, strength);
        targets.camera.addTrauma(wall.traumaBase + strength * wall.traumaScale);
        vibrate(strength >= wall.heavyHaptic ? 'warning' : 'tap');
        break;
      }
    }
  }
}
