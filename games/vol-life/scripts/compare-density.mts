import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { morphologySearchConfig } from '../src/config/morphology';
import { particleConfig } from '../src/config/particles';
import { worldConfig } from '../src/config/world';
import { resolveParticleBounds } from '../src/runtime/sim/WorldBounds';
import { runParticleExperiment } from './morphology/ParticleExperiment.mts';

const COUNTS = [100, 256, 384, 512, 768] as const;
const SEEDS = morphologySearchConfig.seedCorpus;
const CHECKPOINTS = [10, 30, 60, 120, 300, 600] as const;
const collisionBounds = resolveParticleBounds(
  worldConfig.boundsUnits,
  worldConfig.particleCollisionInsetUnits,
);
const startedAt = performance.now();
const regimes = COUNTS.map((count) => {
  const config = { ...particleConfig, count };
  const results = SEEDS.map((seed) =>
    runParticleExperiment({
      seed,
      bounds: worldConfig.boundsUnits,
      collisionBounds,
      fixedStepMs: worldConfig.fixedStepMs,
      particles: config,
      analysis: morphologySearchConfig.analysis,
      wallModel: 'contact-impulse-v2',
      durationSeconds: 600,
      checkpointsSeconds: CHECKPOINTS,
      temporalSampleEverySeconds: 10,
    }),
  );
  return {
    count,
    densityPerMillionSquareUnits: count / (worldConfig.boundsUnits.width * worldConfig.boundsUnits.height) * 1_000_000,
    expectedUniformNeighbors:
      ((count - 1) * Math.PI * particleConfig.interactionRadiusUnits ** 2) /
      (worldConfig.boundsUnits.width * worldConfig.boundsUnits.height),
    results,
  };
});
const identity = JSON.stringify({ worldConfig, particleConfig, counts: COUNTS, seeds: SEEDS });
const artifact = {
  schemaVersion: 1,
  protocolVersion: 'density-regimes-v1',
  sourceRevision: readGit(['rev-parse', 'HEAD']),
  sourceDirty: readGit(['status', '--porcelain', '--untracked-files=no']).length > 0,
  sourceDiffDigest: createHash('sha256')
    .update(readGit(['diff', '--binary', 'HEAD']))
    .digest('hex'),
  baseParticleConfig: particleConfig,
  configDigest: createHash('sha256').update(identity).digest('hex'),
  wallModelVersion: 'contact-impulse-v2',
  forceProfileVersion: 'triangular-pair-v1',
  worldSize: worldConfig.boundsUnits,
  seedCorpus: SEEDS,
  checkpointsSeconds: CHECKPOINTS,
  budget: {
    regimes: COUNTS.length,
    seedsPerRegime: SEEDS.length,
    simulatedTicks: COUNTS.length * SEEDS.length * 600 * 60,
    elapsedMilliseconds: 0,
  },
  regimes,
};
artifact.budget.elapsedMilliseconds = Number((performance.now() - startedAt).toFixed(3));
const output = resolve(import.meta.dirname, '../benchmarks/density-regimes-v1.json');
await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output, budget: artifact.budget }));

function readGit(arguments_: readonly string[]): string {
  return execFileSync('git', arguments_, {
    cwd: resolve(import.meta.dirname, '../../..'),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
}
