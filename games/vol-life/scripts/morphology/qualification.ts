import {
  digestSubstrateCandidate,
  parseSubstrateCandidate,
  serializeSubstrateCandidate,
  type SubstrateCandidate,
} from '@/config/candidate';
import { particleConfig } from '@/config/particles';
import { fingerprintSubstrateConfig, type SubstrateConfig } from '@/config/substrate';
import type { MorphologySample } from './metrics';
import type { CandidateAggregation } from './phaseClassifier';
import type { PerturbationResult } from './perturbation';

/**
 * v3 (E11): artefakt tek bir seed'in fazını değil ADAY TOPLAMASINI taşır.
 * Karar çoğunlukla verilir; v2'nin `phase` alanı plurality ile seçilmiş bir
 * seed'in sınıflandırmasıydı ve aday hakkında yanlış bir şey söylüyordu.
 */
export const ARTEFACT_SCHEMA_VERSION = 3;

/**
 * Artefakt JSON'a YAZILMAK için vardır, o yüzden aday burada nesne değil
 * KANONİK METİNDİR. v1 şeması alanı `SubstrateCandidate` diye tiplendirip
 * içine string koyuyordu (`as unknown as`); bu yalan, tüketicilerde
 * `typeof === 'string'` ikili dallarını ve doğrulamasız `JSON.parse` yolunu
 * doğuruyordu. Aday artefakttan yalnız `parseQualificationArtefact` ile,
 * doğrulanarak çıkar.
 */
export interface QualificationArtefact {
  readonly schemaVersion: typeof ARTEFACT_SCHEMA_VERSION;
  readonly sourceRevision: string;
  readonly configDigest: string;
  readonly candidate: string;
  readonly candidateDigest: string;
  readonly corpus: readonly number[];
  readonly phase: CandidateAggregation;
  readonly timeSeries: readonly MorphologySample[];
  readonly perturbationResults: readonly PerturbationResult[];
  readonly rejectionReasons: readonly string[];
  readonly humanAcceptance: 'pending' | 'accepted' | 'rejected';
  readonly createdAtMs: number;
  readonly budget: QualificationBudget;
}

export interface QualificationBudget {
  readonly broadSeconds: number;
  readonly refinementSeconds: number;
  readonly qualificationSeconds: number;
  readonly totalSeedCount: number;
}

export function createQualificationArtefact(
  config: SubstrateConfig,
  candidate: SubstrateCandidate,
  corpus: readonly number[],
  phase: CandidateAggregation,
  timeSeries: readonly MorphologySample[],
  perturbationResults: readonly PerturbationResult[],
  rejectionReasons: readonly string[],
  budget: QualificationBudget,
  sourceRevision = 'unknown',
): QualificationArtefact {
  return {
    schemaVersion: ARTEFACT_SCHEMA_VERSION,
    sourceRevision,
    configDigest: fingerprintSubstrateConfig(config),
    candidate: serializeSubstrateCandidate(candidate),
    candidateDigest: digestSubstrateCandidate(candidate),
    corpus,
    phase,
    timeSeries,
    perturbationResults,
    rejectionReasons,
    humanAcceptance: 'pending',
    createdAtMs: Date.now(),
    budget,
  };
}

export function isQualified(artefact: QualificationArtefact): boolean {
  if (!artefact.phase.structured || artefact.phase.failed) return false;
  if (artefact.rejectionReasons.length > 0) return false;
  if (artefact.humanAcceptance !== 'accepted') return false;
  const last = artefact.timeSeries[artefact.timeSeries.length - 1];
  if (!last || last.activeCount === 0) return false;
  if (last.stalledFraction > 0.5) return false;
  if (last.clusterCompactness < 0.3) return false;
  if (last.meanSpeed < 0.05) return false;
  const recovered = artefact.perturbationResults.every((r) => r.recovered);
  if (!recovered) return false;
  return true;
}

export function serializeArtefact(artefact: QualificationArtefact): string {
  return JSON.stringify(artefact);
}

/** Artefakttan adayı çıkarmanın TEK yolu; gömülü metin doğrulanarak çözülür. */
export function readArtefactCandidate(
  artefact: QualificationArtefact,
  particleRadiusUnits = particleConfig.radiusUnits,
): SubstrateCandidate {
  return parseSubstrateCandidate(artefact.candidate, particleRadiusUnits);
}

/**
 * JSON'dan artefakt okumanın tek girişi. Eski şema (v1) AÇIKÇA reddedilir:
 * v1'de aday alanı nesne olabiliyordu ve doğrulanmadan promotion'a geçiyordu.
 */
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
  if (!Array.isArray(raw.corpus) || !Array.isArray(raw.timeSeries)) {
    throw new RangeError('Artefakt korpus ve zaman serisi taşımalı.');
  }
  const candidate = parseSubstrateCandidate(raw.candidate, particleRadiusUnits);
  if (digestSubstrateCandidate(candidate) !== raw.candidateDigest) {
    throw new RangeError('Artefakt digest’i gömülü adayla uyuşmuyor.');
  }
  return raw as unknown as QualificationArtefact;
}
