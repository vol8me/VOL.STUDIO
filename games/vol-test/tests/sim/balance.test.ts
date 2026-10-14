import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { VEHICLE_IDS, VEHICLES, type VehicleId } from '@/config/vehicles';
import { BotBrain } from '@/sim/ai/BotBrain';
import { idleCommand } from '@/sim/command';
import { Simulation } from '@/sim/Simulation';
import { World } from '@/sim/world/World';

const STEP = GAME.simulationStepMs;
const SECONDS = 75;
/** Her çift, iki yönde de bu kadar tohumla dövüşür: sonuç tohumlara bağlı ama belirlenimlidir. */
const TRIALS = 4;
/** Tek bir aracın katalogun geri kalanına karşı toplam galibiyet payı bu aralıkta kalmalıdır. */
const FAIR = { min: 0.3, max: 0.7 };

/** İki botun açık alanda tek ölümlük düellosu: 1 = `a` kazandı, 0 = `b`, 0,5 = süre doldu. */
function duel(a: VehicleId, b: VehicleId, seed: number): number {
  const sim = new Simulation({ world: new World(4096, 4096, 128), spawnPlayer: false });
  const bots = [a, b].map((id, index) => {
    const vehicle = sim.spawn(
      index === 0 ? 1500 : 2600,
      2048 + (seed % 3) * 40,
      index === 0 ? 0 : Math.PI,
      index,
      undefined,
      VEHICLES[id],
    );
    const brain = new BotBrain(vehicle, { seed: seed * 2 + index + 1, skill: 0.75 });
    brain.objective = { x: 2048, y: 2048, radius: 250 };
    brain.retreatPoint = { x: index === 0 ? 300 : 3800, y: 2048 };
    return brain;
  });
  const command = idleCommand();
  const events: ReturnType<Simulation['drainEvents']> = [];
  for (let step = 0; step < (SECONDS * 1000) / STEP; step++) {
    sim.step((vehicle) => {
      const bot = bots.find((candidate) => candidate.vehicle === vehicle);
      return bot ? bot.think(sim, STEP, command) : idleCommand();
    }, STEP);
    events.length = 0;
    for (const event of sim.drainEvents(events))
      if (event.kind === 'died') return event.target === bots[0].vehicle.id ? 0 : 1;
  }
  return 0.5;
}

describe('araç dengesi (bot düellosu)', () => {
  it('hiçbir araç kataloğa hükmetmez ya da ezilmez: toplam galibiyet payı adil bantta kalır', () => {
    const share = new Map<VehicleId, number>();
    for (const a of VEHICLE_IDS) {
      let score = 0;
      let games = 0;
      for (const b of VEHICLE_IDS) {
        if (a === b) continue;
        for (let seed = 1; seed <= TRIALS; seed++) {
          score += duel(a, b, seed) + (1 - duel(b, a, seed));
          games += 2;
        }
      }
      share.set(a, score / games);
    }
    for (const [id, value] of share) {
      expect(value, `${id} galibiyet payı ${value.toFixed(2)}`).toBeGreaterThan(FAIR.min);
      expect(value, `${id} galibiyet payı ${value.toFixed(2)}`).toBeLessThan(FAIR.max);
    }
  });

  it('düello belirlenimlidir: aynı çift ve tohum aynı sonucu verir', () => {
    expect(duel('striker', 'goliath', 2)).toBe(duel('striker', 'goliath', 2));
    expect(duel('widow', 'arachnid', 3)).toBe(duel('widow', 'arachnid', 3));
  });
});
