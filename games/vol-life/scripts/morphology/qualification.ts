import {
  digestSubstrateCandidate,
  parseSubstrateCandidate,
  serializeSubstrateCandidate,
  type ExperimentScenario,
  type SubstrateCandidate,
} from '@/config/candidate';
import { particleConfig } from '@/config/particles';
import { fingerprintSubstrateConfig, type SubstrateConfig } from '@/config/substrate';
import type { MorphologySample } from './metrics';
import type { CandidateAggregation } from './phaseClassifier';
import type { PerturbationResult } from './perturbation';
import type { SourceState } from './sourceState';

/**
 * v4 (E12): artefakt koşunun KAYNAĞINI ve MALİYETİNİ de taşır.
 *
 * v3'te zaman serisi bütün seed'ler için tek diziye düzleştiriliyordu ve seed
 * sınırları kayboluyordu; bütçeler sıfır kalıyordu; kirli ağaçta koşulan bir
 * araştırma temiz koşudan ayırt edilemiyordu.
 */
export const ARTEFACT_SCHEMA_VERSION = 4;

export type HumanDecision = 'pending' | 'accepted' | 'rejected';

/** Bir iş biriminin ÖLÇÜLMÜŞ maliyeti; tahmin değil. */
export interface WorkUnitBudget {
  readonly workId: string;
  readonly wallClockMs: number;
  readonly ticks: number;
  readonly msPerTick: number;
}

export interface StageBudget {
  readonly stage: string;
  readonly wallClockMs: number;
  readonly ticks: number;
  readonly msPerTick: number;
  readonly workUnits: readonly WorkUnitBudget[];
}

/** Seed sınırları KORUNUR; düzleştirilmiş seri hangi seed'in ne yaptığını gizler. */
export interface SeedTimeSeries {
  readonly seed: number;
  readonly samples: readonly MorphologySample[];
}

export interface QualificationArtefact {
  readonly schemaVersion: typeof ARTEFACT_SCHEMA_VERSION;
  readonly sourceRevision: string;
  readonly sourceDirty: boolean;
  /** Kirli ağaçta koşulan araştırma promotion üretemez. */
  readonly eligibleForPromotion: boolean;
  readonly configDigest: string;
  readonly candidate: string;
  readonly candidateDigest: string;
  readonly scenario: ExperimentScenario;
  readonly corpusId: string;
  readonly corpus: readonly number[];
  readonly phase: CandidateAggregation;
  readonly seedTimeSeries: readonly SeedTimeSeries[];
  readonly perturbationResults: readonly PerturbationResult[];
  readonly rejectionReasons: readonly string[];
  readonly budgets: readonly StageBudget[];
  /** İkisi de bu koşuda `pending` kalır; karar ASLA uydurulmaz (E12). */
  readonly humanPreselection: HumanDecision;
  readonly humanAcceptance: HumanDecision;
  readonly createdAtMs: number;
}

export interface ArtefactInput {
  readonly config: SubstrateConfig;
  readonly candidate: SubstrateCandidate;
  readonly corpus: readonly number[];
  readonly phase: CandidateAggregation;
  readonly seedTimeSeries: readonly SeedTimeSeries[];
  readonly perturbationResults: readonly PerturbationResult[];
  readonly rejectionReasons: readonly string[];
  readonly budgets: readonly StageBudget[];
  readonly source: SourceState;
}

export function createQualificationArtefact(input: ArtefactInput): QualificationArtefact {
  return {
    schemaVersion: ARTEFACT_SCHEMA_VERSION,
    sourceRevision: input.source.revision,
    sourceDirty: input.source.dirty,
    eligibleForPromotion: input.source.eligibleForPromotion,
    configDigest: fingerprintSubstrateConfig(input.config),
    candidate: serializeSubstrateCandidate(input.candidate),
    candidateDigest: digestSubstrateCandidate(input.candidate),
    scenario: input.candidate.scenario,
    corpusId: digestCorpus(input.corpus),
    corpus: input.corpus,
    phase: input.phase,
    seedTimeSeries: input.seedTimeSeries,
    perturbationResults: input.perturbationResults,
    rejectionReasons: input.rejectionReasons,
    budgets: input.budgets,
    humanPreselection: 'pending',
    humanAcceptance: 'pending',
    createdAtMs: Date.now(),
  };
}

/** Korpus kimliği seed listesinin kendisinden çıkar; sıra anlamlıdır. */
export function digestCorpus(corpus: readonly number[]): string {
  let hash = 0x811c9dc5;
  for (const seed of corpus) {
    for (const part of [seed & 0xffff, (seed >>> 16) & 0xffff]) {
      hash = Math.imul(hash ^ part, 0x01000193) >>> 0;
    }
  }
  return `corpus-${corpus.length}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function isQualified(artefact: QualificationArtefact): boolean {
  // Kirli kaynaktan çıkan artefakt hiçbir koşulda promotion üretemez.
  if (!artefact.eligibleForPromotion) return false;
  if (!artefact.phase.structured || artefact.phase.failed) return false;
  if (artefact.rejectionReasons.length > 0) return false;
  if (artefact.humanAcceptance !== 'accepted') return false;
  const lastSeries = artefact.seedTimeSeries[artefact.seedTimeSeries.length - 1];
  const last = lastSeries?.samples[lastSeries.samples.length - 1];
  if (!last || last.activeCount === 0) return false;
  if (last.stalledFraction > 0.5) return false;
  if (last.clusterCompactness < 0.3) return false;
  if (last.meanSpeed < 0.05) return false;
  return artefact.perturbationResults.every((result) => result.recovered);
}

export function serializeArtefact(artefact: QualificationArtefact): string {
  return JSON.stringify(artefact);
}

/**
 * Ölçülmüş süreler koşudan koşuya değişir; seri ve paralel koşuların EŞİTLİĞİ
 * bu alanlar sıfırlanarak karşılaştırılır. Sıfırlanan şey sonuç değil ölçümdür.
 */
export function stripTimings(artefact: QualificationArtefact): QualificationArtefact {
  return {
    ...artefact,
    createdAtMs: 0,
    budgets: artefact.budgets.map((budget) => ({
      ...budget,
      wallClockMs: 0,
      msPerTick: 0,
      workUnits: budget.workUnits.map((unit) => ({ ...unit, wallClockMs: 0, msPerTick: 0 })),
    })),
  };
}

/** Artefakttan adayı çıkarmanın TEK yolu; gömülü metin doğrulanarak çözülür. */
export function readArtefactCandidate(
  artefact: QualificationArtefact,
  particleRadiusUnits = particleConfig.radiusUnits,
): SubstrateCandidate {
  return parseSubstrateCandidate(artefact.candidate, particleRadiusUnits);
}

/** JSON'dan artefakt okumanın tek girişi; eski şemalar AÇIKÇA reddedilir. */
export function parseQualificationArtefact(
  serialized: string,
  particleRadiusUnits = particleConfig.radiusUnits,
): QualificationArtefact {
  const raw = JSON.parse(serialized) as Record<string, unknown>;
  if (raw.schemaVersion !== ARTEFACT_SCHEMA_VERSION) {
    throw new RangeError(
      `Artefakt şeması bu çalışma zamanına ait değil: ${String(raw.schemaVersion)}`,
    );
  }
  if (typeof raw.candidate !== 'string') {
    throw new RangeError('Artefakt adayı kanonik METİN taşımalı.');
  }
  if (typeof raw.candidateDigest !== 'string' || typeof raw.configDigest !== 'string') {
    throw new RangeError('Artefakt digest alanları metin olmalı.');
  }
  if (typeof raw.sourceRevision !== 'string' || typeof raw.sourceDirty !== 'boolean') {
    throw new RangeError('Artefakt kaynak durumunu taşımalı.');
  }
  if (!Array.isArray(raw.corpus) || !Array.isArray(raw.seedTimeSeries)) {
    throw new RangeError('Artefakt korpus ve seed başına zaman serisi taşımalı.');
  }
  const candidate = parseSubstrateCandidate(raw.candidate, particleRadiusUnits);
  if (digestSubstrateCandidate(candidate) !== raw.candidateDigest) {
    throw new RangeError('Artefakt digest’i gömülü adayla uyuşmuyor.');
  }
  return raw as unknown as QualificationArtefact;
}
