import { vibrate } from '@volstudio/core';
import { FEEL } from '@/config/feel';
import type { FollowCamera } from '@volstudio/core/camera';
import type { VehicleSpec } from '@/config/vehicles';
import type { SimEvent } from '@/sim/events';
import type { ArenaView } from '@/view/ArenaView';
import type { DamageKind } from '@/view/effects/DamageNumbers';
import type { EffectsView } from '@/view/EffectsView';
import type { VehicleView } from '@/view/VehicleView';

export interface SimEventTargets {
  /** Kontrol edilen aracın kimliği: kamera ve titreşim yalnız ona tepki verir. */
  readonly player: number;
  readonly tank: (id: number) => Pick<VehicleView, 'fire' | 'impact'> | undefined;
  /** Hedefin tanımı: isabette gövdeden kopan kıymığın dokusu buradan seçilir. */
  readonly spec: (id: number) => VehicleSpec | undefined;
  readonly effects: Pick<EffectsView, 'muzzle' | 'explode' | 'hit' | 'chip' | 'wallHit' | 'damage'>;
  /** Aracın şu anki konumu: isabet olayı yoksa hasar sayısı buraya konur. */
  readonly position: (id: number) => { readonly x: number; readonly y: number } | undefined;
  readonly arena: Pick<ArenaView, 'strike'>;
  readonly camera: Pick<FollowCamera, 'kick' | 'addTrauma'>;
  /** Oyuncunun konumu: patlama sarsıntısı ve titreşimi uzaklıkla söner. */
  readonly listener: { readonly x: number; readonly y: number };
}

/** Çarpma şiddeti [0, 1]: bu hızda tam şiddet. */
function strengthOf(speed: number): number {
  return Math.min(1, speed / FEEL.wall.fullSpeed);
}

/** Uzaklığa göre sönüm [0, 1]: yarıçapta 0, merkezde 1; kareli, yakında keskin. */
export function falloff(dx: number, dy: number, radius: number): number {
  const near = Math.max(0, 1 - Math.hypot(dx, dy) / radius);
  return near * near;
}

/** Patlamanın oyuncuya yansıması: uzaklıkla sönen sarsıntı ve yakında titreşim. */
export function feelBlast(
  targets: Pick<SimEventTargets, 'camera' | 'listener'>,
  x: number,
  y: number,
): void {
  const blast = FEEL.blast;
  const dx = x - targets.listener.x;
  const dy = y - targets.listener.y;
  const shake = falloff(dx, dy, blast.radius);
  if (shake > 0) targets.camera.addTrauma(blast.trauma * shake);
  const rumble = falloff(dx, dy, blast.hapticRadius);
  if (rumble > 0) vibrate('tap', blast.haptic * rumble);
}

/** Oyuncuyu ilgilendiren çarpmanın kamera ve titreşim tepkisi. */
function feelImpact(targets: SimEventTargets, strength: number): void {
  const wall = FEEL.wall;
  targets.camera.addTrauma(wall.traumaBase + strength * wall.traumaScale);
  vibrate(strength >= wall.heavyHaptic ? 'warning' : 'tap', strength);
}

/** İsabet alan aracın gövdesinden ara sıra bir kıymık koparır (şans efektte karma ile belirlenir). */
function chipTarget(targets: SimEventTargets, event: Extract<SimEvent, { kind: 'hit' }>): void {
  const spec = targets.spec(event.target);
  if (spec) targets.effects.chip(spec, event.target, event.x, event.y, event.angle);
}

/**
 * Hasar sayısının yeri: aynı paketteki isabetin noktası (mermi gövdeye değdiği yer), yoksa aracın
 * konumu. Boğulma gibi kaynaksız hasar sayı üretmez; çünkü canı sürekli eritir ve ekranı doldurur.
 */
function damageNumber(
  events: readonly SimEvent[],
  event: Extract<SimEvent, { kind: 'damaged' }>,
  targets: SimEventTargets,
): void {
  if (event.cause === 'drown') return;
  let at: { readonly x: number; readonly y: number } | undefined;
  for (const other of events) {
    if (other.kind === 'hit' && other.target === event.target) at = other;
  }
  at ??= targets.position(event.target);
  if (!at) return;
  let kind: DamageKind = 'other';
  if (event.source === targets.player) kind = 'dealt';
  else if (event.target === targets.player) kind = 'taken';
  targets.effects.damage(at.x, at.y, event.amount, kind);
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
        targets.tank(event.source)?.fire(event.mount);
        targets.effects.muzzle(event.x, event.y, event.angle);
        if (event.source === targets.player) {
          targets.camera.kick(event.angle, FEEL.fire.cameraKick);
          vibrate('tap', FEEL.fire.haptic);
        }
        break;
      case 'impact':
        targets.effects.explode(event.x, event.y, event.angle, event.surface);
        feelBlast(targets, event.x, event.y);
        break;
      case 'hit':
        targets.effects.hit(event.x, event.y, event.angle);
        chipTarget(targets, event);
        if (event.target === targets.player) {
          targets.camera.addTrauma(FEEL.hit.trauma);
          vibrate('warning', 1);
        }
        break;
      case 'damaged':
        damageNumber(events, event, targets);
        break;
      case 'wallHit': {
        const strength = strengthOf(event.speed);
        targets.arena.strike(event.x, event.y, event.normalX, event.speed);
        targets.effects.wallHit(event.x, event.y, event.normalX, event.normalY, strength);
        targets.tank(event.source)?.impact?.(strength);
        if (event.source === targets.player) feelImpact(targets, strength);
        break;
      }
      case 'collision': {
        const strength = strengthOf(event.speed);
        targets.effects.wallHit(event.x, event.y, event.normalX, event.normalY, strength);
        targets.tank(event.a)?.impact?.(strength);
        targets.tank(event.b)?.impact?.(strength);
        if (event.a === targets.player || event.b === targets.player) {
          feelImpact(targets, strength);
        }
        break;
      }
    }
  }
}
