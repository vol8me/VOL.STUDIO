import { describe, expect, it } from 'vitest';
import {
  AUTOMATIC_FAMILIES,
  UNCLASSIFIED_FAMILY,
  buildAuditionCatalog,
  familyOf,
  metricVector,
  type CatalogCandidate,
  type CatalogMetrics,
} from '@/../scripts/morphology/auditionCatalog';
import { validateAuditionCatalog } from '@/config/auditionCatalog';
import { particleConfig } from '@/config/particles';
import { candidateVariant } from '../support/auditionCatalogFixture';

const RADIUS = particleConfig.radiusUnits;

function metrics(overrides: Partial<CatalogMetrics> = {}): CatalogMetrics {
  return {
    clusteredFraction: 0.8,
    clusterCount: 2,
    clusterCompactness: 0.7,
    clusterAnisotropy: 0.2,
    meanSpeed: 0.05,
    maxSpeed: 2,
    retention: 0.9,
    radialStructure: 0.2,
    ...overrides,
  };
}

function candidate(index: number, overrides: Partial<CatalogCandidate> = {}): CatalogCandidate {
  return {
    index,
    candidate: candidateVariant(0.9 + index / 1000),
    primary: 'DYNAMIC_STRUCTURED',
    phaseDistribution: { DYNAMIC_STRUCTURED: 3 },
    metrics: metrics(),
    risks: [],
    ...overrides,
  };
}

const context = {
  corpusId: 'corpus-v1',
  seeds: [11, 22, 33],
  sourceRevision: '0'.repeat(40),
  sourceDirty: false,
};

describe('audition kataloğu üretimi', () => {
  it('katalog kısa listeden çıkar ve şemayı geçer', () => {
    const candidates = [
      candidate(0),
      candidate(1, { primary: 'GAS', metrics: metrics({ clusteredFraction: 0.1 }) }),
      candidate(2, { primary: 'SINGLE_COLLAPSE', metrics: metrics({ clusterCount: 1 }) }),
      candidate(3, { metrics: metrics({ meanSpeed: 1.2 }) }),
    ];

    const { catalog, shortlist } = buildAuditionCatalog(candidates, context);

    expect(() => validateAuditionCatalog(catalog, RADIUS)).not.toThrow();
    expect(catalog.seeds).toEqual([11, 22, 33]);
    expect(catalog.entries.length).toBeGreaterThanOrEqual(3);
    expect(shortlist.phaseCoverage.length).toBeGreaterThanOrEqual(3);
  });

  it('tohum sayısı üç değilse katalog yazılmaz', () => {
    expect(() =>
      buildAuditionCatalog([candidate(0), candidate(1), candidate(2)], {
        ...context,
        seeds: [1, 2],
      }),
    ).toThrow(RangeError);
  });

  it('her girişin digest’i kendi genomundan çıkar', () => {
    const { catalog } = buildAuditionCatalog(
      [candidate(0), candidate(1), candidate(2), candidate(3)],
      context,
    );
    for (const entry of catalog.entries) {
      expect(entry.digest).toMatch(/^[0-9a-f]{16}$/);
      expect(entry.genome).toContain('"schemaVersion"');
    }
  });
});

describe('davranış ailesi', () => {
  it('madde kaybeden aday yapılı da olsa fragile’dır', () => {
    expect(familyOf(metrics({ retention: 0.4 }))).toBe('fragile');
  });

  it('hızlı yapılı aday mobile, yavaş sıkı aday core-like’tır', () => {
    expect(familyOf(metrics({ meanSpeed: 0.8, maxSpeed: 2 }))).toBe('mobile');
    expect(familyOf(metrics({ meanSpeed: 0.05, clusterCompactness: 0.9 }))).toBe('core-like');
  });

  it('kabuk benzeri yapı membrane-like’tır', () => {
    expect(familyOf(metrics({ clusterCompactness: 0.2, clusterAnisotropy: 0.8 }))).toBe(
      'membrane-like',
    );
  });

  it('yapı yoksa aile UYDURULMAZ', () => {
    expect(familyOf(metrics({ clusteredFraction: 0.05 }))).toBe(UNCLASSIFIED_FAMILY);
  });

  /*
   * chasing/symbiotic/recovering bu koşunun ölçmediği davranışlardır; hiçbir
   * metrik bileşimi onları otomatik üretemez.
   */
  it('ölçülmeyen aileler otomatik atanmaz', () => {
    const allowed = new Set<string>([...AUTOMATIC_FAMILIES, UNCLASSIFIED_FAMILY]);
    for (let step = 0; step <= 64; step++) {
      const t = step / 64;
      const family = familyOf(
        metrics({
          clusteredFraction: t,
          clusterCompactness: 1 - t,
          clusterAnisotropy: t,
          meanSpeed: 2 * t,
          retention: t,
          radialStructure: 1 - t,
          clusterCount: Math.round(t * 20),
        }),
      );
      expect(allowed.has(family)).toBe(true);
    }
  });

  it('metrik vektörü sonlu ve [0, 1] aralığındadır', () => {
    const vector = metricVector(
      metrics({ clusteredFraction: Number.NaN, clusterCount: 999, retention: -3 }),
    );
    for (const value of vector) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
