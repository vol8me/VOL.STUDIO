import { describe, expect, it } from 'vitest';
import type { SourceState } from '@/../scripts/morphology/sourceState';
import type { StageBudget } from '@/../scripts/morphology/qualification';
import type { CandidateAggregation } from '@/../scripts/morphology/phaseClassifier';
import {
  ARTEFACT_SCHEMA_VERSION,
  createQualificationArtefact,
  isQualified,
  parseQualificationArtefact,
  readArtefactCandidate,
  serializeArtefact,
} from '@/../scripts/morphology/qualification';
import {
  defaultSubstrateCandidate,
  digestSubstrateCandidate,
  serializeSubstrateCandidate,
} from '@/config/candidate';
import { substrateConfig } from '@/config/substrate';
import type { MorphologySample } from '@/../scripts/morphology/metrics';
import type { PerturbationResult } from '@/../scripts/morphology/perturbation';

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
    cappedFraction: 0,
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
    baseline: {
      activeCount: { mean: 512, sigma: 1 },
      meanSpeed: { mean: 0.5, sigma: 0.05 },
      clusterCompactness: { mean: 0.5, sigma: 0.05 },
      sampleCount: 60,
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
    outOfBand: [],
  };
}

/** E11: artefakt artık tek seed'in fazını değil aday TOPLAMASINI taşır. */
function structuredAggregation(): CandidateAggregation {
  return {
    majorityReason: 'DYNAMIC_STRUCTURED',
    reasonCounts: { DYNAMIC_STRUCTURED: 4 },
    seedCount: 4,
    failed: false,
    structured: true,
  };
}

function deadAggregation(): CandidateAggregation {
  return {
    majorityReason: 'DEAD',
    reasonCounts: { DEAD: 4 },
    seedCount: 4,
    failed: true,
    structured: false,
  };
}

/** E12: artefakt kaynak durumunu taşır; testler temiz ağaç varsayar. */
function cleanSource(): SourceState {
  return { revision: 'a'.repeat(40), dirty: false, dirtyPaths: [], eligibleForPromotion: true };
}

const budgets: StageBudget[] = [
  {
    stage: 'qualification',
    wallClockMs: 12,
    ticks: 600,
    msPerTick: 0.02,
    workUnits: [{ workId: 'qualification:x:1', wallClockMs: 12, ticks: 600, msPerTick: 0.02 }],
  },
];

describe('Qualification', () => {
  it('artefakt oluşturulur ve şema sürümü v3’tür', () => {
    const artefact = createQualificationArtefact({
      config: substrateConfig,
      candidate: defaultSubstrateCandidate,
      corpus: [1, 2, 3],
      phase: structuredAggregation(),
      seedTimeSeries: [{ seed: 1, samples: [makeSample()] }],
      perturbationResults: [makePerturbationResult(true)],
      rejectionReasons: [],
      budgets: budgets,
      source: cleanSource(),
    });
    expect(artefact.schemaVersion).toBe(ARTEFACT_SCHEMA_VERSION);
    expect(artefact.phase.structured).toBe(true);
    expect(artefact.humanAcceptance).toBe('pending');
  });

  it('kalifiye değil: insan onayı bekliyor', () => {
    const artefact = createQualificationArtefact({
      config: substrateConfig,
      candidate: defaultSubstrateCandidate,
      corpus: [1],
      phase: structuredAggregation(),
      seedTimeSeries: [{ seed: 1, samples: [makeSample()] }],
      perturbationResults: [makePerturbationResult(true)],
      rejectionReasons: [],
      budgets: budgets,
      source: cleanSource(),
    });
    expect(isQualified(artefact)).toBe(false);
  });

  it('kalifiye değil: yanlış faz', () => {
    const artefact = createQualificationArtefact({
      config: substrateConfig,
      candidate: defaultSubstrateCandidate,
      corpus: [1],
      phase: deadAggregation(),
      seedTimeSeries: [{ seed: 1, samples: [makeSample()] }],
      perturbationResults: [makePerturbationResult(true)],
      rejectionReasons: [],
      budgets: budgets,
      source: cleanSource(),
    });
    expect(isQualified(artefact)).toBe(false);
  });

  it('kalifiye değil: red nedenleri var', () => {
    const artefact = createQualificationArtefact({
      config: substrateConfig,
      candidate: defaultSubstrateCandidate,
      corpus: [1],
      phase: structuredAggregation(),
      seedTimeSeries: [{ seed: 1, samples: [makeSample()] }],
      perturbationResults: [makePerturbationResult(true)],
      rejectionReasons: ['seed 1: çöküş'],
      budgets: budgets,
      source: cleanSource(),
    });
    expect(isQualified(artefact)).toBe(false);
  });

  it('kalifiye değil: perturbation recovery başarısız', () => {
    const accepted = {
      ...createQualificationArtefact({
        config: substrateConfig,
        candidate: defaultSubstrateCandidate,
        corpus: [1],
        phase: structuredAggregation(),
        seedTimeSeries: [{ seed: 1, samples: [makeSample()] }],
        perturbationResults: [makePerturbationResult(false)],
        rejectionReasons: [],
        budgets: budgets,
        source: cleanSource(),
      }),
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
    return createQualificationArtefact({
      config: substrateConfig,
      candidate: defaultSubstrateCandidate,
      corpus: [1, 2],
      phase: structuredAggregation(),
      seedTimeSeries: [{ seed: 1, samples: [makeSample()] }],
      perturbationResults: [makePerturbationResult(true)],
      rejectionReasons: [],
      budgets: budgets,
      source: cleanSource(),
    });
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
