import { describe, expect, it } from 'vitest';
import type { SourceState } from '@/../scripts/morphology/sourceState';
import type { StageBudget } from '@/../scripts/morphology/qualification';
import type { CandidateAggregation } from '@/../scripts/morphology/phaseClassifier';
import { PromotionFlow } from '@/../scripts/morphology/promotion';
import { createQualificationArtefact } from '@/../scripts/morphology/qualification';
import { defaultSubstrateCandidate } from '@/config/candidate';
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

function makePerturbationResult(recovered = true): PerturbationResult {
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

describe('PromotionFlow', () => {
  /* E12: kirli ağaçta koşulan araştırma promotion üretemez. */
  it('kirli kaynaktan çıkan artefakt promotion alamaz', () => {
    const flow = new PromotionFlow();
    const artefact = createQualificationArtefact({
      config: substrateConfig,
      candidate: defaultSubstrateCandidate,
      corpus: [1],
      phase: structuredAggregation(),
      seedTimeSeries: [{ seed: 1, samples: [makeSample()] }],
      perturbationResults: [makePerturbationResult()],
      rejectionReasons: [],
      budgets: budgets,
      source: {
        revision: 'c'.repeat(40),
        dirty: true,
        dirtyPaths: ['src/x.ts'],
        eligibleForPromotion: false,
      },
    });
    const accepted = { ...artefact, humanAcceptance: 'accepted' as const };

    expect(flow.evaluate(accepted).promoted).toBe(false);
  });

  it('kalifiye olmayan adayı reddeder', () => {
    const flow = new PromotionFlow();
    const artefact = createQualificationArtefact({
      config: substrateConfig,
      candidate: defaultSubstrateCandidate,
      corpus: [1],
      phase: deadAggregation(),
      seedTimeSeries: [{ seed: 1, samples: [makeSample()] }],
      perturbationResults: [makePerturbationResult()],
      rejectionReasons: [],
      budgets: budgets,
      source: cleanSource(),
    });
    const decision = flow.evaluate(artefact);
    expect(decision.promoted).toBe(false);
  });

  it('kalifiye ve onaylı adayı taşır', () => {
    const flow = new PromotionFlow();
    const base = createQualificationArtefact({
      config: substrateConfig,
      candidate: defaultSubstrateCandidate,
      corpus: [1],
      phase: structuredAggregation(),
      seedTimeSeries: [{ seed: 1, samples: [makeSample()] }],
      perturbationResults: [makePerturbationResult()],
      rejectionReasons: [],
      budgets: budgets,
      source: cleanSource(),
    });
    const accepted = { ...base, humanAcceptance: 'accepted' as const };
    const decision = flow.evaluate(accepted);
    expect(decision.promoted).toBe(true);
    expect(flow.promotedCandidates).toHaveLength(1);
  });

  it('aynı genomu ikinci kez taşımaz', () => {
    const flow = new PromotionFlow();
    const base = createQualificationArtefact({
      config: substrateConfig,
      candidate: defaultSubstrateCandidate,
      corpus: [1],
      phase: structuredAggregation(),
      seedTimeSeries: [{ seed: 1, samples: [makeSample()] }],
      perturbationResults: [makePerturbationResult()],
      rejectionReasons: [],
      budgets: budgets,
      source: cleanSource(),
    });
    const accepted = { ...base, humanAcceptance: 'accepted' as const };
    flow.evaluate(accepted);
    const decision = flow.evaluate(accepted);
    expect(decision.promoted).toBe(false);
    expect(decision.reason).toContain('zaten');
  });

  it('hasGenome promoted listesini sorgular', () => {
    const flow = new PromotionFlow();
    const base = createQualificationArtefact({
      config: substrateConfig,
      candidate: defaultSubstrateCandidate,
      corpus: [1],
      phase: structuredAggregation(),
      seedTimeSeries: [{ seed: 1, samples: [makeSample()] }],
      perturbationResults: [makePerturbationResult()],
      rejectionReasons: [],
      budgets: budgets,
      source: cleanSource(),
    });
    const accepted = { ...base, humanAcceptance: 'accepted' as const };
    flow.evaluate(accepted);
    const digest = flow.promotedCandidates[0].candidateDigest;
    expect(flow.hasCandidate(digest)).toBe(true);
    expect(flow.hasCandidate('unknown')).toBe(false);
  });

  it('exportPromotedCandidate promoted adayı döner', () => {
    const flow = new PromotionFlow();
    const base = createQualificationArtefact({
      config: substrateConfig,
      candidate: defaultSubstrateCandidate,
      corpus: [1],
      phase: structuredAggregation(),
      seedTimeSeries: [{ seed: 1, samples: [makeSample()] }],
      perturbationResults: [makePerturbationResult()],
      rejectionReasons: [],
      budgets: budgets,
      source: cleanSource(),
    });
    const accepted = { ...base, humanAcceptance: 'accepted' as const };
    flow.evaluate(accepted);
    const promoted = flow.exportPromotedCandidate(0);
    expect(promoted).not.toBeNull();
    expect(promoted?.schemaVersion).toBe(defaultSubstrateCandidate.schemaVersion);
    expect(promoted?.void).toEqual(defaultSubstrateCandidate.void);
    expect(flow.exportPromotedCandidate(99)).toBeNull();
  });
});
