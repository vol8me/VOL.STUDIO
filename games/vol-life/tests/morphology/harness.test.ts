import { describe, expect, it } from 'vitest';
import { ResearchHarness, type ResearchHarnessConfig } from '@/../scripts/morphology/harness';
import { ARTEFACT_SCHEMA_VERSION } from '@/../scripts/morphology/qualification';
import { defaultPerturbationConfig } from '@/../scripts/morphology/perturbation';
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
  // E15: küçük koşuda taban ve toparlanma pencereleri de küçük tutulur.
  perturbation: {
    ...defaultPerturbationConfig,
    baselineSeconds: 0.1,
    recoverySeconds: 0.1,
    sampleIntervalTicks: 2,
  },
};

describe('ResearchHarness', () => {
  it('broad aşaması aday üretir', () => {
    const harness = new ResearchHarness(smallConfig);
    const results = harness.runBroad();
    expect(results).toHaveLength(1);
    for (const result of results) {
      expect(result.candidate.schemaVersion).toBe(defaultSubstrateCandidate.schemaVersion);
      expect(result.candidateDigest).toMatch(/^[0-9a-f]{16}$/);
      expect(result.seedResults).toHaveLength(1);
    }
  });

  /*
   * E10 ENTEGRASYON: iki senaryo harness koşusunda KARIŞMAZ. Aynı aday, aynı
   * seed, tek fark senaryo. Intrinsic koşu kapsam dışı maddeyi ayrı sayar,
   * void-stress koşu hiçbir şeyi dışlamaz.
   *
   * Void profili geniş seçildi ki 5 tick'lik koşuda kapsam gerçekten madde
   * dışlasın; dar varsayılan bantta ayrım ölçülemez hâle gelirdi. 80 birim,
   * `validateSubstrateConfig`in izin verdiği üst sınırın (≈ 83) altındadır.
   */
  it('intrinsic ve void-stress senaryoları aynı koşuda karışmaz', () => {
    const wideVoid = { ...defaultSubstrateCandidate.void, widthUnits: 80 };
    const harness = new ResearchHarness(smallConfig);
    const stage = { tickCount: 5, seedCount: 1, sampleInterval: 5 };

    const intrinsic = harness.evaluateCandidate(
      { ...defaultSubstrateCandidate, void: wideVoid, scenario: { kind: 'intrinsic' } },
      stage,
    );
    const voidStress = harness.evaluateCandidate(
      {
        ...defaultSubstrateCandidate,
        void: wideVoid,
        scenario: { kind: 'void-stress', tidalControl: false },
      },
      stage,
    );

    const intrinsicSample = intrinsic.seedResults[0].finalSample;
    const voidStressSample = voidStress.seedResults[0].finalSample;

    expect(intrinsicSample.scopedOutCount).toBeGreaterThan(0);
    expect(voidStressSample.scopedOutCount).toBe(0);
    expect(intrinsicSample.activeCount).toBeLessThan(voidStressSample.activeCount);
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
      expect(artefact.schemaVersion).toBe(ARTEFACT_SCHEMA_VERSION);
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
