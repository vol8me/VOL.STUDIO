import { describe, expect, it } from 'vitest';
import {
  createQualificationArtefact,
  isQualified,
  type QualificationBudget,
} from '@/../scripts/morphology/qualification';
import { defaultPhysicsGenome } from '@/config/genome';
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
  it('artefakt oluşturulur ve şema sürümü 1', () => {
    const artefact = createQualificationArtefact(
      substrateConfig,
      defaultPhysicsGenome,
      [1, 2, 3],
      { phase: 'dynamic-structured', confidence: 0.7, reasons: [] },
      [makeSample()],
      [makePerturbationResult(true)],
      [],
      budget,
    );
    expect(artefact.schemaVersion).toBe(1);
    expect(artefact.phase.phase).toBe('dynamic-structured');
    expect(artefact.humanAcceptance).toBe('pending');
  });

  it('kalifiye değil: insan onayı bekliyor', () => {
    const artefact = createQualificationArtefact(
      substrateConfig,
      defaultPhysicsGenome,
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
      defaultPhysicsGenome,
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
      defaultPhysicsGenome,
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
        defaultPhysicsGenome,
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
