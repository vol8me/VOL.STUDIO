import { describe, expect, it } from 'vitest';
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
    trajectoryAutocorrelation: 0.3,
    voidDwellFraction: 0,
    fringeFraction: 0.05,
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

describe('PromotionFlow', () => {
  it('kalifiye olmayan adayı reddeder', () => {
    const flow = new PromotionFlow();
    const artefact = createQualificationArtefact(
      substrateConfig,
      defaultSubstrateCandidate,
      [1],
      { phase: 'dead', confidence: 0.9, reasons: ['ölü'] },
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
      { phase: 'dynamic-structured', confidence: 0.7, reasons: [] },
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
      { phase: 'dynamic-structured', confidence: 0.7, reasons: [] },
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
      { phase: 'dynamic-structured', confidence: 0.7, reasons: [] },
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
      { phase: 'dynamic-structured', confidence: 0.7, reasons: [] },
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
