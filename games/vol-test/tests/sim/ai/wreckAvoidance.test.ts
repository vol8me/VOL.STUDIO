import { describe, expect, it } from 'vitest';
import { COMBAT } from '@/config/combat';
import { GAME } from '@/config/game';
import { ARACHNID, RHINO, STRIKER, type VehicleSpec } from '@/config/vehicles';
import { BotBrain } from '@/sim/ai/BotBrain';
import { idleCommand } from '@/sim/command';
import type { SimEvent } from '@/sim/events';
import { Simulation } from '@/sim/Simulation';
import { World } from '@/sim/world/World';

const STEP = GAME.simulationStepMs;

/**
 * Bot, ortadaki enkazın ardındaki göreve yürür. Enkaz katıdır (`collideWreck`), bu yüzden
 * bot ona sürtünüp kalmak yerine dolanmalı: az temas eder, öte yana geçer ve göreve varır.
 */
function stalk(spec: VehicleSpec) {
  const world = new World(8192, 8192, 128);
  // Enkaz sınama boyunca yerinde kalsın diye yeniden doğma çok uzağa alınır.
  const sim = new Simulation({
    world,
    spawnPlayer: false,
    combat: { ...COMBAT, respawnDelayMs: 1e9 },
  });
  const y = world.height / 2;
  const bot = sim.spawn(3000, y, 0, 0, undefined, spec);
  const wreck = sim.spawn(3700, y, 0, 1, undefined, STRIKER);
  for (const vehicle of [bot, wreck]) vehicle.vitality.protectionRemainingMs = 0;
  sim.applyDamage(wreck.id, wreck.vitality.maxHealth);
  const placed = { x: wreck.chassis.x, y: wreck.chassis.y };
  const goal = { x: 4500, y, radius: 120 };
  const brain = new BotBrain(bot, { seed: 11, skill: 1 });
  brain.objective = goal;
  const out = idleCommand();
  const events: SimEvent[] = [];
  let contacts = 0;
  let nearest = Infinity;
  for (let step = 0; step < 40_000 / STEP; step++) {
    sim.step((vehicle) => (vehicle === bot ? brain.think(sim, STEP, out) : idleCommand()), STEP);
    events.length = 0;
    sim.drainEvents(events);
    for (const event of events)
      if (event.kind === 'collision' && (event.a === wreck.id || event.b === wreck.id)) contacts++;
    nearest = Math.min(nearest, Math.hypot(bot.chassis.x - goal.x, bot.chassis.y - goal.y));
  }
  return { bot, wreck, placed, contacts, nearest };
}

describe('bot ve enkaz', () => {
  it.each([
    ['tank', STRIKER],
    ['yürüyücü', ARACHNID],
    ['sıçrayıcı', RHINO],
  ])('%s enkazı dolanır: sürtünüp kilitlenmez, öte yana geçer ve göreve varır', (_name, spec) => {
    const run = stalk(spec);
    // Enkaz yerinden oynamaz (katıdır) ve botun gövdesi ona gömülmez.
    expect(
      Math.hypot(run.wreck.chassis.x - run.placed.x, run.wreck.chassis.y - run.placed.y),
    ).toBeLessThan(2);
    // Önünden geçip görevin yanına varmıştır.
    expect(run.bot.chassis.x).toBeGreaterThan(run.placed.x);
    expect(run.nearest).toBeLessThan(400);
    // Enkaza hiç çarpmadan dolanır (engel görülmeseydi düz yürüyüp en az bir kez çarpardı).
    expect(run.contacts).toBe(0);
  });
});
