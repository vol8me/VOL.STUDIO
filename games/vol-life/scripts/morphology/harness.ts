import {
  cloneSubstrateCandidate,
  serializeSubstrateCandidate,
  defaultSubstrateCandidate,
  digestSubstrateCandidate,
  type SubstrateCandidate,
} from '@/config/candidate';
import {
  fingerprintSubstrateConfig,
  substrateConfig,
  type SubstrateConfig,
} from '@/config/substrate';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { GenomeSampler, defaultSamplerOptions, type GenomeSamplerOptions } from './genomeSampler';
import { MorphologyMetrics, type MorphologyMetricsConfig } from './metrics';
import { ClusterTracker, type ClusterTrackerConfig } from './clusterTracker';
import {
  PhaseClassifier,
  type PhaseClassifierConfig,
  aggregateSeedVerdicts,
  defaultPhaseConfig,
  isStructured,
  type CandidateAggregation,
  type PhaseClassification,
} from './phaseClassifier';
import {
  PerturbationSystem,
  defaultPerturbationConfig,
  type PerturbationConfig,
  type PerturbationSpec,
} from './perturbation';
import { computeWorkId, generateSeedCorpus, type ShardSpec } from './shards';
import {
  createQualificationArtefact,
  type QualificationArtefact,
  type SeedTimeSeries,
  type StageBudget,
  type WorkUnitBudget,
} from './qualification';
import { CheckpointStore } from './checkpoint';
import { PromotionFlow } from './promotion';
import { runSeedUnits, type PoolUnit } from './workerPool';
import type { SeedUnitOutput } from './seedRunner';
import {
  createGitProvider,
  readSourceState,
  type GitProvider,
  type SourceState,
} from './sourceState';
import { resolveMorphologyScope } from './scenario';

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
  /** R1 seeding araştırması; broad'dan ayrı ve daha kısa. */
  readonly seeding: ResearchStageConfig;
  readonly broad: ResearchStageConfig;
  readonly refinement: ResearchStageConfig;
  readonly qualification: ResearchStageConfig;
  /** Geç çöküş kanaryası; yalnız açıkça istendiğinde koşar. */
  readonly canary: ResearchStageConfig;
  readonly candidateCount: number;
  /** Enjekte edilebilir; testler sahte sağlayıcıyla ve gerçek depoyla koşar. */
  readonly gitProvider?: GitProvider;
  /** 1 = seri. Paralel koşu AYNI `runSeedUnit` fonksiyonunu çağırır. */
  readonly workerCount: number;
  /** Checkpoint dizini; verilmezse koşu sürdürülebilir olmaz. */
  readonly outputDir?: string;
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
    minEdgeDistanceUnits: defaultSubstrateCandidate.void.widthUnits,
    fringeWidthUnits: defaultSubstrateCandidate.void.widthUnits,
    maxSpeedUnitsPerReferenceTick:
      defaultSubstrateCandidate.physics.dynamics.maxSpeedUnitsPerReferenceTick,
    trajectoryLagSeconds: 1,
    fixedStepMs: 1000 / 60,
    sampleIntervalTicks: 10,
    recurrenceRadiusUnits: 8,
    topClusterCount: 5,
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
  phase: defaultPhaseConfig,
  perturbation: defaultPerturbationConfig,
  seeding: { tickCount: 1800, seedCount: 4, sampleInterval: 10 },
  broad: { tickCount: 1800, seedCount: 4, sampleInterval: 30 },
  refinement: { tickCount: 7200, seedCount: 16, sampleInterval: 60 },
  qualification: { tickCount: 18000, seedCount: 32, sampleInterval: 60 },
  canary: { tickCount: 216000, seedCount: 4, sampleInterval: 60 },
  candidateCount: 30,
  workerCount: 1,
  perturbationSpecs: [
    { kind: 'velocity-kick', magnitude: 2, targetFraction: 0.3, tick: 0 },
    { kind: 'position-shift', magnitude: 40, targetFraction: 0.2, tick: 0 },
    { kind: 'matter-removal', magnitude: 0, targetFraction: 0.1, tick: 0 },
  ],
};

export interface CandidateResult {
  readonly candidate: SubstrateCandidate;
  readonly candidateDigest: string;
  /** Aday kararı ÇOĞUNLUKLA verilir; tek bir seed'in fazı değildir (E11). */
  readonly aggregation: CandidateAggregation;
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
  private metrics: MorphologyMetrics;
  private readonly cluster: ClusterTracker;
  private readonly classifier: PhaseClassifier;
  private readonly perturbation: PerturbationSystem;
  private readonly promotion = new PromotionFlow();
  private readonly stageBudgets: StageBudget[] = [];
  private readonly gitProvider: GitProvider;
  private cachedSource: SourceState | undefined;

  constructor(config: Partial<ResearchHarnessConfig> = {}) {
    this.config = { ...defaultHarnessConfig, ...config };
    this.sampler = new GenomeSampler(this.config.sampler);
    this.metrics = new MorphologyMetrics(this.config.metrics);
    this.cluster = new ClusterTracker(this.config.cluster);
    this.classifier = new PhaseClassifier(this.config.phase);
    this.perturbation = new PerturbationSystem(this.config.perturbation);
    this.gitProvider = this.config.gitProvider ?? createGitProvider(process.cwd());
  }

  /**
   * Senaryo ADAY BAŞINA değişir, kapsam da öyle. Ölçüm nesnesi bu yüzden her
   * aday koşusunun başında yeniden kurulur: senaryo körü tek bir metrik
   * nesnesi intrinsic koşuyu fringe maddesiyle kirletirdi (E10).
   */
  private scopeMetricsFor(candidate: SubstrateCandidate): void {
    const scope = resolveMorphologyScope(candidate.scenario, candidate.void);
    this.metrics = new MorphologyMetrics({
      ...this.config.metrics,
      minEdgeDistanceUnits: scope.minEdgeDistanceUnits,
      fringeWidthUnits: candidate.void.widthUnits,
      maxSpeedUnitsPerReferenceTick: candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick,
    });
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

  async runQualification(candidates: CandidateResult[]): Promise<QualificationArtefact[]> {
    const structured = candidates.filter((c) => c.structured);
    const artefacts: QualificationArtefact[] = [];
    for (const candidate of structured) {
      const artefact = await this.runQualificationCandidate(candidate.candidate);
      artefacts.push(artefact);
    }
    return artefacts;
  }

  evaluateCandidate(
    candidate: SubstrateCandidate,
    stage: ResearchStageConfig,
    stageName = 'broad',
  ): CandidateResult {
    this.scopeMetricsFor(candidate);
    const digest = digestSubstrateCandidate(candidate);
    const seeds = generateSeedCorpus(0, stage.seedCount);
    const seedResults: SeedResult[] = [];
    const workUnits: WorkUnitBudget[] = [];
    const stageStart = now();
    for (const seed of seeds) {
      const unitStart = now();
      const world = this.createWorld(candidate, seed);
      const initialActive = world.particles.activeCount;
      this.metrics.reset();
      this.cluster.reset();
      for (let tick = 0; tick < stage.tickCount; tick++) {
        world.step();
        if (tick % stage.sampleInterval === 0) {
          // Tracker ÖNCE güncellenir; metrikler onun üyeliğinden beslenir (E5).
          this.cluster.update(world.particles, tick);
          this.metrics.sample(
            world.particles,
            world.domain,
            tick,
            world.reservoir.voidLossTotal,
            this.cluster.activeClusters,
          );
        }
      }
      const phase = this.classifier.classify(this.metrics.timeSeries, initialActive);
      const finalSample = this.metrics.timeSeries[this.metrics.timeSeries.length - 1];
      seedResults.push({ seed, phase, finalSample });
      workUnits.push(
        measureWorkUnit(
          computeWorkId({
            phase: stageName === 'refinement' ? 'refinement' : 'broad',
            genomeDigest: digest,
            seed,
          }),
          unitStart,
          stage.tickCount,
        ),
      );
    }
    this.stageBudgets.push(stageBudget(stageName, stageStart, workUnits));
    const aggregation = aggregateSeedVerdicts(seedResults.map((result) => result.phase));
    return {
      candidate: cloneSubstrateCandidate(candidate),
      candidateDigest: digestSubstrateCandidate(candidate),
      aggregation,
      seedResults,
      structured: isStructured(aggregation),
    };
  }

  async runQualificationCandidate(candidate: SubstrateCandidate): Promise<QualificationArtefact> {
    const digest = digestSubstrateCandidate(candidate);
    const seeds = generateSeedCorpus(0, this.config.qualification.seedCount);
    const candidateText = serializeSubstrateCandidate(candidate);
    const configDigest = fingerprintSubstrateConfig({ ...this.config.substrate, candidate });
    const units: PoolUnit[] = seeds.map((seed) => ({
      workId: computeWorkId({ phase: 'qualification', genomeDigest: digest, seed }),
      input: {
        substrate: this.config.substrate,
        candidateText,
        seed,
        tickCount: this.config.qualification.tickCount,
        sampleInterval: this.config.qualification.sampleInterval,
        metrics: this.config.metrics,
        cluster: this.config.cluster,
        phase: this.config.phase,
        perturbation: this.config.perturbation,
        perturbationSpecs: this.config.perturbationSpecs,
      },
    }));

    const store = this.config.outputDir
      ? new CheckpointStore<SeedUnitOutput>(
          `${this.config.outputDir}/qualification-${digest}.jsonl`,
          configDigest,
        )
      : undefined;
    const pending = units.filter((unit) => !store?.has(unit.workId));

    const stageStart = now();
    const computed = await runSeedUnits(pending, this.config.workerCount);
    for (const result of computed) store?.record(result.workId, result.output);
    const stageWallClock = now() - stageStart;

    const outputs = units.map((unit) => {
      const output = store?.get(unit.workId) ?? findOutput(computed, unit.workId);
      if (!output) throw new Error(`İş birimi sonucu bulunamadı: ${unit.workId}`);
      return { workId: unit.workId, output };
    });

    const seedResults: SeedResult[] = [];
    const seedTimeSeries: SeedTimeSeries[] = [];
    const allPerturbationResults: import('./perturbation').PerturbationResult[] = [];
    const rejectionReasons: string[] = [];
    const workUnits: WorkUnitBudget[] = [];
    const meanUnitMs = computed.length > 0 ? stageWallClock / computed.length : 0;
    for (const { workId, output } of outputs) {
      seedResults.push({
        seed: output.seed,
        phase: output.classification,
        finalSample: output.samples[output.samples.length - 1],
      });
      // Seed sınırları KORUNUR; düzleştirmek hangi seed'in ne yaptığını gizlerdi.
      seedTimeSeries.push({ seed: output.seed, samples: output.samples });
      if (output.classification.primary !== 'DYNAMIC_STRUCTURED') {
        rejectionReasons.push(
          `seed ${output.seed}: ${
            output.classification.primary
          } (${output.classification.details.join('; ')})`,
        );
      }
      for (const result of output.perturbations) {
        allPerturbationResults.push(result);
        if (!result.recovered) {
          rejectionReasons.push(
            `seed ${output.seed}: perturbation (${
              result.spec.kind
            }) toparlanmadı [${result.outOfBand.join('; ')}]`,
          );
        }
      }
      workUnits.push({
        workId,
        wallClockMs: meanUnitMs,
        ticks: output.ticks,
        msPerTick: output.ticks > 0 ? meanUnitMs / output.ticks : 0,
      });
    }

    const aggregation = aggregateSeedVerdicts(seedResults.map((result) => result.phase));
    this.stageBudgets.push({
      stage: 'qualification',
      wallClockMs: stageWallClock,
      ticks: workUnits.reduce((sum, unit) => sum + unit.ticks, 0),
      msPerTick:
        workUnits.reduce((sum, unit) => sum + unit.ticks, 0) > 0
          ? stageWallClock / workUnits.reduce((sum, unit) => sum + unit.ticks, 0)
          : 0,
      workUnits,
    });
    return createQualificationArtefact({
      config: this.config.substrate,
      candidate,
      corpus: seeds,
      phase: aggregation,
      seedTimeSeries,
      perturbationResults: allPerturbationResults,
      rejectionReasons,
      budgets: [...this.stageBudgets],
      source: this.sourceState(),
    });
  }

  /** Kaynak durumu koşu başına BİR kez okunur; her artefakt aynı cevabı taşır. */
  sourceState(): SourceState {
    this.cachedSource ??= readSourceState(this.gitProvider);
    return this.cachedSource;
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
}

function now(): number {
  return performance.now();
}

/** Bütçe ÖLÇÜLÜR; sıfır bırakmak maliyeti bilmiyoruz demenin süslü hâli olurdu. */
function measureWorkUnit(workId: string, startMs: number, ticks: number): WorkUnitBudget {
  const wallClockMs = now() - startMs;
  return { workId, wallClockMs, ticks, msPerTick: ticks > 0 ? wallClockMs / ticks : 0 };
}

function stageBudget(
  stage: string,
  startMs: number,
  workUnits: readonly WorkUnitBudget[],
): StageBudget {
  const wallClockMs = now() - startMs;
  const ticks = workUnits.reduce((sum, unit) => sum + unit.ticks, 0);
  return {
    stage,
    wallClockMs,
    ticks,
    msPerTick: ticks > 0 ? wallClockMs / ticks : 0,
    workUnits: [...workUnits],
  };
}

function findOutput(
  results: readonly { workId: string; output: SeedUnitOutput }[],
  workId: string,
) {
  return results.find((result) => result.workId === workId)?.output;
}
