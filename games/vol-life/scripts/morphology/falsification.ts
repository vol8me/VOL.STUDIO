/**
 * Kernel ailesinin ÇÜRÜTÜLME noktası (§8.4).
 *
 * "Aile işe yaramıyor" bir his değil ölçüdür: eşikler broad koşusundan ÖNCE
 * yazılır ve bir adayı geçirmek için değiştirilmez. Çürüyen ailenin yerine
 * sıradaki aile aynı huniyle koşulur — önce multi-lobe, sonra active-particle.
 */
export interface FalsificationConfig {
  /** (a) Hem launch envelope'u hem DYNAMIC_STRUCTURED'ı geçen aday payı. */
  readonly minPassingCandidateShare: number;
  /** Launch envelope'un seed'lerde aranan payı. */
  readonly launchSeedShare: number;
}

export const defaultFalsificationConfig: FalsificationConfig = {
  minPassingCandidateShare: 0.01,
  launchSeedShare: 0.75,
};

export interface FamilyEvidence {
  readonly family: string;
  readonly broadCandidateCount: number;
  /** Launch envelope'u seed'lerin ≥ %75'inde geçEN VE yapısal olan aday sayısı. */
  readonly passingCandidateCount: number;
  /** Refinement'ta bütün sert kuralları geçen aday sayısı; koşulmadıysa `null`. */
  readonly refinementSurvivorCount: number | null;
  /** Kullanıcı P2'de bütün kısa listeyi reddettiyse true; karar yoksa `null`. */
  readonly humanRejectedAll: boolean | null;
}

export interface FalsificationVerdict {
  readonly family: string;
  readonly falsified: boolean;
  readonly passingShare: number;
  readonly reasons: readonly string[];
  /** Ölçülmemiş koşullar; "çürümedi" demenin dayanağı da gösterilir. */
  readonly unmeasured: readonly string[];
}

export function evaluateFamilyFalsification(
  evidence: FamilyEvidence,
  config: FalsificationConfig = defaultFalsificationConfig,
): FalsificationVerdict {
  if (evidence.broadCandidateCount <= 0) {
    throw new RangeError('Çürütme kararı broad koşusu olmadan verilemez.');
  }
  if (evidence.passingCandidateCount > evidence.broadCandidateCount) {
    throw new RangeError('Geçen aday sayısı toplam adaydan büyük olamaz.');
  }
  const passingShare = evidence.passingCandidateCount / evidence.broadCandidateCount;
  const reasons: string[] = [];
  const unmeasured: string[] = [];

  if (passingShare < config.minPassingCandidateShare) {
    reasons.push(
      `(a) broad adayların %${(passingShare * 100).toFixed(2)}'si hem launch envelope'u ` +
        `seed'lerin ≥ %${config.launchSeedShare * 100}'inde geçiyor hem yapısal; ` +
        `eşik %${config.minPassingCandidateShare * 100}`,
    );
  }
  if (evidence.refinementSurvivorCount === null) unmeasured.push('(b) refinement koşulmadı');
  else if (evidence.refinementSurvivorCount === 0) {
    reasons.push('(b) refinement’ta bütün sert kuralları geçen aday yok');
  }
  if (evidence.humanRejectedAll === null) unmeasured.push('(c) insan ön-elemesi verilmedi');
  else if (evidence.humanRejectedAll) {
    reasons.push('(c) kullanıcı kısa listenin tamamını reddetti');
  }

  return {
    family: evidence.family,
    falsified: reasons.length > 0,
    passingShare,
    reasons,
    unmeasured,
  };
}

/** Çürüyen ailenin yerine sıradaki aile; sıra ÖN-KAYITLIDIR. */
export const FAMILY_ORDER = [
  'generalized-asymmetric-multi-band',
  'multi-lobe',
  'active-particle',
] as const;

export function nextFamily(family: string): string | null {
  const index = FAMILY_ORDER.indexOf(family as (typeof FAMILY_ORDER)[number]);
  if (index < 0) throw new RangeError(`Bilinmeyen aile: ${family}`);
  return FAMILY_ORDER[index + 1] ?? null;
}
