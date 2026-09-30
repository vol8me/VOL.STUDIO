import { vibrate } from '@volstudio/core';
import { FEEL } from '@/config/feel';
import type { FollowCamera } from '@volstudio/core/camera';
import type { SimEvent } from '@/sim/events';
import type { ArenaView } from '@/view/ArenaView';
import type { EffectsView } from '@/view/EffectsView';
import type { TankView } from '@/view/TankView';

export interface SimEventTargets {
  /** Kontrol edilen aracın kimliği: kamera ve titreşim yalnız ona tepki verir. */
  readonly player: number;
  readonly tank: (id: number) => Pick<TankView, 'fire'> | undefined;
  readonly effects: Pick<EffectsView, 'muzzle' | 'impact' | 'wallHit'>;
  readonly arena: Pick<ArenaView, 'strike'>;
  readonly camera: Pick<FollowCamera, 'kick' | 'addTrauma'>;
}

/** Çarpma şiddeti [0, 1]: bu hızda tam şiddet. */
function strengthOf(speed: number): number {
  return Math.min(1, speed / FEEL.wall.fullSpeed);
}

/** Oyuncuyu ilgilendiren çarpmanın kamera ve titreşim tepkisi. */
function feelImpact(targets: SimEventTargets, strength: number): void {
  const wall = FEEL.wall;
  targets.camera.addTrauma(wall.traumaBase + strength * wall.traumaScale);
  vibrate(strength >= wall.heavyHaptic ? 'warning' : 'tap', strength);
}

/**
 * Simülasyon olaylarını sunuma dağıtır: görünüm, efekt, kamera ve titreşim.
 * Görsel efekt her araç için oynar; kamera ve titreşim yalnız kontrol edilen
 * araç kaynak ya da hedefse tepki verir. Ölçüler `config/feel.ts`ten gelir.
 */
export function routeSimEvents(events: readonly SimEvent[], targets: SimEventTargets): void {
  for (const event of events) {
    switch (event.kind) {
      case 'fired':
        targets.tank(event.source)?.fire();
        targets.effects.muzzle(event.x, event.y, event.angle);
        if (event.source === targets.player) {
          targets.camera.kick(event.angle, FEEL.fire.cameraKick);
          targets.camera.addTrauma(FEEL.fire.trauma);
          vibrate('tap', FEEL.fire.haptic);
        }
        break;
      case 'impact':
        targets.effects.impact(event.x, event.y, event.angle);
        break;
      case 'hit':
        targets.effects.impact(event.x, event.y, event.angle);
        if (event.target === targets.player) feelImpact(targets, 1);
        break;
      case 'wallHit': {
        const strength = strengthOf(event.speed);
        targets.arena.strike(event.x, event.y, event.normalX, event.speed);
        targets.effects.wallHit(event.x, event.y, event.normalX, event.normalY, strength);
        if (event.source === targets.player) feelImpact(targets, strength);
        break;
      }
      case 'collision': {
        const strength = strengthOf(event.speed);
        targets.effects.wallHit(event.x, event.y, event.normalX, event.normalY, strength);
        if (event.a === targets.player || event.b === targets.player) {
          feelImpact(targets, strength);
        }
        break;
      }
    }
  }
}
