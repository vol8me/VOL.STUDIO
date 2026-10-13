import { buildComb } from '../src/sim/scenario';
import { FactorySim } from '../src/sim/sim';

/** Aynı senaryoyu koşturup periyodik karmaları verir; her motorda aynı olmalıdır. */
export function run(
  seed: number,
  size: number,
  belts: number,
  units: number,
  ticks: number,
  every: number,
): number[] {
  const sim = FactorySim.create({ seed, width: size, height: size, sustainUnits: units });
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
  const sim = FactorySim.create({ seed: 7, width: size, height: size, sustainUnits: units });
  buildComb(sim, { maxBelts: belts, turrets: 24, fill: 2, smelterEvery: 3 });
  sim.run(300);
  const started = performance.now();
  sim.run(ticks);
  return (performance.now() - started) / ticks;
}

export interface StepStats {
  readonly p50Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  /** Toplam süre / adım: zamanlayıcı çözünürlüğünden etkilenmeyen ortalama. */
  readonly meanMs: number;
  readonly belts: number;
  readonly units: number;
}

/**
 * Adım başına süre dağılımı. `performance.now()` çözünürlüğü motora göre 0,005–1 ms olduğundan yüzdelikler
 * kaba, `meanMs` kesindir; ikisi birlikte okunur.
 */
export function steps(size: number, belts: number, units: number, ticks: number): StepStats {
  const sim = FactorySim.create({ seed: 7, width: size, height: size, sustainUnits: units });
  const report = buildComb(sim, { maxBelts: belts, turrets: 24, fill: 2, smelterEvery: 3 });
  sim.run(300);
  const samples = new Float64Array(ticks);
  const started = performance.now();
  for (let tick = 0; tick < ticks; tick++) {
    const before = performance.now();
    sim.step();
    samples[tick] = performance.now() - before;
  }
  const total = performance.now() - started;
  samples.sort();
  const at = (fraction: number): number =>
    samples[Math.min(ticks - 1, Math.max(0, Math.ceil(fraction * ticks) - 1))];
  return {
    p50Ms: at(0.5),
    p99Ms: at(0.99),
    maxMs: samples[ticks - 1],
    meanMs: total / ticks,
    belts: report.belts,
    units: sim.state.aliveUnits,
  };
}
