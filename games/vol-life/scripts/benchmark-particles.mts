import { performance } from 'node:perf_hooks';
import { particleConfig } from '../src/config/particles';
import {
  accumulateParticleForces,
  initializeParticles,
  integrateParticles,
} from '../src/runtime/sim/ParticlePhysics';
import { ParticleSpatialHash } from '../src/runtime/sim/ParticleSpatialHash';
import { ParticleStore } from '../src/runtime/sim/ParticleStore';
import { createSimRandom } from '../src/runtime/sim/rng';

const options = parseArgs(process.argv.slice(2));
const candidates = [
  { particles: 512, worldSize: 1024 },
  { particles: 2048, worldSize: 2048 },
] as const;
const particleKernel = candidates.map((candidate) => measure(candidate));
const report = { particleKernel };

if (options.json) console.log(JSON.stringify(report));
else {
  for (const entry of particleKernel) {
    console.log(
      `${entry.particles} parçacık | p50 ${entry.msPerTick.toFixed(3)} ms | p95 ${entry.p95MsPerTick.toFixed(3)} ms`,
    );
  }
}

function measure(candidate: { particles: number; worldSize: number }) {
  const config = { ...particleConfig, count: candidate.particles, worldSizeUnits: candidate.worldSize };
  const particles = new ParticleStore(candidate.particles);
  initializeParticles(particles, createSimRandom(0x10fe1), config);
  const grid = new ParticleSpatialHash(
    candidate.worldSize,
    config.cellSizeUnits,
    candidate.particles,
  );
  const step = (): void => {
    grid.rebuild(particles);
    accumulateParticleForces(particles, grid, config);
    integrateParticles(particles, config);
  };
  for (let index = 0; index < 60; index++) step();
  const samples: number[] = [];
  for (let sample = 0; sample < options.samples; sample++) {
    const startedAt = performance.now();
    for (let iteration = 0; iteration < options.iterations; iteration++) step();
    samples.push((performance.now() - startedAt) / options.iterations);
  }
  samples.sort((left, right) => left - right);
  return {
    particles: candidate.particles,
    msPerTick: percentile(samples, 0.5),
    p95MsPerTick: percentile(samples, 0.95),
  };
}

function percentile(values: readonly number[], ratio: number): number {
  return values[Math.ceil(values.length * ratio) - 1];
}

function parseArgs(args: string[]): { iterations: number; samples: number; json: boolean } {
  const valueAfter = (flag: string, fallback: number): number => {
    const index = args.indexOf(flag);
    return index < 0 ? fallback : Number(args[index + 1]);
  };
  return {
    iterations: valueAfter('--iterations', 120),
    samples: valueAfter('--samples', 5),
    json: args.includes('--json'),
  };
}
