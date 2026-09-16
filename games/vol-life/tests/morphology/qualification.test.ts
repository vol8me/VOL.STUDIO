import { describe, expect, it } from 'vitest';
import {
  ARTEFACT_SCHEMA_VERSION,
  createQualificationArtefact,
  isQualified,
  parseQualificationArtefact,
  readArtefactCandidate,
  serializeArtefact,
  type QualificationBudget,
} from '@/../scripts/morphology/qualification';
import {
  defaultSubstrateCandidate,
  digestSubstrateCandidate,
  serializeSubstrateCandidate,
} from '@/config/candidate';
import { substrateConfig } from '@/config/substrate';
import type { MorphologySample } from '@/../scripts/morphology/metrics';
import type { PerturbationResult } from '@/../scripts/morphology/perturbation';

const budget: QualificationBudget = {
  broadSeconds: 30,
  refinementSeconds: 120,
  qualificationSeconds: 600,
  totalSeedCount: 4,
};

function makeSample(): MorphologySample {
  return {
    tick: 0,
    activeCount: 512,
    voidLossCount: 0,
    meanSpeed: 0.5,
    stalledFraction: 0.1,
    meanNeighborCount: 5,
    meanLocalDensity: 0.001,
    clusterCompactness: 0.5,
    clusterAnisotropy: 0.3,
    typeComposition: [0.2, 0.2, 0.2, 0.2, 0.1, 0.1],
    radialStructure: 2,
    velocityAutocorrelation: 0.3,
    meanSquaredDisplacement: 25,
    recurrenceFraction: 0.1,
    voidDwellFraction: 0,
    fringeFraction: 0.05,
    scopedOutCount: 0,
    fringeStructuredFraction: 0,
    clusteredFraction: 0.8,
    clusterCount: 2,
    clusterSizeP50: 120,
    clusterSizeP90: 200,
    clusterSizeMax: 240,
    clusters: [],
  };
}

function makePerturbationResult(recovered: boolean): PerturbationResult {
  return {
    spec: { kind: 'velocity-kick', magnitude: 2, targetFraction: 0.3, tick: 0 },
    preState: {
      activeCount: 512,
      meanSpeed: 0.5,
      clusterCompactness: 0.5,
      centroidX: 0,
      centroidY: 0,
    },
    postState: {
      activeCount: 512,
      meanSpeed: 0.5,
      clusterCompactness: 0.5,
      centroidX: 0,
      centroidY: 0,
    },
    recoveryTicks: 10,
    recovered,
  };
}

describe('Qualification', () => {
  it('artefakt oluşturulur ve şema sürümü v2’dir', () => {
    const artefact = createQualificationArtefact(
      substrateConfig,
      defaultSubstrateCandidate,
      [1, 2, 3],
      { phase: 'dynamic-structured', confidence: 0.7, reasons: [] },
      [makeSample()],
      [makePerturbationResult(true)],
      [],
      budget,
    );
    expect(artefact.schemaVersion).toBe(ARTEFACT_SCHEMA_VERSION);
    expect(artefact.phase.phase).toBe('dynamic-structured');
    expect(artefact.humanAcceptance).toBe('pending');
  });

  it('kalifiye değil: insan onayı bekliyor', () => {
    const artefact = createQualificationArtefact(
      substrateConfig,
      defaultSubstrateCandidate,
      [1],
      { phase: 'dynamic-structured', confidence: 0.7, reasons: [] },
      [makeSample()],
      [makePerturbationResult(true)],
      [],
      budget,
    );
    expect(isQualified(artefact)).toBe(false);
  });

  it('kalifiye değil: yanlış faz', () => {
    const artefact = createQualificationArtefact(
      substrateConfig,
      defaultSubstrateCandidate,
      [1],
      { phase: 'dead', confidence: 0.9, reasons: ['ölü'] },
      [makeSample()],
      [makePerturbationResult(true)],
      [],
      budget,
    );
    expect(isQualified(artefact)).toBe(false);
  });

  it('kalifiye değil: red nedenleri var', () => {
    const artefact = createQualificationArtefact(
      substrateConfig,
      defaultSubstrateCandidate,
      [1],
      { phase: 'dynamic-structured', confidence: 0.7, reasons: [] },
      [makeSample()],
      [makePerturbationResult(true)],
      ['seed 1: çöküş'],
      budget,
    );
    expect(isQualified(artefact)).toBe(false);
  });

  it('kalifiye değil: perturbation recovery başarısız', () => {
    const accepted = {
      ...createQualificationArtefact(
        substrateConfig,
        defaultSubstrateCandidate,
        [1],
        { phase: 'dynamic-structured', confidence: 0.7, reasons: [] },
        [makeSample()],
        [makePerturbationResult(false)],
        [],
        budget,
      ),
      humanAcceptance: 'accepted' as const,
    };
    expect(isQualified(accepted)).toBe(false);
  });
});

/*
 * E3: artefakt JSON'a yazılmak için vardır, o yüzden aday NESNE değil kanonik
 * METİNDİR. v1 şeması alanı nesne diye tiplendirip içine string koyuyordu
 * (`as unknown as`); tüketiciler bu yüzden `typeof === 'string'` ikili dalı ve
 * doğrulamasız `JSON.parse` taşıyordu — bozuk bir aday sessizce promotion'a
 * geçebilirdi.
 */
describe('Qualification artefakt DTO v2 (E3)', () => {
  function artefact() {
    return createQualificationArtefact(
      substrateConfig,
      defaultSubstrateCandidate,
      [1, 2],
      { phase: 'dynamic-structured', confidence: 0.7, reasons: [] },
      [makeSample()],
      [makePerturbationResult(true)],
      [],
      budget,
    );
  }

  it('aday alanı kanonik metindir ve digest’i onunla uyuşur', () => {
    const created = artefact();

    expect(typeof created.candidate).toBe('string');
    expect(created.candidate).toBe(serializeSubstrateCandidate(defaultSubstrateCandidate));
    expect(created.candidateDigest).toBe(digestSubstrateCandidate(defaultSubstrateCandidate));
  });

  it('gidiş-dönüş: serialize → parse aynı artefaktı ve aynı adayı verir', () => {
    const created = artefact();
    const restored = parseQualificationArtefact(serializeArtefact(created));

    expect(restored.schemaVersion).toBe(ARTEFACT_SCHEMA_VERSION);
    expect(restored.candidateDigest).toBe(created.candidateDigest);
    expect(digestSubstrateCandidate(readArtefactCandidate(restored))).toBe(created.candidateDigest);
  });

  it('eski şema (v1) açıkça reddedilir', () => {
    const legacy = JSON.stringify({
      ...artefact(),
      schemaVersion: 1,
      candidate: defaultSubstrateCandidate,
    });

    expect(() => parseQualificationArtefact(legacy)).toThrow(RangeError);
  });

  it('bozuk DTO reddedilir', () => {
    const created = artefact();
    const withObjectCandidate = JSON.stringify({
      ...created,
      candidate: defaultSubstrateCandidate,
    });
    const withBadDigest = JSON.stringify({ ...created, candidateDigest: '0'.repeat(16) });
    const withoutCorpus = JSON.stringify({ ...created, corpus: 'hepsi' });
    const withBrokenCandidate = JSON.stringify({ ...created, candidate: '{"physics":{}}' });

    expect(() => parseQualificationArtefact(withObjectCandidate)).toThrow(RangeError);
    expect(() => parseQualificationArtefact(withBadDigest)).toThrow(RangeError);
    expect(() => parseQualificationArtefact(withoutCorpus)).toThrow(RangeError);
    expect(() => parseQualificationArtefact(withBrokenCandidate)).toThrow(RangeError);
  });
});
