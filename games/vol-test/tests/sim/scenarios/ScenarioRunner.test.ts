import { describe, expect, it } from 'vitest';
import { ScenarioRunner } from '@/sim/scenarios/ScenarioRunner';
import { command, simulation, STEP_MS } from '../../support/sim';

describe('ScenarioRunner', () => {
  it('boş dünyayı korur; tekrar açıp kapamak araç, mermi ve indeks büyütmez', () => {
    const sim = simulation();
    const runner = new ScenarioRunner(sim);
    expect(sim.vehicles).toHaveLength(1);
    const player = sim.player;
    for (let turn = 0; turn < 8; turn++) {
      runner.select('sandbox', 42);
      const count = sim.vehicles.length;
      expect(count).toBeGreaterThan(8);
      runner.select('sandbox', 42);
      expect(sim.vehicles).toHaveLength(count);
      sim.step((vehicle) => runner.commandFor(vehicle, command({ fire: true })), STEP_MS);
      runner.select('empty', 42);
      expect(sim.vehicles).toEqual([player]);
      expect(sim.projectiles.count).toBe(0);
    }
    runner.destroy();
    expect(sim.vehicles).toEqual([player]);
  });

  it('aynı tohum ve adım aynı yerleşimi, komutu ve fizik sonucunu üretir', () => {
    const run = (seed: number) => {
      const sim = simulation();
      const runner = new ScenarioRunner(sim);
      runner.select('multitank', seed);
      for (let step = 0; step < 90; step++) {
        sim.step((vehicle) => runner.commandFor(vehicle, command({ moveX: 1 })), STEP_MS);
      }
      return sim.vehicles.map(({ tank }) => [tank.x, tank.y, tank.hull, tank.turret]);
    };
    expect(run(123)).toEqual(run(123));
    expect(run(124)).not.toEqual(run(123));
  });

  it('slalom ve hedefler boşta kalır; yalnız oyuncu komutu oyuncuya gider', () => {
    const sim = simulation();
    const runner = new ScenarioRunner(sim);
    for (const level of ['slalom', 'targets'] as const) {
      runner.select(level, 10);
      const positions = sim.vehicles.slice(1).map(({ tank }) => [tank.x, tank.y]);
      const input = command({ moveX: 1 });
      expect(runner.commandFor(sim.player, input)).toBe(input);
      for (const vehicle of sim.vehicles.slice(1)) {
        expect(runner.commandFor(vehicle, input)).toMatchObject({ moveX: 0, fire: false });
      }
      for (let step = 0; step < 30; step++)
        sim.step((vehicle) => runner.commandFor(vehicle, command()), STEP_MS);
      expect(sim.vehicles.slice(1).map(({ tank }) => [tank.x, tank.y])).toEqual(positions);
    }
  });
});
