import { morphologySearchConfig } from '../src/config/morphology';
import { PARTICLE_TYPE_COUNT, particleConfig, type ParticleConfig } from '../src/config/particles';
import { worldConfig } from '../src/config/world';
import {
  analyzeMorphologyFrame,
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

interface Candidate {
  readonly id: string;
  readonly matrix: Float32Array;
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
  readonly recovery: number;
  readonly qualified: boolean;
  readonly pareto: boolean;
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

console.log(
  JSON.stringify(
    {
      searchVersion: morphologySearchConfig.version,
      corpus: morphologySearchConfig.seedCorpus,
      thresholds: morphologySearchConfig.thresholds,
      broad: broad.map(roundEvaluation),
      finalists: finalists.map((result) => ({
        ...roundEvaluation(result),
        matrix: Array.from(candidates.find((candidate) => candidate.id === result.id)!.matrix).map(
          round,
        ),
      })),
      globalBroad: globalBroad.map(roundEvaluation),
      globalFinalists: globalFinalists.map((result) => {
        const candidate = globalCandidates.find((item) => item.id === result.id)!;
        return {
          ...roundEvaluation(result),
          parameters: candidate.parameters,
          matrix: Array.from(candidate.matrix).map(round),
        };
      }),
    },
    null,
    2,
  ),
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
      interactionStrength: 0.06,
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
  return matrixCandidates.flatMap((candidate) =>
    profiles.map((parameters, index) => ({
      id: `${candidate.id}-global-${index + 1}`,
      matrix: candidate.matrix,
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
    recovery: mean(results.map((result) => result.recovery)),
    qualified: false,
    pareto: false,
  };
  return { ...evaluation, qualified: qualifies(evaluation) };
}

function runSeed(candidate: Candidate, seed: number, options: RunOptions) {
  const config: ParticleConfig = {
    ...particleConfig,
    count: morphologySearchConfig.particleCount,
    ...candidate.parameters,
    interactionMatrix: candidate.matrix,
  };
  const particles = new ParticleStore(config.count);
  const random = createSimRandom(seed);
  initializeParticles(particles, random, config, worldConfig.boundsUnits);
  const grid = new ParticleSpatialHash(
    worldConfig.boundsUnits,
    config.cellSizeUnits,
    particles.count,
  );
  const samples: MorphologyFrameMetrics[] = [];
  const recoverySamples: MorphologyFrameMetrics[] = [];
  let baselineClustered = 0;
  for (let tick = 1; tick <= options.ticks; tick++) {
    grid.rebuild(particles);
    accumulateParticleForces(particles, grid, config);
    integrateParticles(particles, config, worldConfig.boundsUnits, worldConfig.fixedStepMs);
    if (tick === options.perturbAtTick) {
      baselineClustered = mean(samples.slice(-4).map((sample) => sample.clusteredFraction));
      perturb(particles, random, config.maxSpeedUnitsPerReferenceTick);
    }
    if (tick >= options.warmupTicks && tick % options.sampleEveryTicks === 0) {
      const metrics = analyzeMorphologyFrame(
        particles,
        worldConfig.boundsUnits,
        config,
        morphologySearchConfig.analysis,
      );
      samples.push(metrics);
      if (options.recoveryStartTick && tick >= options.recoveryStartTick) {
        recoverySamples.push(metrics);
      }
    }
  }
  return {
    clusteredFraction: mean(samples.map((sample) => sample.clusteredFraction)),
    structurePresence:
      samples.filter((sample) => sample.clusteredFraction >= 0.3 && sample.meanLayering >= 0.1)
        .length / Math.max(1, samples.length),
    meanLayering: mean(samples.map((sample) => sample.meanLayering)),
    movingFraction: mean(samples.map((sample) => sample.movingFraction)),
    staticFraction: mean(samples.map((sample) => sample.staticFraction)),
    fragmentation: mean(samples.map((sample) => sample.fragmentation)),
    collapse: mean(samples.map((sample) => sample.collapse)),
    orbitDominance: mean(samples.map((sample) => sample.orbitDominance)),
    recovery:
      options.perturbAtTick === undefined
        ? 1
        : Math.min(
            1,
            mean(recoverySamples.map((sample) => sample.clusteredFraction)) /
              Math.max(0.01, baselineClustered),
          ),
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
    result.orbitDominance <= threshold.orbitDominance
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
        other.staticFraction <= target.staticFraction &&
        other.orbitDominance <= target.orbitDominance;
      const better =
        other.clusteredFraction > target.clusteredFraction ||
        other.meanLayering > target.meanLayering ||
        other.movingFraction > target.movingFraction ||
        other.recovery > target.recovery ||
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
    result.staticFraction -
    result.orbitDominance * 1.5 -
    result.collapse
  );
}

function roundEvaluation(result: Evaluation) {
  return Object.fromEntries(
    Object.entries(result).map(([key, value]) => [
      key,
      typeof value === 'number' ? round(value) : value,
    ]),
  );
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
