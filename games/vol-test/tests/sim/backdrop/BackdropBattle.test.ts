import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { WEATHER } from '@/config/weather';
import type { SimEvent } from '@/sim/events';
import { BackdropBattle } from '@/sim/backdrop/BackdropBattle';
import { WeatherSystem } from '@/sim/weather/WeatherSystem';
import { createBattleWorld } from '@/sim/world/battleWorld';

function battle(perFaction = 3, seed = 11): BackdropBattle {
  const world = createBattleWorld();
  const weather = new WeatherSystem(world.width, world.height, { seed: WEATHER.seed });
  return new BackdropBattle({ world, weather, seed, perFaction });
}

describe('BackdropBattle', () => {
  it('insansız savaşı bot kadrosuyla kurar ve her cepheyi hedefe tamamlar', () => {
    const instance = battle(3);
    instance.advance(GAME.simulationStepMs * 2);
    expect(instance.vehicles).toHaveLength(6);
    expect(instance.vehicles.every((vehicle) => vehicle.team !== null)).toBe(true);
    expect(instance.war.humans(0) + instance.war.humans(1)).toBe(0);
  });

  it('aynı tohum aynı savaşı üretir', () => {
    const run = (): string => {
      const instance = battle(3, 5);
      instance.fastForward(20_000);
      return instance.vehicles
        .map((vehicle) => `${vehicle.spec.id}:${vehicle.chassis.x.toFixed(2)}`)
        .join('|');
    };
    expect(run()).toBe(run());
  });

  it('ileri sarım olay biriktirmez; advance fizik olaylarını drainEvents ile verir', () => {
    const instance = battle(5, 5);
    instance.fastForward(40_000);
    expect(instance.drainEvents([])).toEqual([]);
    const events: SimEvent[] = [];
    for (let frame = 0; frame < 60 * 120 && events.length === 0; frame++) {
      instance.advance(GAME.simulationStepMs);
      instance.drainEvents(events);
    }
    expect(events.length).toBeGreaterThan(0);
    // Savaş olayları (bölge, zafer) görünüme gitmez.
    expect(events.map((event) => event.kind as string)).not.toContain('zone');
    expect(instance.drainEvents([])).toEqual([]);
  });
});
