import { clonePhysicsGenome, type PhysicsGenome } from '@/config/genome';
import { digestPhysicsGenome } from '@/config/genome';
import type { QualificationArtefact } from './qualification';
import { isQualified } from './qualification';

export interface PromotionDecision {
  readonly promoted: boolean;
  readonly genome: PhysicsGenome;
  readonly genomeDigest: string;
  readonly artefactDigest: string;
  readonly reason: string;
}

export interface PromotionRecord {
  readonly genome: PhysicsGenome;
  readonly genomeDigest: string;
  readonly sourceArtefact: QualificationArtefact;
  readonly promotedAtMs: number;
}

export class PromotionFlow {
  private readonly promoted: PromotionRecord[] = [];

  evaluate(artefact: QualificationArtefact): PromotionDecision {
    const genome =
      typeof artefact.genome === 'string'
        ? (JSON.parse(artefact.genome as string) as PhysicsGenome)
        : clonePhysicsGenome(artefact.genome);
    const genomeDigest = digestPhysicsGenome(genome);
    if (!isQualified(artefact)) {
      return {
        promoted: false,
        genome,
        genomeDigest,
        artefactDigest: artefact.configDigest,
        reason: 'Aday kalifiye değil: faz, red veya insan onayı eksik.',
      };
    }
    if (this.promoted.some((r) => r.genomeDigest === genomeDigest)) {
      return {
        promoted: false,
        genome,
        genomeDigest,
        artefactDigest: artefact.configDigest,
        reason: 'Genom zaten promotion listesinde.',
      };
    }
    this.promoted.push({
      genome: clonePhysicsGenome(genome),
      genomeDigest,
      sourceArtefact: artefact,
      promotedAtMs: Date.now(),
    });
    return {
      promoted: true,
      genome,
      genomeDigest,
      artefactDigest: artefact.configDigest,
      reason: "Aday kalifiye ve onaylı; production'a taşındı.",
    };
  }

  get promotedGenomes(): readonly PromotionRecord[] {
    return this.promoted;
  }

  hasGenome(genomeDigest: string): boolean {
    return this.promoted.some((r) => r.genomeDigest === genomeDigest);
  }

  exportPromotedGenome(index: number): PhysicsGenome | null {
    const record = this.promoted[index];
    return record ? clonePhysicsGenome(record.genome) : null;
  }
}
