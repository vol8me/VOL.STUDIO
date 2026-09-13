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
  compareClusterStructure,
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
      | 'maxSpeedUnitsPerReferenceTick'
    >
  >;
}

interface Evaluation {
  readonly id: string;
  readonly clusteredFraction: number;
  readonly structurePresence: number;
  readonly meanLayering: number;
  readonly meanRadialLayering: number;
  readonly medianSpeed: number;
  readonly averageNeighborCount: number;
  readonly movingFraction: number;
  readonly nearlyStalledFraction: number;
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
  readonly structuralDiversity: number;
  readonly orbitPersistence: number;
  readonly recovery: number;
  readonly recoveryMembership: number;
  readonly recoveryCompactness: number;
  readonly recoveryLayering: number;
  readonly recoveryTypeComposition: number;
  readonly recoveryRadialProfile: number;
  readonly recoveryCentroidAndSize: number;
  readonly recoveryShape: number;
  readonly qualified: boolean;
  readonly passedSeeds: number;
  readonly requiredSeeds: number;
  readonly productionSeedPassed: boolean;
  readonly pareto: boolean;
  readonly perSeed: readonly SeedEvaluation[];
}

interface SeedEvaluation extends Omit<
  Evaluation,
  | 'id'
  | 'qualified'
  | 'passedSeeds'
  | 'requiredSeeds'
  | 'productionSeedPassed'
  | 'pareto'
  | 'perSeed'
> {
  readonly seed: number;
  readonly checkpoints: readonly ({ readonly seconds: number } & MorphologyFrameMetrics)[];
}

interface MorphologySample {
  readonly tick: number;
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

const smoke = process.argv.includes('--smoke');
const searchPlan = smoke
  ? {
      broad: { ...morphologySearchConfig.broad, candidateCount: 16, ticks: 120, warmupTicks: 60, finalists: 4 },
      refinement: { ...morphologySearchConfig.refinement, ticks: 300, warmupTicks: 120, seeds: 2, finalists: 2 },
      finalist: { ...morphologySearchConfig.finalist, ticks: 600, warmupTicks: 120, perturbAtTick: 300, recoveryStartTick: 420, sampleEveryTicks: 60 },
    }
  : morphologySearchConfig;
const startedAt = performance.now();
const candidates = buildCandidates(searchPlan.broad.candidateCount);
console.log(`[search:morphology] Broad stage: evaluating ${candidates.length} candidates (${searchPlan.broad.ticks} ticks, ${searchPlan.broad.seeds} seed)...`);
const broad: Evaluation[] = [];
for (let index = 0; index < candidates.length; index++) {
  broad.push(
    evaluate(
      candidates[index],
      morphologySearchConfig.seedCorpus.slice(0, searchPlan.broad.seeds),
      searchPlan.broad,
    ),
  );
  if ((index + 1) % 128 === 0 || index + 1 === candidates.length) {
    console.log(`[search:morphology] Broad progress: ${index + 1}/${candidates.length}`);
  }
}
markPareto(broad);
const refinementIds = [...broad]
  .sort((left, right) => rank(right) - rank(left))
  .slice(0, searchPlan.broad.finalists)
  .map((result) => result.id);
console.log(`[search:morphology] Refinement stage: evaluating ${refinementIds.length} candidates (${searchPlan.refinement.ticks} ticks, ${searchPlan.refinement.seeds} seeds)...`);
const refinement = candidates
  .filter((candidate) => refinementIds.includes(candidate.id))
  .map((candidate, idx) => {
    const result = evaluate(
      candidate,
      morphologySearchConfig.seedCorpus.slice(0, searchPlan.refinement.seeds),
      searchPlan.refinement,
    );
    console.log(`[search:morphology] Refinement candidate ${idx + 1}/${refinementIds.length} (${candidate.id}) done`);
    return result;
  });
markPareto(refinement);
const finalistIds = [...refinement]
  .sort((left, right) => rank(right) - rank(left))
  .slice(0, searchPlan.refinement.finalists)
  .map((result) => result.id);
console.log(`[search:morphology] Finalist stage: evaluating ${finalistIds.length} finalists (${searchPlan.finalist.ticks} ticks, 5 seeds)...`);
const finalists = candidates
  .filter((candidate) => finalistIds.includes(candidate.id))
  .map((candidate, idx) => {
    const result = evaluate(candidate, morphologySearchConfig.seedCorpus, searchPlan.finalist);
    console.log(`[search:morphology] Finalist ${idx + 1}/${finalistIds.length} (${candidate.id}) done: qualified=${result.qualified}, pareto=${result.pareto}`);
    return result;
  });
markPareto(finalists);

const sourceRevision = readGit(['rev-parse', 'HEAD']);
const sourceDirty = readGit(['status', '--porcelain', '--untracked-files=no']).length > 0;
const sourceDiffDigest = createHash('sha256').update(readGit(['diff', '--binary', 'HEAD'])).digest('hex');
  const candidateIdsToRecord = new Set([
    ...refinementIds,
    ...finalistIds,
    ...broad.filter((r) => r.pareto).map((r) => r.id),
  ]);
  const recordedCandidates = candidates
    .filter((candidate) => candidateIdsToRecord.has(candidate.id))
    .map((candidate) => ({
      id: candidate.id,
      config: serializeConfig(resolveCandidateConfig(candidate)),
    }));
  const artifact = {
    schemaVersion: 3,
    searchVersion: morphologySearchConfig.version,
    sourceRevision,
    sourceDirty,
    sourceDiffDigest,
    configDigest: createHash('sha256')
      .update(
        JSON.stringify({
          worldConfig,
          particleConfig: serializeConfig(particleConfig),
          morphologySearchConfig,
          candidates: candidates.map((candidate) =>
            serializeConfig(resolveCandidateConfig(candidate)),
          ),
        }),
      )
      .digest('hex'),
    corpus: morphologySearchConfig.seedCorpus,
    worldConfig,
    analysis: morphologySearchConfig.analysis,
    thresholds: morphologySearchConfig.thresholds,
    thresholdRationale: {
      seedRobustness: 'Finalist en az 4/5 seed ve production fixture seedini ayrı ayrı geçer.',
      movement: 'Moving ve nearly-stalled birlikte statik attractorı reddeder.',
      wall: 'Yapılı populationın üçte birden fazlası duvarla taşınamaz.',
      orbit: 'Cyclic pursuit serbesttir; dominant ve kalıcı orbital rejim reddedilir.',
      recovery: 'Üyelik, kompozisyon, radial profil, centroid/size ve şekil ayrı toparlanır.',
    },
    protocol: {
      algorithm: 'seeded-bounded-random-v1',
      searchSeed: morphologySearchConfig.searchSeed,
      physicsKernelVersion: 'triangular-pair-v1',
      wallModelVersion: 'contact-impulse-v2',
      stages: {
        broad: searchPlan.broad,
        refinement: searchPlan.refinement,
        finalist: searchPlan.finalist,
      },
    },
    budget: {
      candidateCount: candidates.length,
      seedCorpusSize: morphologySearchConfig.seedCorpus.length,
      elapsedMilliseconds: 0,
      smoke,
      plannedSimulationTicks:
        candidates.length * searchPlan.broad.seeds * searchPlan.broad.ticks +
        refinement.length * searchPlan.refinement.seeds * searchPlan.refinement.ticks +
        finalists.length * morphologySearchConfig.seedCorpus.length * searchPlan.finalist.ticks,
      cpuBudgetMilliseconds: smoke ? 60_000 : 3_600_000,
      memoryBudgetMiB: 256,
    },
    candidates: recordedCandidates,
  phases: {
    broad: broad.map(roundEvaluation),
    refinement: refinement.map(roundEvaluation),
    finalists: finalists.map(roundEvaluation),
  },
  qualified: finalists.filter((result) => result.qualified).map((result) => result.id),
  pareto: finalists.filter((result) => result.pareto).map((result) => result.id),
  humanAcceptance: {
    status: 'pending',
    reason: 'Finalistler browser, Samsung ve Lenovo üzerinde 10–15 dakika audition bekliyor.',
  },
};
(artifact.budget as { elapsedMilliseconds: number }).elapsedMilliseconds = round(
  performance.now() - startedAt,
);
const outputArgument = process.argv.find((argument) => argument.startsWith('--output='));
const outputPath = outputArgument
  ? resolve(outputArgument.slice('--output='.length))
  : resolve(import.meta.dirname, '../benchmarks/morphology-search-v3.json');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
const previewPath = smoke
  ? null
  : resolve(import.meta.dirname, '../public/generated/morphology-candidates-v3.json');
if (previewPath) {
  await mkdir(dirname(previewPath), { recursive: true });
  await writeFile(
    previewPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      sourceRevision,
      configDigest: artifact.configDigest,
      candidates: [...finalists]
        .sort((left, right) => rank(right) - rank(left))
        .map((result) => {
          const candidate = candidates.find((entry) => entry.id === result.id)!;
          return {
            id: result.id,
            worldConfig,
            particleConfig: serializeConfig(resolveCandidateConfig(candidate)),
            evaluation: roundEvaluation(result),
          };
        }),
    },
    null,
    2,
  )}\n`,
    'utf8',
  );
}
console.log(
  JSON.stringify({
    outputPath,
    previewPath,
    sourceRevision,
    sourceDirty,
    candidates: candidates.length,
    qualified: artifact.qualified,
    pareto: artifact.pareto,
  }),
);

function buildCandidates(candidateCount: number): Candidate[] {
  const random = createSimRandom(morphologySearchConfig.searchSeed);
  const candidates: Candidate[] = [{ id: 'production-baseline', matrix: particleConfig.interactionMatrix }];
  const counts = [128, 192, 256, 384, 512, 768] as const;
  for (let index = 1; index < candidateCount; index++) {
    const interactionRadius = randomRange(random, 80, 176);
    const repulsionRadius = randomRange(random, 9, Math.min(28, interactionRadius * 0.3));
    const cellSizeUnits = interactionRadius <= 128 ? 128 : 256;
    const matrix = new Float32Array(PARTICLE_TYPE_COUNT ** 2);
    for (let entry = 0; entry < matrix.length; entry++) matrix[entry] = random.bipolar();
    if (index % 4 === 0) {
      const structured = buildLayerMatrix(
        randomRange(random, 0.2, 0.8),
        randomRange(random, 0.25, 1),
        randomRange(random, -0.8, 0.3),
        randomRange(random, -0.45, 0.45),
        Math.floor(random.next() * 0x1_0000_0000),
      );
      for (let entry = 0; entry < matrix.length; entry++) {
        matrix[entry] = structured[entry] * 0.75 + matrix[entry] * 0.25;
      }
    }
    const roleRadii = new Float32Array(9);
    for (let pair = 0; pair < roleRadii.length; pair++) {
      roleRadii[pair] = randomRange(random, repulsionRadius + 8, interactionRadius);
    }
    candidates.push({
      id: `random-${index.toString().padStart(4, '0')}`,
      matrix,
      roleRadii,
      parameters: {
        count: counts[Math.floor(random.next() * counts.length)],
        cellSizeUnits,
        repulsionRadiusUnits: repulsionRadius,
        interactionRadiusUnits: interactionRadius,
        repulsionStrength: randomRange(random, 0.08, 0.3),
        interactionStrength: randomRange(random, 0.018, 0.09),
        frictionPerReferenceTick: randomRange(random, 0.91, 0.985),
        maxSpeedUnitsPerReferenceTick: randomRange(random, 1.4, 3),
      },
    });
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

function evaluate(candidate: Candidate, seeds: readonly number[], options: RunOptions): Evaluation {
  const results = seeds.map((seed) => runSeed(candidate, seed, options));
  const evaluation: Evaluation = {
    id: candidate.id,
    clusteredFraction: mean(results.map((result) => result.clusteredFraction)),
    structurePresence: mean(results.map((result) => result.structurePresence)),
    meanLayering: mean(results.map((result) => result.meanLayering)),
    meanRadialLayering: mean(results.map((result) => result.meanRadialLayering)),
    medianSpeed: mean(results.map((result) => result.medianSpeed)),
    averageNeighborCount: mean(results.map((result) => result.averageNeighborCount)),
    movingFraction: mean(results.map((result) => result.movingFraction)),
    nearlyStalledFraction: mean(results.map((result) => result.nearlyStalledFraction)),
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
    structuralDiversity: mean(results.map((result) => result.structuralDiversity)),
    orbitPersistence: mean(results.map((result) => result.orbitPersistence)),
    recovery: mean(results.map((result) => result.recovery)),
    recoveryMembership: mean(results.map((result) => result.recoveryMembership)),
    recoveryCompactness: mean(results.map((result) => result.recoveryCompactness)),
    recoveryLayering: mean(results.map((result) => result.recoveryLayering)),
    recoveryTypeComposition: mean(results.map((result) => result.recoveryTypeComposition)),
    recoveryRadialProfile: mean(results.map((result) => result.recoveryRadialProfile)),
    recoveryCentroidAndSize: mean(results.map((result) => result.recoveryCentroidAndSize)),
    recoveryShape: mean(results.map((result) => result.recoveryShape)),
    qualified: false,
    passedSeeds: 0,
    requiredSeeds: Math.ceil(results.length * 0.8),
    productionSeedPassed: false,
    pareto: false,
    perSeed: results,
  };
  const passedSeeds = results.filter((result) => qualifies(result)).length;
  const productionSeedPassed = qualifies(results[0]);
  return {
    ...evaluation,
    passedSeeds,
    productionSeedPassed,
    qualified:
      qualifies(evaluation) &&
      passedSeeds >= evaluation.requiredSeeds &&
      productionSeedPassed,
  };
}

function runSeed(candidate: Candidate, seed: number, options: RunOptions): SeedEvaluation {
  const config = resolveCandidateConfig(candidate);
  const particles = new ParticleStore(config.count);
  const random = createSimRandom(seed);
  const particleBounds = resolveParticleBounds(
    worldConfig.boundsUnits,
    worldConfig.particleCollisionInsetUnits,
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
      const sample = { tick, metrics, structures };
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
  const recoveryStructures = recoverySamples.map((sample) =>
    compareClusterStructure(baselineStructures, sample.structures),
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
    checkpoints: samples.map((sample) => ({
      seconds: sample.tick / particleConfig.referenceHz,
      ...sample.metrics,
    })),
    clusteredFraction: mean(metrics.map((sample) => sample.clusteredFraction)),
    structurePresence:
      metrics.filter(
        (sample) =>
          sample.clusteredFraction >= 0.3 &&
          sample.meanRadialLayering >= 0.1 &&
          sample.meanCompactness >= 0.12,
      ).length / Math.max(1, samples.length),
    meanLayering: mean(metrics.map((sample) => sample.meanLayering)),
    meanRadialLayering: mean(metrics.map((sample) => sample.meanRadialLayering)),
    medianSpeed: mean(metrics.map((sample) => sample.medianSpeed)),
    averageNeighborCount: mean(metrics.map((sample) => sample.averageNeighborCount)),
    movingFraction: mean(metrics.map((sample) => sample.movingFraction)),
    nearlyStalledFraction: mean(metrics.map((sample) => sample.nearlyStalledFraction)),
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
    structuralDiversity: measureStructuralDiversity(metrics),
    orbitPersistence: longestRunFraction(
      metrics,
      (sample) => sample.orbitActivity >= 0.4 && sample.orbitDominance >= 0.2,
    ),
    recovery:
      options.perturbAtTick === undefined
        ? 1
        : mean([
            recoveryClustered,
            recoveryMembership,
            recoveryCompactness,
            mean(recoveryStructures.map((sample) => sample.radialProfile)),
          ]),
    recoveryMembership: options.perturbAtTick === undefined ? 1 : recoveryMembership,
    recoveryCompactness: options.perturbAtTick === undefined ? 1 : recoveryCompactness,
    recoveryLayering: options.perturbAtTick === undefined ? 1 : recoveryLayering,
    recoveryTypeComposition:
      options.perturbAtTick === undefined
        ? 1
        : mean(recoveryStructures.map((sample) => sample.typeComposition)),
    recoveryRadialProfile:
      options.perturbAtTick === undefined
        ? 1
        : mean(recoveryStructures.map((sample) => sample.radialProfile)),
    recoveryCentroidAndSize:
      options.perturbAtTick === undefined
        ? 1
        : mean(recoveryStructures.map((sample) => sample.centroidAndSize)),
    recoveryShape:
      options.perturbAtTick === undefined
        ? 1
        : mean(recoveryStructures.map((sample) => sample.shape)),
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

function qualifies(result: Evaluation | SeedEvaluation): boolean {
  const threshold = morphologySearchConfig.thresholds;
  return (
    result.clusteredFraction >= threshold.clusteredFraction &&
    result.structurePresence >= threshold.structurePresence &&
    result.meanRadialLayering >= threshold.meanRadialLayering &&
    result.movingFraction >= threshold.movingFraction &&
    result.nearlyStalledFraction <= threshold.nearlyStalledFraction &&
    result.structuralDiversity >= threshold.structuralDiversity &&
    result.orbitPersistence <= threshold.orbitPersistence &&
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
    result.recoveryTypeComposition >= threshold.recoveryTypeComposition &&
    result.recoveryRadialProfile >= threshold.recoveryRadialProfile &&
    result.recoveryCentroidAndSize >= threshold.recoveryCentroidAndSize &&
    result.recoveryShape >= threshold.recoveryShape
  );
}

function rejectionReasons(result: Evaluation | SeedEvaluation): string[] {
  const threshold = morphologySearchConfig.thresholds;
  const reasons: string[] = [];
  const minimums = {
    clusteredFraction: threshold.clusteredFraction,
    structurePresence: threshold.structurePresence,
    meanRadialLayering: threshold.meanRadialLayering,
    movingFraction: threshold.movingFraction,
    structuralDiversity: threshold.structuralDiversity,
    recovery: threshold.recovery,
    meanCompactness: threshold.meanCompactness,
    membershipStability: threshold.membershipStability,
    recoveryMembership: threshold.recoveryMembership,
    recoveryCompactness: threshold.recoveryCompactness,
    recoveryTypeComposition: threshold.recoveryTypeComposition,
    recoveryRadialProfile: threshold.recoveryRadialProfile,
    recoveryCentroidAndSize: threshold.recoveryCentroidAndSize,
    recoveryShape: threshold.recoveryShape,
  } as const;
  const maximums = {
    nearlyStalledFraction: threshold.nearlyStalledFraction,
    staticFraction: threshold.staticFraction,
    fragmentation: threshold.fragmentation,
    collapse: threshold.collapse,
    orbitDominance: threshold.orbitDominance,
    orbitActivity: threshold.orbitActivity,
    orbitPersistence: threshold.orbitPersistence,
    isolatedFraction: threshold.isolatedFraction,
    stalledIsolatedFraction: threshold.stalledIsolatedFraction,
    wallSupportedStructureFraction: threshold.wallSupportedStructureFraction,
  } as const;
  for (const [key, minimum] of Object.entries(minimums)) {
    if ((result[key as keyof typeof minimums] as number) < minimum) reasons.push(`${key}:min`);
  }
  for (const [key, maximum] of Object.entries(maximums)) {
    if ((result[key as keyof typeof maximums] as number) > maximum) reasons.push(`${key}:max`);
  }
  if ('passedSeeds' in result && result.passedSeeds < result.requiredSeeds) {
    reasons.push('seedRobustness:min');
  }
  if ('productionSeedPassed' in result && !result.productionSeedPassed) {
    reasons.push('productionSeed:required');
  }
  return reasons;
}

function markPareto(results: Evaluation[]): void {
  for (let index = 0; index < results.length; index++) {
    const target = results[index];
    const dominated = results.some((other, otherIndex) => {
      if (otherIndex === index) return false;
      const noWorse =
        other.clusteredFraction >= target.clusteredFraction &&
        other.meanRadialLayering >= target.meanRadialLayering &&
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
        other.meanRadialLayering > target.meanRadialLayering ||
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
    result.meanRadialLayering * 1.5 +
    result.movingFraction +
    result.recovery -
    result.isolatedFraction -
    result.wallSupportedStructureFraction +
    result.meanCompactness +
    result.membershipStability -
    result.nearlyStalledFraction -
    result.orbitPersistence -
    result.staticFraction -
    result.orbitDominance * 1.5 -
    result.collapse
  );
}

function roundEvaluation(result: Evaluation) {
  const isPerturbed = result.recovery !== 1 || result.recoveryMembership !== 1;
  return {
    ...Object.fromEntries(
      Object.entries(result)
        .filter(([key]) => {
          if (key === 'perSeed') return false;
          if (!isPerturbed && key.startsWith('recovery')) return false;
          return true;
        })
        .map(([key, value]) => [key, typeof value === 'number' ? round(value) : value]),
    ),
    ...(result.perSeed.length > 1
      ? {
          perSeed: result.perSeed.map((seed) =>
            Object.fromEntries(
              [
                ...Object.entries(seed)
                  .filter(
                    ([key]) =>
                      key !== 'checkpoints' && (isPerturbed || !key.startsWith('recovery')),
                  )
                  .map(([key, value]) => [
                    key,
                    typeof value === 'number' ? round(value) : value,
                  ]),
                ['rejectedReasons', rejectionReasons(seed)],
              ],
            ),
          ),
        }
      : {}),
    rejectedReasons: rejectionReasons(result),
  };
}

function resolveCandidateConfig(candidate: Candidate): ParticleConfig {
  return {
    ...particleConfig,
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

function measureStructuralDiversity(metrics: readonly MorphologyFrameMetrics[]): number {
  if (metrics.length < 2) return 0;
  return mean(
    metrics.slice(1).map((sample, index) => {
      const before = metrics[index];
      return Math.min(
        1,
        mean([
          Math.abs(sample.clusteredFraction - before.clusteredFraction) * 3,
          Math.abs(sample.meanCompactness - before.meanCompactness) * 3,
          Math.abs(sample.meanRadialLayering - before.meanRadialLayering) * 2,
          Math.abs(sample.fragmentation - before.fragmentation) * 3,
        ]),
      );
    }),
  );
}

function longestRunFraction<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  let longest = 0;
  let current = 0;
  for (const value of values) {
    current = predicate(value) ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest / Math.max(1, values.length);
}

function readGit(arguments_: readonly string[]): string {
  return execFileSync('git', arguments_, {
    cwd: resolve(import.meta.dirname, '../../..'),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function randomRange(random: ReturnType<typeof createSimRandom>, minimum: number, maximum: number) {
  return minimum + random.next() * (maximum - minimum);
}
