import { BELT, KIND } from '../../src/config/forge';
import { COMMAND, type ForgeCommand } from '../../src/sim/commands';
import { ForgeSim } from '../../src/sim/sim';
import type { ForgeState } from '../../src/sim/state';

export const SMALL = { width: 64, height: 64 } as const;

export function smallSim(extra: { seed?: number; sustainUnits?: number } = {}): ForgeSim {
  return ForgeSim.create({ ...SMALL, ...extra });
}

let seq = 1;
export function place(
  sim: ForgeSim,
  x: number,
  y: number,
  kind: number,
  rot = 0,
  key = 'test',
): number {
  const command: ForgeCommand = { type: COMMAND.place, x, y, kind, rot };
  return sim.apply(key, seq++, command).result;
}

/** Her bant karesinde eşyalar azalan konumda ve en az aralıkta durmalıdır. */
export function beltViolations(s: ForgeState): string[] {
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
