import { describe, expect, it } from 'vitest';
import { ResearchHarness, type ResearchHarnessConfig } from '@/../scripts/morphology/harness';
import { defaultSubstrateCandidate } from '@/config/candidate';
import { substrateConfig } from '@/config/substrate';

const smallSubstrate = {
  ...substrateConfig,
  particles: { ...substrateConfig.particles, capacity: 32 },
};

const smallConfig: Partial<ResearchHarnessConfig> = {
  baseCandidate: defaultSubstrateCandidate,
  substrate: smallSubstrate,
  candidateCount: 1,
  broad: { tickCount: 5, seedCount: 1, sampleInterval: 5 },
  refinement: { tickCount: 5, seedCount: 1, sampleInterval: 5 },
  qualification: { tickCount: 5, seedCount: 1, sampleInterval: 5 },
  perturbationSpecs: [{ kind: 'velocity-kick', magnitude: 1, targetFraction: 0.2, tick: 0 }],
  perturbation: { recoveryThreshold: 0.5, maxRecoveryTicks: 3 },
};

describe('ResearchHarness', () => {
  it('broad aşaması aday üretir', () => {
    const harness = new ResearchHarness(smallConfig);
    const results = harness.runBroad();
    expect(results).toHaveLength(1);
    for (const result of results) {
      expect(result.candidate.schemaVersion).toBe(defaultSubstrateCandidate.physics.schemaVersion);
      expect(result.candidateDigest).toMatch(/^[0-9a-f]{16}$/);
      expect(result.seedResults).toHaveLength(1);
    }
  });

  it('refinement sadece yapısal adayları işler', () => {
    const harness = new ResearchHarness(smallConfig);
    const broad = harness.runBroad();
    const refinement = harness.runRefinement(broad);
    expect(refinement.length).toBeLessThanOrEqual(broad.filter((c) => c.structured).length);
  });

  it('qualification artefakt üretir', () => {
    const harness = new ResearchHarness(smallConfig);
    const broad = harness.runBroad();
    const refinement = harness.runRefinement(broad);
    const artefacts = harness.runQualification(refinement);
    for (const artefact of artefacts) {
      expect(artefact.schemaVersion).toBe(1);
      expect(artefact.candidateDigest).toMatch(/^[0-9a-f]{16}$/);
      expect(artefact.timeSeries.length).toBeGreaterThan(0);
      expect(artefact.perturbationResults.length).toBeGreaterThan(0);
    }
  });

  it('promotionFlow erişilebilir', () => {
    const harness = new ResearchHarness(smallConfig);
    expect(harness.promotionFlow).toBeDefined();
    expect(harness.promotionFlow.promotedCandidates).toHaveLength(0);
  });
});
