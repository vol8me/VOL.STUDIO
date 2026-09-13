import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { morphologySearchConfig } from '../src/config/morphology';
import { particleConfig } from '../src/config/particles';
import { worldConfig } from '../src/config/world';
import { resolveParticleBounds } from '../src/runtime/sim/WorldBounds';
import {
  runParticleExperiment,
  type ParticleExperimentResult,
} from './morphology/ParticleExperiment.mts';

const CHECKPOINTS_SECONDS = [10, 30, 60, 120, 300, 600, 900] as const;
const SEEDS = [0x10fe1, 0x51a7, 0xc0ffee, 0x7f4a7c15, 0x13579bdf] as const;
const TECHNICAL_THRESHOLDS = {
  finalMovingFractionMinimum: 0.15,
  finalNearlyStalledFractionMaximum: 0.65,
  finalWallSupportedStructureFractionMaximum: 0.35,
  finalCollapseMaximum: 0.75,
  movementPersistenceMinimum: 0.6,
  orbitPersistenceMaximum: 0.6,
  memberChurnMinimum: 0.03,
} as const;

const startedAt = performance.now();
const collisionBounds = resolveParticleBounds(
  worldConfig.boundsUnits,
  worldConfig.particleCollisionInsetUnits,
);
const regimes = (['legacy-spring-v1', 'contact-impulse-v2'] as const).map((wallModel) => {
  const results = SEEDS.map((seed) =>
    runParticleExperiment({
      seed,
      bounds: worldConfig.boundsUnits,
      collisionBounds,
      fixedStepMs: worldConfig.fixedStepMs,
      particles: particleConfig,
      analysis: morphologySearchConfig.analysis,
      wallModel,
      durationSeconds: 900,
      checkpointsSeconds: CHECKPOINTS_SECONDS,
      temporalSampleEverySeconds: 10,
    }),
  );
  return {
    wallModel,
    results,
    gate: evaluateCorpus(results),
  };
});
const artifact = {
  schemaVersion: 1,
  protocolVersion: 'proof-of-life-v1',
  sourceRevision: readGit(['rev-parse', 'HEAD']),
  sourceDirty: readGit(['status', '--porcelain', '--untracked-files=no']).length > 0,
  sourceDiffDigest: createHash('sha256')
    .update(readGit(['diff', '--binary', 'HEAD']))
    .digest('hex'),
  physicsKernelVersion: 'triangular-pair-v1',
  generatedAt: new Date().toISOString(),
  durationSeconds: 900,
  checkpointsSeconds: CHECKPOINTS_SECONDS,
  seedCorpus: SEEDS,
  candidate: serializeCandidate(),
  configDigest: createHash('sha256').update(JSON.stringify(serializeCandidate())).digest('hex'),
  budget: {
    regimes: regimes.length,
    seedsPerRegime: SEEDS.length,
    simulatedTicks: regimes.length * SEEDS.length * 900 * 60,
    temporalSampleEverySeconds: 10,
    elapsedMilliseconds: round(performance.now() - startedAt),
  },
  technicalThresholds: TECHNICAL_THRESHOLDS,
  thresholdRationale: {
    movement:
      'Final populationın en az %15’i ürünün hareket eşiğini aşmalı; örneklerin en az %60’ında bu korunmalı.',
    stall: 'Populationın üçte ikisinin neredeyse durması statik attractor kabul edilir.',
    wall: 'Yapılı parçacıkların üçte birinden fazlası duvar desteğine dayanamaz.',
    orbit: 'Zamanın çoğunu tek yönlü orbital rejimde geçirmek kalıcı attractor kabul edilir.',
    churn: 'Üyelik hiç değişmiyorsa yapı oluşumu değil kristalleşme vardır.',
  },
  humanAcceptance: { status: 'pending', reason: 'Gerçek cihazda 10–15 dakika kullanıcı auditionı gerekir.' },
  regimes: regimes.map((regime) => ({
    ...regime,
    results: regime.results.map(roundDeep),
  })),
};
const outputArgument = process.argv.find((argument) => argument.startsWith('--output='));
const outputPath = outputArgument
  ? resolve(outputArgument.slice('--output='.length))
  : resolve(import.meta.dirname, '../benchmarks/proof-of-life-v1.json');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(
  JSON.stringify({
    outputPath,
    elapsedMilliseconds: artifact.budget.elapsedMilliseconds,
    regimes: regimes.map((regime) => ({ wallModel: regime.wallModel, gate: regime.gate })),
  }),
);
if (process.argv.includes('--gate')) {
  const current = regimes.find((regime) => regime.wallModel === 'contact-impulse-v2');
  if (!current?.gate.passed) process.exitCode = 1;
}

function evaluateCorpus(results: readonly ParticleExperimentResult[]) {
  const perSeed = results.map((result) => ({ seed: result.seed, ...evaluateRun(result) }));
  const passedSeeds = perSeed.filter((result) => result.passed).length;
  const requiredSeeds = Math.ceil(results.length * 0.8);
  const productionSeedPassed = perSeed.find((result) => result.seed === SEEDS[0])?.passed === true;
  return {
    passed: passedSeeds >= requiredSeeds && productionSeedPassed,
    passedSeeds,
    requiredSeeds,
    productionSeedPassed,
    perSeed,
  };
}

function evaluateRun(result: ParticleExperimentResult) {
  const reasons: string[] = [];
  const final = result.checkpoints.at(-1)!;
  if (final.movingFraction < TECHNICAL_THRESHOLDS.finalMovingFractionMinimum)
    reasons.push('final-moving');
  if (final.nearlyStalledFraction > TECHNICAL_THRESHOLDS.finalNearlyStalledFractionMaximum)
    reasons.push('final-stalled');
  if (
    final.wallSupportedStructureFraction >
    TECHNICAL_THRESHOLDS.finalWallSupportedStructureFractionMaximum
  )
    reasons.push('wall-support');
  if (final.collapse > TECHNICAL_THRESHOLDS.finalCollapseMaximum) reasons.push('collapse');
  if (result.summary.movementPersistence < TECHNICAL_THRESHOLDS.movementPersistenceMinimum)
    reasons.push('movement-persistence');
  if (result.summary.orbitPersistence > TECHNICAL_THRESHOLDS.orbitPersistenceMaximum)
    reasons.push('orbit-persistence');
  if (result.summary.memberChurn < TECHNICAL_THRESHOLDS.memberChurnMinimum)
    reasons.push('member-churn');
  return { passed: reasons.length === 0, rejectedReasons: reasons };
}

function serializeCandidate() {
  return {
    world: worldConfig,
    particles: {
      ...particleConfig,
      roleByType: Array.from(particleConfig.roleByType),
      interactionRadiusByRolePair: Array.from(particleConfig.interactionRadiusByRolePair),
      interactionMatrix: Array.from(particleConfig.interactionMatrix),
    },
  };
}

function roundDeep<T>(value: T): T {
  if (typeof value === 'number') return round(value) as T;
  if (Array.isArray(value)) return value.map(roundDeep) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundDeep(item)])) as T;
  }
  return value;
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
  return Number(value.toFixed(6));
}
