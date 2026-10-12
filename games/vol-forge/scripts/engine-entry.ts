import { buildComb } from '../src/sim/scenario';
import { ForgeSim } from '../src/sim/sim';

/** Aynı senaryoyu koşturup periyodik karmaları verir; her motorda aynı olmalıdır. */
export function run(
  seed: number,
  size: number,
  belts: number,
  units: number,
  ticks: number,
  every: number,
): number[] {
  const sim = ForgeSim.create({ seed, width: size, height: size, sustainUnits: units });
  buildComb(sim, { maxBelts: belts, turrets: 16, fill: 2, smelterEvery: 2 });
  const hashes: number[] = [];
  for (let tick = 1; tick <= ticks; tick++) {
    sim.step();
    if (tick % every === 0) hashes.push(sim.hash());
  }
  return hashes;
}

/** Yalnız adım süresi: motorlar ve cihazlar arası maliyet karşılaştırması. */
export function time(size: number, belts: number, units: number, ticks: number): number {
  const sim = ForgeSim.create({ seed: 7, width: size, height: size, sustainUnits: units });
  buildComb(sim, { maxBelts: belts, turrets: 24, fill: 2, smelterEvery: 3 });
  sim.run(300);
  const started = performance.now();
  sim.run(ticks);
  return (performance.now() - started) / ticks;
}
