import {
  cloneSubstrateCandidate,
  digestSubstrateCandidate,
  type SubstrateCandidate,
} from '@/config/candidate';
import type { QualificationArtefact } from './qualification';
import { isQualified } from './qualification';

export interface PromotionDecision {
  readonly promoted: boolean;
  readonly candidate: SubstrateCandidate;
  readonly candidateDigest: string;
  readonly artefactDigest: string;
  readonly reason: string;
}

export interface PromotionRecord {
  readonly candidate: SubstrateCandidate;
  readonly candidateDigest: string;
  readonly sourceArtefact: QualificationArtefact;
  readonly promotedAtMs: number;
}

export class PromotionFlow {
  private readonly promoted: PromotionRecord[] = [];

  evaluate(artefact: QualificationArtefact): PromotionDecision {
    const candidate =
      typeof artefact.candidate === 'string'
        ? (JSON.parse(artefact.candidate as string) as SubstrateCandidate)
        : cloneSubstrateCandidate(artefact.candidate);
    const candidateDigest = digestSubstrateCandidate(candidate);
    if (!isQualified(artefact)) {
      return {
        promoted: false,
        candidate,
        candidateDigest,
        artefactDigest: artefact.configDigest,
        reason: 'Aday kalifiye değil: faz, red veya insan onayı eksik.',
      };
    }
    if (this.promoted.some((r) => r.candidateDigest === candidateDigest)) {
      return {
        promoted: false,
        candidate,
        candidateDigest,
        artefactDigest: artefact.configDigest,
        reason: 'Aday zaten promotion listesinde.',
      };
    }
    this.promoted.push({
      candidate: cloneSubstrateCandidate(candidate),
      candidateDigest,
      sourceArtefact: artefact,
      promotedAtMs: Date.now(),
    });
    return {
      promoted: true,
      candidate,
      candidateDigest,
      artefactDigest: artefact.configDigest,
      reason: "Aday kalifiye ve onaylı; production'a taşındı.",
    };
  }

  get promotedCandidates(): readonly PromotionRecord[] {
    return this.promoted;
  }

  hasCandidate(candidateDigest: string): boolean {
    return this.promoted.some((r) => r.candidateDigest === candidateDigest);
  }

  exportPromotedCandidate(index: number): SubstrateCandidate | null {
    const record = this.promoted[index];
    return record ? cloneSubstrateCandidate(record.candidate) : null;
  }
}
