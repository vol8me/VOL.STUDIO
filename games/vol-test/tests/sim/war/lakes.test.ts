import { describe, expect, it } from 'vitest';
import { idleCommand } from '@/sim/command';
import { Simulation } from '@/sim/Simulation';
import { War, type WarStepEvent } from '@/sim/war/War';
import { createBattleWorld } from '@/sim/world/battleWorld';

const STEP = 1000 / 60;

describe('savaş dünyasında göller', () => {
  it('bot kadrosu ilk 24 saniyede gölde boğulmaz: kaçınma kıyıda tutar', () => {
    const sim = new Simulation({ world: createBattleWorld(), spawnPlayer: false });
    const war = new War(sim, { populate: true });
    const idle = idleCommand();
    const events: WarStepEvent[] = [];
    let drowned = 0;
    let deepest = 0;
    for (let step = 0; step < (24 * 1000) / STEP; step++) {
      events.length = 0;
      war.step(STEP, () => idle, events);
      for (const event of events) if (event.kind === 'died' && event.cause === 'drown') drowned++;
      for (const vehicle of sim.vehicles)
        if (vehicle.chassis.kind !== 'hover')
          deepest = Math.max(deepest, vehicle.chassis.waterDepth);
    }
    expect(sim.vehicles.length).toBeGreaterThan(8);
    expect(drowned).toBe(0);
    expect(deepest).toBeLessThan(0.45);
  });
});
