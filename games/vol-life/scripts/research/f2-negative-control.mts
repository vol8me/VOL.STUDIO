import { mkdirSync, writeFileSync } from 'node:fs';
import { digestSubstrateCandidate } from '@/config/candidate';
import { substrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';
import { createTriangularKernel } from '../../benchmarks/fixtures/triangularKernel';
import { ClusterTracker, defaultClusterConfig } from '../morphology/clusterTracker';
import { MorphologyMetrics, defaultMetricsConfig } from '../morphology/metrics';
import { PhaseClassifier, defaultPhaseConfig } from '../morphology/phaseClassifier';
import { defaultHarnessConfig } from '../morphology/harness';
import { generateSeedCorpus } from '../morphology/shards';
import { resolveMorphologyScope } from '../morphology/scenario';
import { validateNegativeControlSummary } from '../morphology/negativeControlSummary';

/*
 * F2 — V1 negatif kontrolü. REDDEDİLEN triangular kernel, final adayla AYNI
 * harness, korpus, metrik ve sınıflandırıcıdan geçirilir; tek fark kernel
 * enjeksiyonudur. Karşılaştırma ancak aynı ölçüm hattından geçerse anlamlıdır.
 */
const SEED_COUNT = Number(process.argv[2] ?? 4);
const stage = defaultHarnessConfig.refinement;
const seeds = generateSeedCorpus(0, SEED_COUNT);
const maxSpeed = substrateConfig.candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick;
const scope = resolveMorphologyScope(
  substrateConfig.candidate.scenario,
  substrateConfig.candidate.void,
);

const started = Date.now();
const seedSummaries = seeds.map((seed) => {
  const world = new LifeWorld(substrateConfig, createExplicitWorldMetadata(seed), {
    kernel: createTriangularKernel(),
  });
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
  });
  for (let tick = 0; tick < stage.tickCount; tick++) {
    world.step();
    if (tick % stage.sampleInterval === 0) {
      cluster.update(world.particles, tick);
      metrics.sample(
        world.particles,
        world.domain,
        tick,
        world.reservoir.voidLossTotal,
        cluster.activeClusters,
      );
    }
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
});

const summary = {
  schemaVersion: 1,
  madde: 'F2',
  tarih: new Date().toISOString().slice(0, 10),
  kernel: 'triangular-v1 (REDDEDİLEN)',
  candidateDigest: digestSubstrateCandidate(substrateConfig.candidate),
  tickCount: stage.tickCount,
  sampleInterval: stage.sampleInterval,
  seedCount: SEED_COUNT,
  süreMs: Date.now() - started,
  seedler: seedSummaries,
  medyanKoruma: median(seedSummaries.map((entry) => entry.retention)),
  medyanKümeliMadde: median(seedSummaries.map((entry) => entry.clusteredFraction)),
  gerekçeDağılımı: countBy(seedSummaries.map((entry) => entry.primaryReason)),
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

// Şema betikte de DOĞRULANIR: geçersiz bir özet diske yazılmaz.
validateNegativeControlSummary(summary);
mkdirSync('benchmarks/results', { recursive: true });
writeFileSync(
  'benchmarks/results/v1-negative-control.json',
  JSON.stringify(summary, null, 2),
  'utf8',
);
console.log(
  `F2: ${SEED_COUNT} seed × ${stage.tickCount} tick — medyan koruma ` +
    `${summary.medyanKoruma}, gerekçeler ${JSON.stringify(summary.gerekçeDağılımı)}`,
);
