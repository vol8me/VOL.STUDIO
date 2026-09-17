import { parseSubstrateCandidate } from '@/config/candidate';
import { particleConfig } from '@/config/particles';
import type { SubstrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';
import { ClusterTracker, type ClusterTrackerConfig } from './clusterTracker';
import { MorphologyMetrics, type MorphologyMetricsConfig } from './metrics';
import { PhaseClassifier, type PhaseClassifierConfig, type ReasonCode } from './phaseClassifier';
import { resolveMorphologyScope } from './scenario';

/**
 * Uzun ufuk taban koşusu (E17). Bu koşu PROMOTION ÖNCESİ varsayılanı ölçer;
 * promote edilmiş adayla koşu ikinci turun işidir.
 */
export interface LongRunInput {
  readonly substrate: SubstrateConfig;
  readonly candidateText: string;
  readonly seed: number;
  readonly minutes: number;
  readonly simulationHz: number;
  readonly sampleIntervalTicks: number;
  /** Bu dakikada snapshot alınır; restore edilen kopya sonda karşılaştırılır. */
  readonly restoreAtMinute: number;
  /** Tick maliyeti bu uzunluktaki ilk ve son pencerede ölçülür. */
  readonly costWindowMinutes: number;
  readonly metrics: MorphologyMetricsConfig;
  readonly cluster: ClusterTrackerConfig;
  readonly phase: PhaseClassifierConfig;
}

export interface LongRunSummary {
  readonly seed: number;
  readonly initialCount: number;
  readonly finalCount: number;
  readonly retention: number;
  /** aktif + dış rezervuar = başlangıç, her örnekte. */
  readonly accountingHeld: boolean;
  readonly allFinite: boolean;
  /** Restore edilen kopya sonda kesintisiz koşuyla aynı parmak izini verdi mi. */
  readonly restoreMatches: boolean;
  readonly uninterruptedFingerprint: string;
  readonly restoredFingerprint: string;
  readonly firstWindowMsPerTick: number;
  readonly lastWindowMsPerTick: number;
  readonly firstWindowActiveCount: number;
  readonly lastWindowActiveCount: number;
  readonly costDriftRatio: number;
  /**
   * PARÇACIK BAŞINA tick maliyetinin sapması. Ham tick maliyeti nüfusla
   * değişir: varsayılan aday 30 dakikada maddesinin yarısını kaybediyor ve
   * tick doğal olarak ucuzluyor. Çalışma zamanı bozulmasını ölçen sayı budur.
   */
  readonly costPerParticleDriftRatio: number;
  readonly finalClusteredFraction: number;
  readonly finalMeanSpeed: number;
  readonly primaryReason: ReasonCode;
}

export function runLongHorizon(input: LongRunInput): LongRunSummary {
  const candidate = parseSubstrateCandidate(input.candidateText, particleConfig.radiusUnits);
  const config: SubstrateConfig = { ...input.substrate, candidate };
  const scope = resolveMorphologyScope(candidate.scenario, candidate.void);
  const maxSpeed = candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick;
  const metrics = new MorphologyMetrics({
    ...input.metrics,
    minEdgeDistanceUnits: scope.minEdgeDistanceUnits,
    fringeWidthUnits: candidate.void.widthUnits,
    maxSpeedUnitsPerReferenceTick: maxSpeed,
  });
  const cluster = new ClusterTracker(input.cluster);
  const world = new LifeWorld(config, createExplicitWorldMetadata(input.seed));
  const initialCount = world.particles.activeCount;

  const totalTicks = input.minutes * 60 * input.simulationHz;
  const restoreTick = input.restoreAtMinute * 60 * input.simulationHz;
  const windowTicks = input.costWindowMinutes * 60 * input.simulationHz;

  let accountingHeld = true;
  let allFinite = true;
  let firstWindowMs = 0;
  let lastWindowMs = 0;
  let restorePoint: ReturnType<LifeWorld['snapshot']> | undefined;
  let windowStart = performance.now();
  let firstWindowActive = initialCount;
  let lastWindowActive = initialCount;

  for (let tick = 0; tick < totalTicks; tick++) {
    world.step();
    if (tick === windowTicks - 1) {
      firstWindowMs = performance.now() - windowStart;
      firstWindowActive = world.particles.activeCount;
    }
    if (tick === totalTicks - windowTicks) windowStart = performance.now();
    if (tick === totalTicks - 1) {
      lastWindowMs = performance.now() - windowStart;
      lastWindowActive = world.particles.activeCount;
    }
    if (tick === restoreTick - 1) restorePoint = world.snapshot();
    if (tick % input.sampleIntervalTicks !== 0) continue;
    cluster.update(world.particles, tick);
    const sample = metrics.sample(
      world.particles,
      world.domain,
      tick,
      world.reservoir.voidLossTotal,
      cluster.activeClusters,
    );
    if (world.particles.activeCount + world.reservoir.external !== initialCount) {
      accountingHeld = false;
    }
    if (!isSampleFinite(sample.meanSpeed, sample.clusteredFraction, sample.clusterCompactness)) {
      allFinite = false;
    }
  }

  const classification = new PhaseClassifier({
    ...input.phase,
    maxSpeedUnitsPerReferenceTick: maxSpeed,
  }).classify(metrics.timeSeries, initialCount);
  const last = metrics.timeSeries[metrics.timeSeries.length - 1];
  const uninterrupted = fingerprintWorld(world);

  if (!restorePoint) throw new Error('Restore noktası alınamadı.');
  world.restore(restorePoint);
  for (let tick = restoreTick; tick < totalTicks; tick++) world.step();
  const restored = fingerprintWorld(world);

  return {
    seed: input.seed,
    initialCount,
    finalCount: last.activeCount,
    retention: initialCount > 0 ? last.activeCount / initialCount : 0,
    accountingHeld,
    allFinite,
    restoreMatches: uninterrupted === restored,
    uninterruptedFingerprint: uninterrupted,
    restoredFingerprint: restored,
    firstWindowMsPerTick: firstWindowMs / windowTicks,
    lastWindowMsPerTick: lastWindowMs / windowTicks,
    firstWindowActiveCount: firstWindowActive,
    lastWindowActiveCount: lastWindowActive,
    costDriftRatio: firstWindowMs > 0 ? Math.abs(lastWindowMs - firstWindowMs) / firstWindowMs : 0,
    costPerParticleDriftRatio: perParticleDrift(
      firstWindowMs / windowTicks,
      firstWindowActive,
      lastWindowMs / windowTicks,
      lastWindowActive,
    ),
    finalClusteredFraction: last.clusteredFraction,
    finalMeanSpeed: last.meanSpeed,
    primaryReason: classification.primary,
  };
}

function perParticleDrift(
  firstMsPerTick: number,
  firstActive: number,
  lastMsPerTick: number,
  lastActive: number,
): number {
  if (firstActive <= 0 || lastActive <= 0) return 0;
  const first = firstMsPerTick / firstActive;
  const last = lastMsPerTick / lastActive;
  return first > 0 ? Math.abs(last - first) / first : 0;
}

function isSampleFinite(...values: readonly number[]): boolean {
  return values.every((value) => Number.isFinite(value));
}

/**
 * Parmak izi parçacık dizilerinin BAYTLARINDAN çıkar. Özet metrikleri
 * karşılaştırmak yetmezdi: iki farklı durum aynı ortalamayı verebilir.
 */
export function fingerprintWorld(world: LifeWorld): string {
  const particles = world.particles;
  let hash = 0x811c9dc5 >>> 0;
  const mix = (value: number): void => {
    hash = Math.imul(hash ^ (value >>> 0), 0x01000193) >>> 0;
  };
  const view = new DataView(new ArrayBuffer(8));
  for (let slot = 0; slot < particles.capacity; slot++) {
    mix(particles.active[slot]);
    if (particles.active[slot] === 0) continue;
    mix(particles.stableId[slot]);
    mix(particles.type[slot]);
    for (const value of [
      particles.x[slot],
      particles.y[slot],
      particles.vx[slot],
      particles.vy[slot],
    ]) {
      view.setFloat64(0, value);
      mix(view.getUint32(0));
      mix(view.getUint32(4));
    }
  }
  mix(world.reservoir.voidLossTotal);
  mix(world.tick);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
