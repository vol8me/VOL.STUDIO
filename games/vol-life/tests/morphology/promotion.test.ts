import { describe, expect, it } from 'vitest';
import type { CandidateAggregation } from '@/../scripts/morphology/phaseClassifier';
import { PromotionFlow } from '@/../scripts/morphology/promotion';
import {
  createQualificationArtefact,
  type QualificationBudget,
} from '@/../scripts/morphology/qualification';
import { defaultSubstrateCandidate } from '@/config/candidate';
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

describe('PromotionFlow', () => {
  it('kalifiye olmayan adayı reddeder', () => {
    const flow = new PromotionFlow();
    const artefact = createQualificationArtefact(
      substrateConfig,
      defaultSubstrateCandidate,
      [1],
      deadAggregation(),
      [makeSample()],
      [makePerturbationResult()],
      [],
      budget,
    );
    const decision = flow.evaluate(artefact);
    expect(decision.promoted).toBe(false);
  });

  it('kalifiye ve onaylı adayı taşır', () => {
    const flow = new PromotionFlow();
    const base = createQualificationArtefact(
      substrateConfig,
      defaultSubstrateCandidate,
      [1],
      structuredAggregation(),
      [makeSample()],
      [makePerturbationResult()],
      [],
      budget,
    );
    const accepted = { ...base, humanAcceptance: 'accepted' as const };
    const decision = flow.evaluate(accepted);
    expect(decision.promoted).toBe(true);
    expect(flow.promotedCandidates).toHaveLength(1);
  });

  it('aynı genomu ikinci kez taşımaz', () => {
    const flow = new PromotionFlow();
    const base = createQualificationArtefact(
      substrateConfig,
      defaultSubstrateCandidate,
      [1],
      structuredAggregation(),
      [makeSample()],
      [makePerturbationResult()],
      [],
      budget,
    );
    const accepted = { ...base, humanAcceptance: 'accepted' as const };
    flow.evaluate(accepted);
    const decision = flow.evaluate(accepted);
    expect(decision.promoted).toBe(false);
    expect(decision.reason).toContain('zaten');
  });

  it('hasGenome promoted listesini sorgular', () => {
    const flow = new PromotionFlow();
    const base = createQualificationArtefact(
      substrateConfig,
      defaultSubstrateCandidate,
      [1],
      structuredAggregation(),
      [makeSample()],
      [makePerturbationResult()],
      [],
      budget,
    );
    const accepted = { ...base, humanAcceptance: 'accepted' as const };
    flow.evaluate(accepted);
    const digest = flow.promotedCandidates[0].candidateDigest;
    expect(flow.hasCandidate(digest)).toBe(true);
    expect(flow.hasCandidate('unknown')).toBe(false);
  });

  it('exportPromotedCandidate promoted adayı döner', () => {
    const flow = new PromotionFlow();
    const base = createQualificationArtefact(
      substrateConfig,
      defaultSubstrateCandidate,
      [1],
      structuredAggregation(),
      [makeSample()],
      [makePerturbationResult()],
      [],
      budget,
    );
    const accepted = { ...base, humanAcceptance: 'accepted' as const };
    flow.evaluate(accepted);
    const promoted = flow.exportPromotedCandidate(0);
    expect(promoted).not.toBeNull();
    expect(promoted?.schemaVersion).toBe(defaultSubstrateCandidate.schemaVersion);
    expect(promoted?.void).toEqual(defaultSubstrateCandidate.void);
    expect(flow.exportPromotedCandidate(99)).toBeNull();
  });
});
