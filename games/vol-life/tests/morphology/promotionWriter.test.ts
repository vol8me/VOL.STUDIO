import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  assertPromotable,
  renderCandidateModule,
  writePromotedCandidate,
  type PromotionProvenance,
} from '@/../scripts/morphology/promotionWriter';
import { createQualificationArtefact } from '@/../scripts/morphology/qualification';
import type { QualificationArtefact, StageBudget } from '@/../scripts/morphology/qualification';
import type { CandidateAggregation } from '@/../scripts/morphology/phaseClassifier';
import type { MorphologySample } from '@/../scripts/morphology/metrics';
import type { PerturbationResult } from '@/../scripts/morphology/perturbation';
import {
  defaultSubstrateCandidate,
  digestSubstrateCandidate,
  parseSubstrateCandidate,
  serializeSubstrateCandidate,
  type SubstrateCandidate,
} from '@/config/candidate';
import { particleConfig } from '@/config/particles';
import { substrateConfig } from '@/config/substrate';

function sample(): MorphologySample {
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

function perturbation(): PerturbationResult {
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
    recovered: true,
    outOfBand: [],
  };
}

const aggregation: CandidateAggregation = {
  majorityReason: 'DYNAMIC_STRUCTURED',
  reasonCounts: { DYNAMIC_STRUCTURED: 4 },
  seedCount: 4,
  failed: false,
  structured: true,
};

const budgets: StageBudget[] = [
  {
    stage: 'qualification',
    wallClockMs: 12,
    ticks: 600,
    msPerTick: 0.02,
    workUnits: [{ workId: 'qualification:x:1', wallClockMs: 12, ticks: 600, msPerTick: 0.02 }],
  },
];

function artefact(dirty = false): QualificationArtefact {
  return createQualificationArtefact({
    config: substrateConfig,
    candidate: defaultSubstrateCandidate,
    corpus: [1],
    phase: aggregation,
    seedTimeSeries: [{ seed: 1, samples: [sample()] }],
    perturbationResults: [perturbation()],
    rejectionReasons: [],
    budgets,
    source: {
      revision: 'a'.repeat(40),
      dirty,
      dirtyPaths: dirty ? ['src/x.ts'] : [],
      eligibleForPromotion: !dirty,
    },
  });
}

function accepted(dirty = false): QualificationArtefact {
  return {
    ...artefact(dirty),
    humanPreselection: 'accepted' as const,
    humanAcceptance: 'accepted' as const,
  };
}

const provenance: PromotionProvenance = {
  artefactDigest: 'b'.repeat(16),
  sourceRevision: 'a'.repeat(40),
  corpusId: 'corpus-v1',
  acceptedBy: 'kullanıcı',
  acceptedAt: '2026-09-17',
};

describe('K9 — promotion hedefi', () => {
  it('kirli kaynak reddedilir', () => {
    expect(() => assertPromotable(accepted(true))).toThrow(/Kirli kaynak/);
  });

  /* K15: insan ön-elemesi gelmeden aday promotion'a giremez. */
  it('insan ön-elemesi yoksa reddedilir', () => {
    expect(() => assertPromotable({ ...accepted(), humanPreselection: 'pending' })).toThrow(
      /ön-elemesi/,
    );
  });

  it('final kabul yoksa reddedilir', () => {
    expect(() => assertPromotable({ ...accepted(), humanAcceptance: 'pending' })).toThrow(
      /Final kabul/,
    );
  });

  it('kalifiye olmayan aday reddedilir', () => {
    const rejected = { ...accepted(), rejectionReasons: ['GAS'] };
    expect(() => assertPromotable(rejected)).toThrow(/kalifikasyon/);
  });

  it('kalifiye, temiz ve kabul edilmiş artefakt geçer', () => {
    expect(() => assertPromotable(accepted())).not.toThrow();
  });

  /* Üretilen dosya AYNI aday digest'ine geri dönmeli; yuvarlama aday değiştirir. */
  it('üretilen modül aynı aday digest’ine geri döner', async () => {
    /*
     * Üretilen modül PAKET İÇİNE yazılır: vitest yalnız kök altındaki dosyaları
     * dönüştürür ve modülün gerçekten import edilebildiğini görmenin başka yolu
     * yok. `research-out` araştırma çıktısıdır, git'e girmez.
     */
    const dir = resolve(import.meta.dirname, '../../research-out/promotion-test');
    mkdirSync(dir, { recursive: true });
    try {
      const path = join(dir, 'substrateCandidate.ts');
      const digest = await writePromotedCandidate(path, accepted(), provenance);
      expect(digest).toBe(digestSubstrateCandidate(defaultSubstrateCandidate));

      const source = readFileSync(path, 'utf8');
      expect(source).toContain('ÜRETİLMİŞ DOSYA');
      expect(source).toContain(provenance.artefactDigest);
      expect(source).toContain(provenance.corpusId);

      const imported = (await import(/* @vite-ignore */ path)) as {
        promotedSubstrateCandidate: SubstrateCandidate;
        promotedCandidateProvenance: { artefactDigest: string };
      };
      // Modüldeki aday hem AYNI digest'i verir hem geçerli bir aday olarak ayrıştırılır.
      expect(digestSubstrateCandidate(imported.promotedSubstrateCandidate)).toBe(digest);
      const roundTrip = parseSubstrateCandidate(
        serializeSubstrateCandidate(imported.promotedSubstrateCandidate),
        particleConfig.radiusUnits,
      );
      expect(digestSubstrateCandidate(roundTrip)).toBe(digest);
      expect(imported.promotedCandidateProvenance.artefactDigest).toBe(provenance.artefactDigest);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('aynı girdi aynı baytları üretir', () => {
    const first = renderCandidateModule(defaultSubstrateCandidate, provenance);
    const second = renderCandidateModule(defaultSubstrateCandidate, provenance);
    expect(first).toBe(second);
    // Serileştirme de kaymamalı: modül metni adayın kanonik metniyle aynı sayıları taşır.
    expect(first).toContain(String(defaultSubstrateCandidate.physics.cutoffUnits));
    expect(serializeSubstrateCandidate(defaultSubstrateCandidate)).toContain('"cutoffUnits"');
  });
});
