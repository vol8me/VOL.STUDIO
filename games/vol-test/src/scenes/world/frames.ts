import type { HudFrame } from '@/hud/HudFrame';
import { lerpAngle } from '@volstudio/core/math';
import type { Tank } from '@/sim/tank/Tank';
import type { TankFrame } from '@/view/TankView';

/**
 * Görünümün okuyacağı tank karesi: poz, taret ve süspansiyon önceki ve
 * güncel simülasyon adımı arasında `alpha` ile ara değerlenir.
 */
export function tankFrame(tank: Tank, alpha: number): TankFrame {
  const previous = tank.previous;
  const mix = (from: number, to: number): number => from + (to - from) * alpha;
  return {
    x: mix(previous.x, tank.x),
    y: mix(previous.y, tank.y),
    hull: lerpAngle(previous.hull, tank.hull, alpha),
    turret: lerpAngle(previous.turret, tank.turret, alpha),
    pitch: mix(previous.pitch, tank.suspension.pitch),
    roll: mix(previous.roll, tank.suspension.roll),
    treadLeft: tank.treadLeft,
    treadRight: tank.treadRight,
    speed: tank.speed,
    angularVelocity: tank.angularVelocity,
    boosting: tank.boosting,
  };
}

/** HUD karesi: ara değerli poz, sürüş durumu ve kameranın görünen alanı. */
export function hudFrame(
  tank: Tank,
  frame: TankFrame,
  boostCapacity: number,
  view: HudFrame['view'],
): HudFrame {
  return {
    x: frame.x,
    y: frame.y,
    hull: frame.hull,
    speed: tank.speed,
    reversing: tank.reversing,
    boosting: tank.boosting,
    boost: tank.boost,
    boostCapacity,
    view,
  };
}
