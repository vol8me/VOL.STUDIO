import { mkdirSync, writeFileSync } from 'node:fs';
import { digestSubstrateCandidate } from '@/config/candidate';
import { substrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import type { PairForceKernel } from '@/runtime/sim/PairForceKernel';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';
import { createTriangularKernel } from '../../benchmarks/fixtures/triangularKernel';
import { ClusterTracker, defaultClusterConfig } from '../morphology/clusterTracker';
import { MorphologyMetrics, defaultMetricsConfig } from '../morphology/metrics';
import { PhaseClassifier, defaultPhaseConfig } from '../morphology/phaseClassifier';
import { defaultHarnessConfig } from '../morphology/harness';
import { generateSeedCorpus } from '../morphology/shards';
import { resolveMorphologyScope } from '../morphology/scenario';
import {
  validateNegativeControlSummary,
  type NegativeControlArm,
  type NegativeControlSeed,
} from '../morphology/negativeControlSummary';

/*
 * F2 — V1 negatif kontrolü. REDDEDİLEN triangular kernel ve ÜRETİM kerneli
 * aynı aday, aynı tohumlar, aynı metrik ve sınıflandırıcıdan geçer; tek fark
 * kernel enjeksiyonudur. Karşılaştırma ancak aynı ölçüm hattında anlamlıdır.
 */
const SEED_COUNT = Number(process.argv[2] ?? 4);
const stage = defaultHarnessConfig.refinement;
const seeds = generateSeedCorpus(0, SEED_COUNT);
const maxSpeed = substrateConfig.candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick;
const scope = resolveMorphologyScope(
  substrateConfig.candidate.scenario,
  substrateConfig.candidate.void,
);

function runSeed(seed: number, kernel?: PairForceKernel): NegativeControlSeed {
  const world = new LifeWorld(
    substrateConfig,
    createExplicitWorldMetadata(seed),
    kernel ? { kernel } : {},
  );
  const initialActive = world.particles.activeCount;
  const metrics = new MorphologyMetrics({
    ...defaultMetricsConfig,
    sampleIntervalTicks: stage.sampleInterval,
    minEdgeDistanceUnits: scope.minEdgeDistanceUnits,
    fringeWidthUnits: substrateConfig.candidate.void.widthUnits,
    maxSpeedUnitsPerReferenceTick: maxSpeed,
  });
  const cluster = new ClusterTracker({
    ...defaultClusterConfig,
    sampleIntervalTicks: stage.sampleInterval,
    // Boşluk ve süreklilik ÖRNEK ARALIĞINA tam bölünmeli (tracker şartı).
    maxGapTicks: stage.sampleInterval * 2,
    minContinuityTicks: stage.sampleInterval * 2,
  });
  for (let tick = 0; tick < stage.tickCount; tick++) {
    world.step();
    if (tick % stage.sampleInterval !== 0) continue;
    cluster.update(world.particles, tick);
    metrics.sample(
      world.particles,
      world.domain,
      tick,
      world.reservoir.voidLossTotal,
      cluster.activeClusters,
    );
  }
  const verdict = new PhaseClassifier({
    ...defaultPhaseConfig,
    sampleIntervalTicks: stage.sampleInterval,
    maxSpeedUnitsPerReferenceTick: maxSpeed,
  }).classify(metrics.timeSeries, initialActive);
  const last = metrics.timeSeries[metrics.timeSeries.length - 1];
  return {
    seed,
    retention: +(last.activeCount / initialActive).toFixed(4),
    clusteredFraction: +last.clusteredFraction.toFixed(4),
    meanSpeed: +last.meanSpeed.toFixed(4),
    primaryReason: verdict.primary,
  };
}

function arm(kernelLabel: string, kernel?: PairForceKernel): NegativeControlArm {
  const seedler = seeds.map((seed) => runSeed(seed, kernel));
  return {
    kernel: kernelLabel,
    seedler,
    medyanKoruma: median(seedler.map((entry) => entry.retention)),
    medyanKümeliMadde: median(seedler.map((entry) => entry.clusteredFraction)),
    gerekçeDağılımı: countBy(seedler.map((entry) => entry.primaryReason)),
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

const started = Date.now();
const kontrol = arm('triangular-v1 (REDDEDİLEN)', createTriangularKernel());
const referans = arm('multi-band (üretim)');

const summary = {
  schemaVersion: 2,
  madde: 'F2',
  tarih: new Date().toISOString().slice(0, 10),
  candidateDigest: digestSubstrateCandidate(substrateConfig.candidate),
  tickCount: stage.tickCount,
  sampleInterval: stage.sampleInterval,
  seedCount: SEED_COUNT,
  süreMs: Date.now() - started,
  kontrol,
  referans,
};

// Şema betikte de DOĞRULANIR: geçersiz bir özet diske yazılmaz.
validateNegativeControlSummary(summary);
mkdirSync('benchmarks/results', { recursive: true });
writeFileSync(
  'benchmarks/results/v1-negative-control.json',
  JSON.stringify(summary, null, 2),
  'utf8',
);
console.log(
  `F2: ${SEED_COUNT} seed × ${stage.tickCount} tick\n` +
    `  kontrol  (${kontrol.kernel}): koruma ${kontrol.medyanKoruma}, ` +
    `kümeli ${kontrol.medyanKümeliMadde}, ${JSON.stringify(kontrol.gerekçeDağılımı)}\n` +
    `  referans (${referans.kernel}): koruma ${referans.medyanKoruma}, ` +
    `kümeli ${referans.medyanKümeliMadde}, ${JSON.stringify(referans.gerekçeDağılımı)}`,
);
