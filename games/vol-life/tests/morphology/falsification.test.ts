import { describe, expect, it } from 'vitest';
import {
  FAMILY_ORDER,
  evaluateFamilyFalsification,
  nextFamily,
  type FamilyEvidence,
} from '@/../scripts/morphology/falsification';

function evidence(overrides: Partial<FamilyEvidence> = {}): FamilyEvidence {
  return {
    family: 'generalized-asymmetric-multi-band',
    broadCandidateCount: 2048,
    passingCandidateCount: 64,
    refinementSurvivorCount: 3,
    humanRejectedAll: false,
    ...overrides,
  };
}

describe('§8.4 — kernel ailesi çürütme noktası', () => {
  it('eşiğin üstünde aile çürümez', () => {
    const verdict = evaluateFamilyFalsification(evidence());
    expect(verdict.falsified).toBe(false);
    expect(verdict.reasons).toEqual([]);
    expect(verdict.passingShare).toBeCloseTo(0.03125, 6);
  });

  it('(a) geçen aday payı %1’in altındaysa aile çürür', () => {
    const verdict = evaluateFamilyFalsification(evidence({ passingCandidateCount: 20 }));
    expect(verdict.falsified).toBe(true);
    expect(verdict.reasons[0]).toContain('(a)');
  });

  it('(b) refinement’ta hiçbir aday kalmazsa aile çürür', () => {
    const verdict = evaluateFamilyFalsification(evidence({ refinementSurvivorCount: 0 }));
    expect(verdict.falsified).toBe(true);
    expect(verdict.reasons.join(' ')).toContain('(b)');
  });

  it('(c) kullanıcı kısa listeyi tümüyle reddederse aile çürür', () => {
    const verdict = evaluateFamilyFalsification(evidence({ humanRejectedAll: true }));
    expect(verdict.falsified).toBe(true);
    expect(verdict.reasons.join(' ')).toContain('(c)');
  });

  /*
   * ÖLÇÜLMEMİŞ koşul "geçti" sayılmaz; hangi dayanağın eksik olduğu görünür
   * kalır, yoksa yarım kanıtla "aile sağlam" denirdi.
   */
  it('ölçülmemiş koşullar ayrı listelenir', () => {
    const verdict = evaluateFamilyFalsification(
      evidence({ refinementSurvivorCount: null, humanRejectedAll: null }),
    );
    expect(verdict.falsified).toBe(false);
    expect(verdict.unmeasured).toHaveLength(2);
  });

  it('broad koşusu olmadan karar verilmez', () => {
    expect(() => evaluateFamilyFalsification(evidence({ broadCandidateCount: 0 }))).toThrow(
      RangeError,
    );
    expect(() => evaluateFamilyFalsification(evidence({ passingCandidateCount: 9999 }))).toThrow(
      RangeError,
    );
  });

  it('aile sırası ön-kayıtlıdır', () => {
    expect(FAMILY_ORDER[0]).toBe('generalized-asymmetric-multi-band');
    expect(nextFamily('generalized-asymmetric-multi-band')).toBe('multi-lobe');
    expect(nextFamily('multi-lobe')).toBe('active-particle');
    expect(nextFamily('active-particle')).toBeNull();
    expect(() => nextFamily('yok')).toThrow(RangeError);
  });
});
