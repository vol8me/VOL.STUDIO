import { SCENARIOS, type ScenarioId } from '../../src/config/scenarios';
import { idleCommand } from '../../src/sim/command';
import { ScenarioRunner } from '../../src/sim/scenarios/ScenarioRunner';
import { Simulation } from '../../src/sim/Simulation';
import { SUSPENSION, TANK, WEAPON } from '../../src/config/tank';
import { World } from '../../src/sim/world/World';

/**
 * Sabit tohumlu bütün senaryoları DOM, CSS ve Phaser olmadan koşar; son
 * araç pozlarının özetini döndürür. Aynı işlev vitest'te (jsdom) ve ayrı bir
 * Node sürecinde çalışır: iki sonuç birebir eşit olmalıdır.
 */
export function scenarioDigest(seed: number, steps = 180): Record<ScenarioId, number[][]> {
  const result = {} as Record<ScenarioId, number[][]>;
  for (const id of Object.keys(SCENARIOS) as ScenarioId[]) {
    const sim = new Simulation({
      world: new World(4096, 4096, 128),
      tank: TANK,
      suspension: SUSPENSION,
      weapon: WEAPON,
    });
    const runner = new ScenarioRunner(sim);
    runner.select(id, seed);
    const input = { ...idleCommand(), moveX: 1, fire: true };
    for (let step = 0; step < steps; step++) {
      sim.step((vehicle) => runner.commandFor(vehicle, input), 1000 / 60);
    }
    result[id] = sim.vehicles.map(({ tank }) => [tank.x, tank.y, tank.hull, tank.turret]);
    runner.destroy();
  }
  return result;
}
