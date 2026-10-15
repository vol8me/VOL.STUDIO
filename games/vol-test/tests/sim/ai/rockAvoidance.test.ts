import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import type { OutcropSpec } from '@/config/rocks';
import { ARACHNID, STRIKER, type VehicleSpec } from '@/config/vehicles';
import { BotBrain } from '@/sim/ai/BotBrain';
import { idleCommand } from '@/sim/command';
import { Simulation } from '@/sim/Simulation';
import { World } from '@/sim/world/World';

const STEP = GAME.simulationStepMs;
const SPEC: OutcropSpec = { id: 'wall', x: 0.5, y: 0.5, radius: 320, lobes: 5, seed: 3 };

/** Bot, kayanın ardındaki hareketsiz düşmana yürür; kayaya takılıp kalmamalıdır. */
function stalk(spec: VehicleSpec) {
  const world = new World(12288, 12288, 128, [], [SPEC]);
  const sim = new Simulation({ world, spawnPlayer: false });
  const outcrop = world.rocks.outcrops[0];
  const west = outcrop.x - outcrop.reach - 260;
  const east = outcrop.x + outcrop.reach + 260;
  const bot = sim.spawn(west, outcrop.y, 0, 0, undefined, spec);
  const prey = sim.spawn(east, outcrop.y, Math.PI, 1, undefined, STRIKER);
  bot.vitality.protectionRemainingMs = 0;
  prey.vitality.protectionRemainingMs = 0;
  const brain = new BotBrain(bot, { seed: 11, skill: 1 });
  const out = idleCommand();
  let nearest = Infinity;
  let stuck = 0;
  for (let step = 0; step < 60_000 / STEP; step++) {
    sim.step((vehicle) => (vehicle === bot ? brain.think(sim, STEP, out) : idleCommand()), STEP);
    nearest = Math.min(
      nearest,
      Math.hypot(bot.chassis.x - prey.chassis.x, bot.chassis.y - prey.chassis.y),
    );
    if (!bot.vitality.alive) break;
    stuck = bot.chassis.speed < 3 ? stuck + 1 : 0;
  }
  return { world, bot, prey, nearest, stuck, outcrop };
}

describe('bot ve kaya', () => {
  it('kaya öbeğinin çevresinden dolanır: kayaya gömülmez ve kilitlenip kalmaz', () => {
    const run = stalk(STRIKER);
    // Bot kayaların içinde sonlanmaz.
    expect(run.world.rocks.covers(run.bot.chassis.x, run.bot.chassis.y)).toBe(false);
    // Öbeğin öte yanına geçmiş ve hedefe yetişmiştir (kaya yüzüne yaslanıp kalmamıştır).
    expect(run.bot.chassis.x).toBeGreaterThan(run.outcrop.x);
    expect(run.nearest).toBeLessThan(run.outcrop.reach + 260);
    // Son saniyelerde sürekli durmuyordur.
    expect(run.stuck).toBeLessThan((10_000 / STEP) | 0);
  });

  it('yürüyücü bot kayayı aşar: düz çizgide tırmanır', () => {
    const run = stalk(ARACHNID);
    expect(run.bot.chassis.x).toBeGreaterThan(run.outcrop.x - run.outcrop.reach);
    expect(run.nearest).toBeLessThan(run.outcrop.reach * 2 + 520);
  });
});
