import { SUSPENSION, TANK, WEAPON } from '@/config/tank';
import { idleCommand, type TankCommand } from '@/sim/command';
import { Simulation } from '@/sim/Simulation';
import { Tank } from '@/sim/tank/Tank';
import { World } from '@/sim/world/World';

export const STEP_MS = 1000 / 60;
export const DT = STEP_MS / 1000;

export function world(size = 4096): World {
  return new World(size, size, 128);
}

export function tank(at?: { x: number; y: number; hull?: number }): Tank {
  const result = new Tank(TANK, SUSPENSION);
  result.place(at?.x ?? 2048, at?.y ?? 2048, at?.hull ?? 0);
  return result;
}

export function simulation(size = 4096): Simulation {
  return new Simulation({ world: world(size), tank: TANK, suspension: SUSPENSION, weapon: WEAPON });
}

export function command(patch: Partial<TankCommand> = {}): TankCommand {
  return { ...idleCommand(), ...patch };
}

export function drive(
  subject: Tank,
  space: World,
  patch: Partial<TankCommand>,
  seconds: number,
): void {
  const full = command(patch);
  for (let step = 0; step < Math.round(seconds / DT); step++) subject.step(full, space, DT);
}
