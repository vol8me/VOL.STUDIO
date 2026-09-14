import { digestPhysicsGenome, serializePhysicsGenome, type PhysicsGenome } from '@/config/genome';
import { fingerprintSubstrateConfig, type SubstrateConfig } from '@/config/substrate';
import type { MorphologySample } from './metrics';
import type { PhaseClassification } from './phaseClassifier';
import type { PerturbationResult } from './perturbation';

export interface QualificationArtefact {
  readonly schemaVersion: 1;
  readonly sourceRevision: string;
  readonly configDigest: string;
  readonly genome: PhysicsGenome;
  readonly genomeDigest: string;
  readonly corpus: readonly number[];
  readonly phase: PhaseClassification;
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
  genome: PhysicsGenome,
  corpus: readonly number[],
  phase: PhaseClassification,
  timeSeries: readonly MorphologySample[],
  perturbationResults: readonly PerturbationResult[],
  rejectionReasons: readonly string[],
  budget: QualificationBudget,
  sourceRevision = 'unknown',
): QualificationArtefact {
  return {
    schemaVersion: 1,
    sourceRevision,
    configDigest: fingerprintSubstrateConfig(config),
    genome: serializePhysicsGenome(genome) as unknown as PhysicsGenome,
    genomeDigest: digestPhysicsGenome(genome),
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
  if (artefact.phase.phase !== 'dynamic-structured') return false;
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
  return JSON.stringify({
    ...artefact,
    genome: serializePhysicsGenome(
      typeof artefact.genome === 'string'
        ? (JSON.parse(artefact.genome as string) as PhysicsGenome)
        : artefact.genome,
    ),
  });
}
