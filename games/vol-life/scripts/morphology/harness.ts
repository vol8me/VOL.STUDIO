import {
  cloneSubstrateCandidate,
  defaultSubstrateCandidate,
  digestSubstrateCandidate,
  type SubstrateCandidate,
} from '@/config/candidate';
import { substrateConfig, type SubstrateConfig } from '@/config/substrate';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { GenomeSampler, defaultSamplerOptions, type GenomeSamplerOptions } from './genomeSampler';
import { MorphologyMetrics, type MorphologyMetricsConfig } from './metrics';
import { ClusterTracker, type ClusterTrackerConfig } from './clusterTracker';
import {
  PhaseClassifier,
  type PhaseClassifierConfig,
  type PhaseClassification,
} from './phaseClassifier';
import { PerturbationSystem, type PerturbationConfig, type PerturbationSpec } from './perturbation';
import { generateSeedCorpus, type ShardSpec } from './shards';
import {
  createQualificationArtefact,
  type QualificationArtefact,
  type QualificationBudget,
} from './qualification';
import { PromotionFlow } from './promotion';

export type ResearchStage = 'broad' | 'refinement' | 'qualification';

export interface ResearchStageConfig {
  readonly tickCount: number;
  readonly seedCount: number;
  readonly sampleInterval: number;
}

export interface ResearchHarnessConfig {
  readonly baseCandidate: SubstrateCandidate;
  readonly substrate: SubstrateConfig;
  readonly sampler: GenomeSamplerOptions;
  readonly metrics: MorphologyMetricsConfig;
  readonly cluster: ClusterTrackerConfig;
  readonly phase: PhaseClassifierConfig;
  readonly perturbation: PerturbationConfig;
  readonly broad: ResearchStageConfig;
  readonly refinement: ResearchStageConfig;
  readonly qualification: ResearchStageConfig;
  readonly candidateCount: number;
  readonly perturbationSpecs: readonly PerturbationSpec[];
}

export const defaultHarnessConfig: ResearchHarnessConfig = {
  baseCandidate: defaultSubstrateCandidate,
  substrate: substrateConfig,
  sampler: defaultSamplerOptions,
  metrics: {
    stalledSpeedThreshold: 0.05,
    neighborRadiusUnits: 48,
    fringeDistanceThreshold: 32,
    voidDistanceThreshold: 0,
    autocorrelationLag: 60,
  },
  cluster: {
    epsUnits: 32,
    minPts: 3,
    minClusterSize: 4,
    minContinuityTicks: 30,
    maxGapTicks: 10,
    overlapThreshold: 0.5,
    centroidGateUnits: 64,
    sizeRatioGate: 3,
    sampleIntervalTicks: 10,
  },
  phase: {
    deadActiveThreshold: 0.05,
    stasisSpeedThreshold: 0.02,
    stasisDurationTicks: 60,
    crystalCompactnessThreshold: 0.85,
    crystalSpeedThreshold: 0.01,
    blobCompactnessThreshold: 0.9,
    blobMinFraction: 0.7,
    voidLossDominantFraction: 0.5,
    orbitAutocorrelationThreshold: 0.8,
    orbitMinSpeed: 0.3,
    speedChaosMinSpeed: 1.5,
    speedChaosCompactnessThreshold: 0.2,
    structuredCompactnessMin: 0.3,
    structuredSpeedMin: 0.05,
  },
  perturbation: {
    recoveryThreshold: 0.15,
    maxRecoveryTicks: 300,
  },
  broad: { tickCount: 1800, seedCount: 4, sampleInterval: 30 },
  refinement: { tickCount: 7200, seedCount: 16, sampleInterval: 60 },
  qualification: { tickCount: 18000, seedCount: 32, sampleInterval: 60 },
  candidateCount: 30,
  perturbationSpecs: [
    { kind: 'velocity-kick', magnitude: 2, targetFraction: 0.3, tick: 0 },
    { kind: 'position-shift', magnitude: 40, targetFraction: 0.2, tick: 0 },
    { kind: 'matter-removal', magnitude: 0, targetFraction: 0.1, tick: 0 },
  ],
};

export interface CandidateResult {
  readonly candidate: SubstrateCandidate;
  readonly candidateDigest: string;
  readonly phase: PhaseClassification;
  readonly seedResults: readonly SeedResult[];
  readonly structured: boolean;
}

interface SeedResult {
  readonly seed: number;
  readonly phase: PhaseClassification;
  readonly finalSample: import('./metrics').MorphologySample;
}

export class ResearchHarness {
  private readonly config: ResearchHarnessConfig;
  private readonly sampler: GenomeSampler;
  private readonly metrics: MorphologyMetrics;
  private readonly cluster: ClusterTracker;
  private readonly classifier: PhaseClassifier;
  private readonly perturbation: PerturbationSystem;
  private readonly promotion = new PromotionFlow();

  constructor(config: Partial<ResearchHarnessConfig> = {}) {
    this.config = { ...defaultHarnessConfig, ...config };
    this.sampler = new GenomeSampler(this.config.sampler);
    this.metrics = new MorphologyMetrics(this.config.metrics);
    this.cluster = new ClusterTracker(this.config.cluster);
    this.classifier = new PhaseClassifier(this.config.phase);
    this.perturbation = new PerturbationSystem(this.config.perturbation);
  }

  runBroad(): CandidateResult[] {
    const candidates = this.sampler.sampleCorpus(
      this.config.baseCandidate,
      this.config.candidateCount,
    );
    const results: CandidateResult[] = [];
    for (const candidate of candidates) {
      const result = this.evaluateCandidate(candidate, this.config.broad);
      results.push(result);
    }
    return results;
  }

  runRefinement(candidates: CandidateResult[]): CandidateResult[] {
    const structured = candidates.filter((c) => c.structured);
    const results: CandidateResult[] = [];
    for (const candidate of structured) {
      const result = this.evaluateCandidate(candidate.candidate, this.config.refinement);
      results.push(result);
    }
    return results;
  }

  runQualification(candidates: CandidateResult[]): QualificationArtefact[] {
    const structured = candidates.filter((c) => c.structured);
    const artefacts: QualificationArtefact[] = [];
    for (const candidate of structured) {
      const artefact = this.runQualificationCandidate(candidate.candidate);
      artefacts.push(artefact);
    }
    return artefacts;
  }

  evaluateCandidate(candidate: SubstrateCandidate, stage: ResearchStageConfig): CandidateResult {
    const seeds = generateSeedCorpus(0, stage.seedCount);
    const seedResults: SeedResult[] = [];
    for (const seed of seeds) {
      const world = this.createWorld(candidate, seed);
      const initialActive = world.particles.activeCount;
      this.metrics.reset();
      this.cluster.reset();
      for (let tick = 0; tick < stage.tickCount; tick++) {
        world.step();
        if (tick % stage.sampleInterval === 0) {
          this.metrics.sample(world.particles, world.domain, tick, world.reservoir.voidLossTotal);
          this.cluster.update(world.particles, tick);
        }
      }
      const phase = this.classifier.classify(this.metrics.timeSeries, initialActive);
      const finalSample = this.metrics.timeSeries[this.metrics.timeSeries.length - 1];
      seedResults.push({ seed, phase, finalSample });
    }
    const dominantPhase = this.dominantPhase(seedResults);
    return {
      candidate: cloneSubstrateCandidate(candidate),
      candidateDigest: digestSubstrateCandidate(candidate),
      phase: dominantPhase,
      seedResults,
      structured: dominantPhase.phase === 'dynamic-structured',
    };
  }

  runQualificationCandidate(candidate: SubstrateCandidate): QualificationArtefact {
    const seeds = generateSeedCorpus(0, this.config.qualification.seedCount);
    const seedResults: SeedResult[] = [];
    const allTimeSeries: import('./metrics').MorphologySample[][] = [];
    const allPerturbationResults: import('./perturbation').PerturbationResult[] = [];
    const rejectionReasons: string[] = [];
    for (const seed of seeds) {
      const world = this.createWorld(candidate, seed);
      const initialActive = world.particles.activeCount;
      this.metrics.reset();
      this.cluster.reset();
      for (let tick = 0; tick < this.config.qualification.tickCount; tick++) {
        world.step();
        if (tick % this.config.qualification.sampleInterval === 0) {
          this.metrics.sample(world.particles, world.domain, tick, world.reservoir.voidLossTotal);
          this.cluster.update(world.particles, tick);
        }
      }
      const phase = this.classifier.classify(this.metrics.timeSeries, initialActive);
      const finalSample = this.metrics.timeSeries[this.metrics.timeSeries.length - 1];
      seedResults.push({ seed, phase, finalSample });
      allTimeSeries.push([...this.metrics.timeSeries]);
      if (phase.phase !== 'dynamic-structured') {
        rejectionReasons.push(`seed ${seed}: faz ${phase.phase} (${phase.reasons.join('; ')})`);
      }
      for (const spec of this.config.perturbationSpecs) {
        const preState = this.perturbation.snapshot(world.particles);
        this.perturbation.apply(world, world.particles, spec);
        const result = this.perturbation.measure(world, world.particles, spec, preState);
        allPerturbationResults.push(result);
        if (!result.recovered) {
          rejectionReasons.push(`seed ${seed}: perturbation (${spec.kind}) recovery başarısız`);
        }
      }
    }
    const dominantPhase = this.dominantPhase(seedResults);
    const flatTimeSeries = allTimeSeries.flat();
    const budget: QualificationBudget = {
      broadSeconds: 0,
      refinementSeconds: 0,
      qualificationSeconds: 0,
      totalSeedCount: seeds.length,
    };
    return createQualificationArtefact(
      this.config.substrate,
      candidate,
      seeds,
      dominantPhase,
      flatTimeSeries,
      allPerturbationResults,
      rejectionReasons,
      budget,
    );
  }

  get promotionFlow(): PromotionFlow {
    return this.promotion;
  }

  private createWorld(candidate: SubstrateCandidate, seed: number): LifeWorld {
    const config = {
      ...this.config.substrate,
      candidate: cloneSubstrateCandidate(candidate),
    };
    const metadata = createExplicitWorldMetadata(seed);
    return new LifeWorld(config, metadata);
  }

  private dominantPhase(seedResults: SeedResult[]): PhaseClassification {
    const counts = new Map<string, number>();
    for (const result of seedResults) {
      const key = result.phase.phase;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let bestPhase = 'dead';
    let bestCount = 0;
    for (const [phase, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        bestPhase = phase;
      }
    }
    const best = seedResults.find((r) => r.phase.phase === bestPhase);
    return best?.phase ?? { phase: 'dead', confidence: 0, reasons: ['dominant faz bulunamadı'] };
  }
}
