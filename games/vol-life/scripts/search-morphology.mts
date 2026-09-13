import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { morphologySearchConfig } from '../src/config/morphology';
import { PARTICLE_TYPE_COUNT, particleConfig, type ParticleConfig } from '../src/config/particles';
import { worldConfig } from '../src/config/world';
import {
  analyzeMorphologyFrame,
  compareClusterMembership,
  detectParticleClusters,
  type ParticleCluster,
  type MorphologyFrameMetrics,
} from '../src/runtime/sim/MorphologyMetrics';
import {
  accumulateParticleForces,
  initializeParticles,
  integrateParticles,
} from '../src/runtime/sim/ParticlePhysics';
import { ParticleSpatialHash } from '../src/runtime/sim/ParticleSpatialHash';
import { ParticleStore } from '../src/runtime/sim/ParticleStore';
import { createSimRandom } from '../src/runtime/sim/rng';
import { resolveParticleBounds } from '../src/runtime/sim/WorldBounds';

interface Candidate {
  readonly id: string;
  readonly matrix: Float32Array;
  readonly roleRadii?: Float32Array;
  readonly parameters?: Partial<
    Pick<
      ParticleConfig,
      | 'count'
      | 'cellSizeUnits'
      | 'repulsionRadiusUnits'
      | 'interactionRadiusUnits'
      | 'repulsionStrength'
      | 'interactionStrength'
      | 'frictionPerReferenceTick'
    >
  >;
}

interface Evaluation {
  readonly id: string;
  readonly clusteredFraction: number;
  readonly structurePresence: number;
  readonly meanLayering: number;
  readonly movingFraction: number;
  readonly staticFraction: number;
  readonly fragmentation: number;
  readonly collapse: number;
  readonly orbitDominance: number;
  readonly orbitActivity: number;
  readonly isolatedFraction: number;
  readonly stalledIsolatedFraction: number;
  readonly wallContactFraction: number;
  readonly wallSupportedStructureFraction: number;
  readonly meanCompactness: number;
  readonly meanShapeAnisotropy: number;
  readonly membershipStability: number;
  readonly recovery: number;
  readonly recoveryMembership: number;
  readonly recoveryCompactness: number;
  readonly recoveryLayering: number;
  readonly qualified: boolean;
  readonly pareto: boolean;
  readonly perSeed: readonly SeedEvaluation[];
}

interface SeedEvaluation extends Omit<Evaluation, 'id' | 'qualified' | 'pareto' | 'perSeed'> {
  readonly seed: number;
}

interface MorphologySample {
  readonly metrics: MorphologyFrameMetrics;
  readonly structures: readonly ParticleCluster[];
}

interface RunOptions {
  readonly ticks: number;
  readonly warmupTicks: number;
  readonly sampleEveryTicks: number;
  readonly perturbAtTick?: number;
  readonly recoveryStartTick?: number;
}

const candidates = buildCandidates();
const broad = candidates.map((candidate) =>
  evaluate(
    candidate,
    morphologySearchConfig.seedCorpus.slice(0, morphologySearchConfig.broad.seeds),
    morphologySearchConfig.broad,
  ),
);
markPareto(broad);
const finalistIds = [...broad]
  .sort((left, right) => rank(right) - rank(left))
  .slice(0, morphologySearchConfig.broad.finalists)
  .map((result) => result.id);
const finalists = candidates
  .filter((candidate) => finalistIds.includes(candidate.id))
  .map((candidate) =>
    evaluate(candidate, morphologySearchConfig.seedCorpus, morphologySearchConfig.finalist),
  );
markPareto(finalists);
const globalCandidates = finalists.some((result) => result.qualified)
  ? []
  : buildGlobalCandidates(
      candidates.filter((candidate) => finalistIds.slice(0, 2).includes(candidate.id)),
    );
const globalBroad = globalCandidates.map((candidate) =>
  evaluate(
    candidate,
    morphologySearchConfig.seedCorpus.slice(0, morphologySearchConfig.broad.seeds),
    morphologySearchConfig.broad,
  ),
);
markPareto(globalBroad);
const globalFinalistIds = [...globalBroad]
  .sort((left, right) => rank(right) - rank(left))
  .slice(0, morphologySearchConfig.broad.finalists)
  .map((result) => result.id);
const globalFinalists = globalCandidates
  .filter((candidate) => globalFinalistIds.includes(candidate.id))
  .map((candidate) =>
    evaluate(candidate, morphologySearchConfig.seedCorpus, morphologySearchConfig.finalist),
  );
markPareto(globalFinalists);

const allCandidates = [...candidates, ...globalCandidates];
const sourceRevision = readGit(['rev-parse', 'HEAD']);
const sourceDirty = readGit(['status', '--porcelain', '--untracked-files=no']).length > 0;
const artifact = {
  schemaVersion: 2,
  searchVersion: morphologySearchConfig.version,
  sourceRevision,
  sourceDirty,
  configDigest: createHash('sha256')
    .update(
      JSON.stringify({
        worldConfig,
        particleConfig: serializeConfig(particleConfig),
        morphologySearchConfig,
        candidates: allCandidates.map((candidate) =>
          serializeConfig(resolveCandidateConfig(candidate)),
        ),
      }),
    )
    .digest('hex'),
  corpus: morphologySearchConfig.seedCorpus,
  analysis: morphologySearchConfig.analysis,
  thresholds: morphologySearchConfig.thresholds,
  candidates: allCandidates.map((candidate) => ({
    id: candidate.id,
    config: serializeConfig(resolveCandidateConfig(candidate)),
  })),
  phases: {
    broad: broad.map(roundEvaluation),
    finalists: finalists.map(roundEvaluation),
    globalBroad: globalBroad.map(roundEvaluation),
    globalFinalists: globalFinalists.map(roundEvaluation),
  },
  qualified: [...finalists, ...globalFinalists]
    .filter((result) => result.qualified)
    .map((result) => result.id),
  pareto: [...finalists, ...globalFinalists]
    .filter((result) => result.pareto)
    .map((result) => result.id),
};
const outputArgument = process.argv.find((argument) => argument.startsWith('--output='));
const outputPath = outputArgument
  ? resolve(outputArgument.slice('--output='.length))
  : resolve(import.meta.dirname, '../benchmarks/morphology-search-v2.json');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(
  JSON.stringify({
    outputPath,
    sourceRevision,
    sourceDirty,
    candidates: allCandidates.length,
    qualified: artifact.qualified,
    pareto: artifact.pareto,
  }),
);

function buildCandidates(): Candidate[] {
  const profiles = [
    [0.48, 0.72, -0.18, 0.12],
    [0.42, 0.8, -0.28, 0.16],
    [0.56, 0.68, -0.22, 0.2],
    [0.38, 0.88, -0.34, 0.12],
    [0.5, 0.76, -0.12, 0.24],
    [0.44, 0.64, -0.3, 0.28],
  ] as const;
  const candidates: Candidate[] = [];
  for (const [profileIndex, [sameRole, inward, outward, cycle]] of profiles.entries()) {
    for (const sign of [-1, 1] as const) {
      candidates.push({
        id: `layer-${profileIndex + 1}-${sign > 0 ? 'cw' : 'ccw'}`,
        matrix: buildLayerMatrix(sameRole, inward, outward, cycle * sign, profileIndex),
      });
    }
  }
  return candidates;
}

function buildLayerMatrix(
  sameRole: number,
  inward: number,
  outward: number,
  cycle: number,
  seed: number,
): Float32Array {
  const matrix = new Float32Array(PARTICLE_TYPE_COUNT ** 2);
  const random = createSimRandom(0x6d2b79f5 ^ seed);
  for (let own = 0; own < PARTICLE_TYPE_COUNT; own++) {
    for (let other = 0; other < PARTICLE_TYPE_COUNT; other++) {
      const ownRole = Math.floor(own / 2);
      const otherRole = Math.floor(other / 2);
      let value: number;
      if (ownRole === otherRole) value = sameRole - (own === other ? 0.04 : 0);
      else if (ownRole > otherRole) value = inward - (ownRole - otherRole - 1) * 0.18;
      else value = outward - (otherRole - ownRole - 1) * 0.08;
      const chaseTarget = (own + 1) % PARTICLE_TYPE_COUNT;
      const chaseSource = (own + PARTICLE_TYPE_COUNT - 1) % PARTICLE_TYPE_COUNT;
      if (other === chaseTarget) value += cycle;
      if (other === chaseSource) value -= cycle * 0.7;
      value += random.bipolar() * 0.035;
      matrix[own * PARTICLE_TYPE_COUNT + other] = Math.max(-1, Math.min(1, value));
    }
  }
  return matrix;
}

function buildGlobalCandidates(matrixCandidates: readonly Candidate[]): Candidate[] {
  const profiles: readonly NonNullable<Candidate['parameters']>[] = [
    {
      count: 384,
      cellSizeUnits: 128,
      repulsionRadiusUnits: 10,
      interactionRadiusUnits: 96,
      interactionStrength: 0.07,
      frictionPerReferenceTick: 0.9,
    },
    {
      count: 512,
      cellSizeUnits: 128,
      repulsionRadiusUnits: 24,
      interactionRadiusUnits: 128,
      repulsionStrength: 0.24,
      frictionPerReferenceTick: 0.93,
    },
    {
      count: 768,
      cellSizeUnits: 128,
      repulsionRadiusUnits: 12,
      interactionRadiusUnits: 112,
      interactionStrength: 0.035,
      frictionPerReferenceTick: 0.96,
    },
    {
      count: 512,
      cellSizeUnits: 256,
      repulsionRadiusUnits: 20,
      interactionRadiusUnits: 176,
      repulsionStrength: 0.2,
      interactionStrength: 0.025,
      frictionPerReferenceTick: 0.97,
    },
  ];
  const roleRadiusProfiles = [
    [64, 80, 96, 80, 64, 80, 96, 80, 64],
    [72, 104, 128, 96, 72, 104, 128, 96, 72],
    [72, 96, 112, 88, 72, 96, 112, 88, 72],
    [96, 144, 176, 128, 96, 144, 176, 128, 96],
  ] as const;
  return matrixCandidates.flatMap((candidate) =>
    profiles.map((parameters, index) => ({
      id: `${candidate.id}-global-${index + 1}`,
      matrix: candidate.matrix,
      roleRadii: new Float32Array(roleRadiusProfiles[index]),
      parameters,
    })),
  );
}

function evaluate(candidate: Candidate, seeds: readonly number[], options: RunOptions): Evaluation {
  const results = seeds.map((seed) => runSeed(candidate, seed, options));
  const evaluation: Evaluation = {
    id: candidate.id,
    clusteredFraction: mean(results.map((result) => result.clusteredFraction)),
    structurePresence: mean(results.map((result) => result.structurePresence)),
    meanLayering: mean(results.map((result) => result.meanLayering)),
    movingFraction: mean(results.map((result) => result.movingFraction)),
    staticFraction: mean(results.map((result) => result.staticFraction)),
    fragmentation: mean(results.map((result) => result.fragmentation)),
    collapse: mean(results.map((result) => result.collapse)),
    orbitDominance: mean(results.map((result) => result.orbitDominance)),
    orbitActivity: mean(results.map((result) => result.orbitActivity)),
    isolatedFraction: mean(results.map((result) => result.isolatedFraction)),
    stalledIsolatedFraction: mean(results.map((result) => result.stalledIsolatedFraction)),
    wallContactFraction: mean(results.map((result) => result.wallContactFraction)),
    wallSupportedStructureFraction: mean(
      results.map((result) => result.wallSupportedStructureFraction),
    ),
    meanCompactness: mean(results.map((result) => result.meanCompactness)),
    meanShapeAnisotropy: mean(results.map((result) => result.meanShapeAnisotropy)),
    membershipStability: mean(results.map((result) => result.membershipStability)),
    recovery: mean(results.map((result) => result.recovery)),
    recoveryMembership: mean(results.map((result) => result.recoveryMembership)),
    recoveryCompactness: mean(results.map((result) => result.recoveryCompactness)),
    recoveryLayering: mean(results.map((result) => result.recoveryLayering)),
    qualified: false,
    pareto: false,
    perSeed: results,
  };
  return { ...evaluation, qualified: qualifies(evaluation) };
}

function runSeed(candidate: Candidate, seed: number, options: RunOptions): SeedEvaluation {
  const config = resolveCandidateConfig(candidate);
  const particles = new ParticleStore(config.count);
  const random = createSimRandom(seed);
  const particleBounds = resolveParticleBounds(
    worldConfig.boundsUnits,
    worldConfig.boundaryThicknessUnits,
  );
  initializeParticles(particles, random, config, particleBounds);
  const grid = new ParticleSpatialHash(
    worldConfig.boundsUnits,
    config.cellSizeUnits,
    particles.count,
  );
  const samples: MorphologySample[] = [];
  const recoverySamples: MorphologySample[] = [];
  let baselineSamples: readonly MorphologySample[] = [];
  let baselineStructures: readonly ParticleCluster[] = [];
  for (let tick = 1; tick <= options.ticks; tick++) {
    grid.rebuild(particles);
    accumulateParticleForces(particles, grid, config);
    integrateParticles(particles, config, particleBounds, worldConfig.fixedStepMs);
    if (tick === options.perturbAtTick) {
      baselineSamples = samples.slice(-4);
      baselineStructures = samples.at(-1)?.structures ?? [];
      perturb(particles, random, config.maxSpeedUnitsPerReferenceTick);
    }
    if (tick >= options.warmupTicks && tick % options.sampleEveryTicks === 0) {
      const metrics = analyzeMorphologyFrame(
        particles,
        worldConfig.boundsUnits,
        config,
        morphologySearchConfig.analysis,
        particleBounds,
      );
      const structures = detectParticleClusters(
        particles,
        worldConfig.boundsUnits,
        config.cellSizeUnits,
        morphologySearchConfig.analysis.clusterRadiusUnits,
        morphologySearchConfig.analysis.roleByType,
      ).filter(
        (cluster) => cluster.members.length >= morphologySearchConfig.analysis.minimumClusterSize,
      );
      const sample = { metrics, structures };
      samples.push(sample);
      if (options.recoveryStartTick && tick >= options.recoveryStartTick) {
        recoverySamples.push(sample);
      }
    }
  }
  const metrics = samples.map((sample) => sample.metrics);
  const recoveryMetrics = recoverySamples.map((sample) => sample.metrics);
  const baselineMetrics = baselineSamples.map((sample) => sample.metrics);
  const recoveryMembership = mean(
    recoverySamples.map((sample) =>
      compareClusterMembership(baselineStructures, sample.structures),
    ),
  );
  const recoveryClustered = recoveryRatio(
    recoveryMetrics.map((sample) => sample.clusteredFraction),
    baselineMetrics.map((sample) => sample.clusteredFraction),
  );
  const recoveryCompactness = recoveryRatio(
    recoveryMetrics.map((sample) => sample.meanCompactness),
    baselineMetrics.map((sample) => sample.meanCompactness),
  );
  const recoveryLayering = recoveryRatio(
    recoveryMetrics.map((sample) => sample.meanLayering),
    baselineMetrics.map((sample) => sample.meanLayering),
  );
  return {
    seed,
    clusteredFraction: mean(metrics.map((sample) => sample.clusteredFraction)),
    structurePresence:
      metrics.filter(
        (sample) =>
          sample.clusteredFraction >= 0.3 &&
          sample.meanLayering >= 0.1 &&
          sample.meanCompactness >= 0.12,
      ).length / Math.max(1, samples.length),
    meanLayering: mean(metrics.map((sample) => sample.meanLayering)),
    movingFraction: mean(metrics.map((sample) => sample.movingFraction)),
    staticFraction: mean(metrics.map((sample) => sample.staticFraction)),
    fragmentation: mean(metrics.map((sample) => sample.fragmentation)),
    collapse: mean(metrics.map((sample) => sample.collapse)),
    orbitDominance: mean(metrics.map((sample) => sample.orbitDominance)),
    orbitActivity: mean(metrics.map((sample) => sample.orbitActivity)),
    isolatedFraction: mean(metrics.map((sample) => sample.isolatedFraction)),
    stalledIsolatedFraction: mean(metrics.map((sample) => sample.stalledIsolatedFraction)),
    wallContactFraction: mean(metrics.map((sample) => sample.wallContactFraction)),
    wallSupportedStructureFraction: mean(
      metrics.map((sample) => sample.wallSupportedStructureFraction),
    ),
    meanCompactness: mean(metrics.map((sample) => sample.meanCompactness)),
    meanShapeAnisotropy: mean(metrics.map((sample) => sample.meanShapeAnisotropy)),
    membershipStability: mean(
      samples
        .slice(1)
        .map((sample, index) =>
          compareClusterMembership(samples[index].structures, sample.structures),
        ),
    ),
    recovery:
      options.perturbAtTick === undefined
        ? 1
        : mean([recoveryClustered, recoveryMembership, recoveryCompactness, recoveryLayering]),
    recoveryMembership: options.perturbAtTick === undefined ? 1 : recoveryMembership,
    recoveryCompactness: options.perturbAtTick === undefined ? 1 : recoveryCompactness,
    recoveryLayering: options.perturbAtTick === undefined ? 1 : recoveryLayering,
  };
}

function perturb(
  particles: ParticleStore,
  random: ReturnType<typeof createSimRandom>,
  max: number,
) {
  for (let index = 0; index < particles.count; index++) {
    if (random.next() > 0.28) continue;
    const angle = random.next() * Math.PI * 2;
    particles.vx[index] = Math.cos(angle) * max;
    particles.vy[index] = Math.sin(angle) * max;
  }
}

function qualifies(result: Evaluation): boolean {
  const threshold = morphologySearchConfig.thresholds;
  return (
    result.clusteredFraction >= threshold.clusteredFraction &&
    result.structurePresence >= threshold.structurePresence &&
    result.meanLayering >= threshold.meanLayering &&
    result.movingFraction >= threshold.movingFraction &&
    result.recovery >= threshold.recovery &&
    result.staticFraction <= threshold.staticFraction &&
    result.fragmentation <= threshold.fragmentation &&
    result.collapse <= threshold.collapse &&
    result.orbitDominance <= threshold.orbitDominance &&
    result.orbitActivity <= threshold.orbitActivity &&
    result.isolatedFraction <= threshold.isolatedFraction &&
    result.stalledIsolatedFraction <= threshold.stalledIsolatedFraction &&
    result.wallSupportedStructureFraction <= threshold.wallSupportedStructureFraction &&
    result.meanCompactness >= threshold.meanCompactness &&
    result.membershipStability >= threshold.membershipStability &&
    result.recoveryMembership >= threshold.recoveryMembership &&
    result.recoveryCompactness >= threshold.recoveryCompactness &&
    result.recoveryLayering >= threshold.recoveryLayering
  );
}

function markPareto(results: Evaluation[]): void {
  for (let index = 0; index < results.length; index++) {
    const target = results[index];
    const dominated = results.some((other, otherIndex) => {
      if (otherIndex === index) return false;
      const noWorse =
        other.clusteredFraction >= target.clusteredFraction &&
        other.meanLayering >= target.meanLayering &&
        other.movingFraction >= target.movingFraction &&
        other.recovery >= target.recovery &&
        other.meanCompactness >= target.meanCompactness &&
        other.membershipStability >= target.membershipStability &&
        other.isolatedFraction <= target.isolatedFraction &&
        other.wallSupportedStructureFraction <= target.wallSupportedStructureFraction &&
        other.staticFraction <= target.staticFraction &&
        other.orbitDominance <= target.orbitDominance;
      const better =
        other.clusteredFraction > target.clusteredFraction ||
        other.meanLayering > target.meanLayering ||
        other.movingFraction > target.movingFraction ||
        other.recovery > target.recovery ||
        other.meanCompactness > target.meanCompactness ||
        other.membershipStability > target.membershipStability ||
        other.isolatedFraction < target.isolatedFraction ||
        other.wallSupportedStructureFraction < target.wallSupportedStructureFraction ||
        other.staticFraction < target.staticFraction ||
        other.orbitDominance < target.orbitDominance;
      return noWorse && better;
    });
    results[index] = { ...target, pareto: !dominated };
  }
}

function rank(result: Evaluation): number {
  return (
    result.clusteredFraction * 2 +
    result.structurePresence * 2 +
    result.meanLayering * 1.5 +
    result.movingFraction +
    result.recovery -
    result.isolatedFraction -
    result.wallSupportedStructureFraction +
    result.meanCompactness +
    result.membershipStability -
    result.staticFraction -
    result.orbitDominance * 1.5 -
    result.collapse
  );
}

function roundEvaluation(result: Evaluation) {
  return {
    ...Object.fromEntries(
      Object.entries(result)
        .filter(([key]) => key !== 'perSeed')
        .map(([key, value]) => [key, typeof value === 'number' ? round(value) : value]),
    ),
    perSeed: result.perSeed.map((seed) =>
      Object.fromEntries(
        Object.entries(seed).map(([key, value]) => [
          key,
          typeof value === 'number' ? round(value) : value,
        ]),
      ),
    ),
  };
}

function resolveCandidateConfig(candidate: Candidate): ParticleConfig {
  return {
    ...particleConfig,
    count: morphologySearchConfig.particleCount,
    ...candidate.parameters,
    interactionMatrix: candidate.matrix,
    interactionRadiusByRolePair: candidate.roleRadii ?? particleConfig.interactionRadiusByRolePair,
  };
}

function serializeConfig(config: ParticleConfig) {
  return {
    ...config,
    roleByType: Array.from(config.roleByType),
    interactionMatrix: Array.from(config.interactionMatrix).map(round),
    interactionRadiusByRolePair: Array.from(config.interactionRadiusByRolePair).map(round),
  };
}

function recoveryRatio(values: readonly number[], baseline: readonly number[]): number {
  if (values.length === 0 || baseline.length === 0) return 0;
  return Math.min(1, mean(values) / Math.max(0.01, mean(baseline)));
}

function readGit(arguments_: readonly string[]): string {
  return execFileSync('git', arguments_, { encoding: 'utf8' }).trim();
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
