import { parseSubstrateCandidate } from '@/config/candidate';
import { particleConfig } from '@/config/particles';
import type { SubstrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';
import { ClusterTracker, type ClusterTrackerConfig } from './clusterTracker';
import { MorphologyMetrics, type MorphologyMetricsConfig, type MorphologySample } from './metrics';
import {
  PerturbationSystem,
  type PerturbationConfig,
  type PerturbationResult,
  type PerturbationSpec,
} from './perturbation';
import {
  PhaseClassifier,
  type PhaseClassification,
  type PhaseClassifierConfig,
} from './phaseClassifier';
import { resolveMorphologyScope } from './scenario';

/**
 * Bir seed'in BÜTÜN işi tek bir saf fonksiyondadır (E12).
 *
 * Seri koşu ve worker koşusu AYNI kodu çağırır; "paralel sonuç seriyle aynı mı"
 * sorusu böylece kurulumdan gelir, umuda bırakılmaz. Girdi ve çıktı düz veridir:
 * worker sınırından yapısal kopyayla geçer.
 */
export interface SeedUnitInput {
  readonly substrate: SubstrateConfig;
  /** Aday KANONİK METİNDİR; worker sınırından nesne değil metin geçer. */
  readonly candidateText: string;
  readonly seed: number;
  readonly tickCount: number;
  readonly sampleInterval: number;
  readonly metrics: MorphologyMetricsConfig;
  readonly cluster: ClusterTrackerConfig;
  readonly phase: PhaseClassifierConfig;
  readonly perturbation: PerturbationConfig;
  readonly perturbationSpecs: readonly PerturbationSpec[];
}

export interface SeedUnitOutput {
  readonly seed: number;
  readonly classification: PhaseClassification;
  readonly samples: MorphologySample[];
  readonly perturbations: PerturbationResult[];
  /** Bu birimde gerçekten koşulan tick; bütçe bundan çıkar. */
  readonly ticks: number;
}

export function runSeedUnit(input: SeedUnitInput): SeedUnitOutput {
  const candidate = parseSubstrateCandidate(input.candidateText, particleConfig.radiusUnits);
  const config: SubstrateConfig = { ...input.substrate, candidate };
  const scope = resolveMorphologyScope(candidate.scenario, candidate.void);
  const metrics = new MorphologyMetrics({
    ...input.metrics,
    minEdgeDistanceUnits: scope.minEdgeDistanceUnits,
    fringeWidthUnits: candidate.void.widthUnits,
    maxSpeedUnitsPerReferenceTick: candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick,
  });
  const cluster = new ClusterTracker(input.cluster);
  const classifier = new PhaseClassifier({
    ...input.phase,
    maxSpeedUnitsPerReferenceTick: candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick,
  });
  const perturbation = new PerturbationSystem(input.perturbation);

  const world = new LifeWorld(config, createExplicitWorldMetadata(input.seed));
  const initialActive = world.particles.activeCount;
  for (let tick = 0; tick < input.tickCount; tick++) {
    world.step();
    if (tick % input.sampleInterval === 0) {
      // Tracker ÖNCE güncellenir; metrikler onun üyeliğinden beslenir (E5).
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
  const classification = classifier.classify(metrics.timeSeries, initialActive);
  const perturbations =
    input.perturbationSpecs.length > 0 ? perturbation.runAll(world, input.perturbationSpecs) : [];
  const baselineTicks =
    input.perturbationSpecs.length > 0
      ? Math.round((input.perturbation.baselineSeconds * 1000) / input.perturbation.fixedStepMs)
      : 0;
  return {
    seed: input.seed,
    classification,
    samples: [...metrics.timeSeries],
    perturbations,
    ticks:
      input.tickCount +
      baselineTicks +
      perturbations.reduce((sum, result) => sum + result.recoveryTicks, 0),
  };
}
