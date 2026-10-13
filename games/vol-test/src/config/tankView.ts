import { TANK } from './tank';
import { STRIKER } from './vehicles';

export const TREAD_VIEW = {
  width: 2 * TANK.halfLength - 2 * (TANK.halfWidth - TANK.trackOffset),
  height: 2 * (TANK.halfWidth - TANK.trackOffset),
  period: 8,
  frames: 32,
  columns: 8,
} as const;

export const TANK_LIGHTS = {
  depth: 11,
  muzzleX: STRIKER.armament.mounts[0].reach,
  flashMs: 70,
  barrel: { kick: -210, stiffness: 420, damping: 22, max: 5 },
} as const;
