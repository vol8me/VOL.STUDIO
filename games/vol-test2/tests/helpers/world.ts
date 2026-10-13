import { BELT, KIND, PLAYER } from '../../src/config/factory';
import { COMMAND, type FactoryCommand } from '../../src/sim/commands';
import { FactorySim } from '../../src/sim/sim';
import { PLAYER_STATUS, type FactoryState } from '../../src/sim/state';

export const SMALL = { width: 64, height: 64 } as const;

export function smallSim(extra: { seed?: number; sustainUnits?: number } = {}): FactorySim {
  return FactorySim.create({ ...SMALL, ...extra });
}

/** Yapı testleri tankı hedefin bu kadar yakınına getirir (inşa menzilinin içinde kalır). */
const STAGE_REACH = 8;

/**
 * Anahtarın tankını (yoksa doğurup) `x, y` tile'ının inşa menzilinde canlı bırakır. Yalnız test içindir:
 * konum doğrudan yazılır, çünkü yapı kuralı testi tankı sürmek değildir.
 */
export function stage(sim: FactorySim, key: string, x: number, y: number): number {
  const s = sim.state;
  const tanks = s.players;
  if (tanks.slotOf(key) < 0) sim.applyRaw({ type: COMMAND.join, key }, -1);
  const slot = tanks.slotOf(key);
  const cx = Math.min(s.width - 1, Math.max(1, x + 0.5));
  const cy = Math.min(s.height - 1, Math.max(1, y + 0.5));
  const near = Math.hypot(cx - tanks.x[slot], cy - tanks.y[slot]) <= STAGE_REACH;
  if (tanks.status[slot] !== PLAYER_STATUS.alive || !near) {
    tanks.status[slot] = PLAYER_STATUS.alive;
    tanks.hp[slot] = PLAYER.hp;
    tanks.x[slot] = Math.min(s.width - 1, cx + 3);
    tanks.y[slot] = Math.min(s.height - 1, cy + 3);
  }
  return slot;
}

let seq = 1;

/** Komutu anahtarın tankı adına, hedefin yakınında uygular. */
export function run(sim: FactorySim, command: FactoryCommand, key = 'test-player'): number {
  if (
    command.type !== COMMAND.move &&
    command.type !== COMMAND.join &&
    command.type !== COMMAND.leave
  )
    stage(sim, key, command.x, command.y);
  return sim.apply(key, seq++, command).result;
}

export function place(
  sim: FactorySim,
  x: number,
  y: number,
  kind: number,
  rot = 0,
  key = 'test-player',
): number {
  return run(sim, { type: COMMAND.place, x, y, kind, rot }, key);
}

/** Her bant karesinde eşyalar azalan konumda ve en az aralıkta durmalıdır. */
export function beltViolations(s: FactoryState): string[] {
  const problems: string[] = [];
  for (let tile = 0; tile < s.count; tile++) {
    const count = s.beltCount[tile];
    if (count > BELT.slots) problems.push(`tile ${tile}: ${count} eşya`);
    if (count > 0 && s.kind[tile] !== KIND.conveyor) problems.push(`tile ${tile}: bant dışı eşya`);
    for (let slot = 1; slot < count; slot++) {
      const gap = s.beltPos[tile * BELT.slots + slot - 1] - s.beltPos[tile * BELT.slots + slot];
      if (gap < BELT.spacing) problems.push(`tile ${tile}: aralık ${gap}`);
    }
  }
  return problems;
}
