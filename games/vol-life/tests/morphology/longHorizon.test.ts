import { describe, expect, it } from 'vitest';
import {
  compactSample,
  defaultLongHorizonGate,
  evaluateLongHorizon,
  scenarioOf,
  type LongHorizonUnitOutput,
} from '@/../scripts/morphology/longHorizon';
import type { MorphologySample } from '@/../scripts/morphology/metrics';
import type { PhaseClassification } from '@/../scripts/morphology/phaseClassifier';
import { defaultSubstrateCandidate, serializeSubstrateCandidate } from '@/config/candidate';

function classification(primary: PhaseClassification['primary']): PhaseClassification {
  return { primary, reasons: [primary], confidence: 1, details: [] };
}

function output(overrides: Partial<LongHorizonUnitOutput> = {}): LongHorizonUnitOutput {
  return {
    seed: 1,
    scenario: 'intrinsic',
    initialCount: 512,
    retention: 0.8,
    classification: classification('DYNAMIC_STRUCTURED'),
    perturbations: [],
    curve: [],
    ticks: 108_000,
    ...overrides,
  };
}

function corpus(count: number, shape: (seed: number) => Partial<LongHorizonUnitOutput>) {
  return Array.from({ length: count }, (_, index) => output({ seed: index, ...shape(index) }));
}

describe('F7 — uzun ufuk değerlendirmesi', () => {
  it('eşikleri geçen korpus GEÇER', () => {
    const verdict = evaluateLongHorizon(corpus(32, () => ({})));
    expect(verdict.passed).toBe(true);
    expect(verdict.failures).toEqual([]);
    expect(verdict.seedCount).toBe(32);
  });

  it('koruma medyanı 0,70’in altına düşerse FAIL', () => {
    const verdict = evaluateLongHorizon(corpus(32, () => ({ retention: 0.65 })));
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.join(' ')).toContain('koruma medyanı');
  });

  /* Medyan geçse bile TEK bir seed 0,40'ın altına düşerse aday geçemez. */
  it('tek kötü seed korumayı düşürür', () => {
    const verdict = evaluateLongHorizon(
      corpus(32, (seed) => (seed === 0 ? { retention: 0.3 } : {})),
    );
    expect(verdict.retentionMedian).toBeGreaterThanOrEqual(defaultLongHorizonGate.retentionMedian);
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.join(' ')).toContain('en kötü seed');
  });

  it('sert FAIL gerekçesi seed’lerin yarısındaysa FAIL', () => {
    const verdict = evaluateLongHorizon(
      corpus(32, (seed) => (seed < 16 ? { classification: classification('GAS') } : {})),
    );
    expect(verdict.hardFailShares.GAS).toBeCloseTo(0.5, 5);
    expect(verdict.failures.join(' ')).toContain('GAS');
  });

  it('DYNAMIC_STRUCTURED payı %75’in altındaysa FAIL', () => {
    const verdict = evaluateLongHorizon(
      corpus(32, (seed) => (seed < 12 ? { classification: classification('STASIS') } : {})),
    );
    expect(verdict.structuredShare).toBeCloseTo(0.625, 5);
    expect(verdict.failures.join(' ')).toContain('DYNAMIC_STRUCTURED');
  });

  /* Perturbation KOŞULMADIYSA toparlanma iddiası da edilmez. */
  it('perturbation yoksa toparlanma kuralı FAIL üretmez', () => {
    const verdict = evaluateLongHorizon(corpus(32, () => ({ perturbations: [] })));
    expect(verdict.failures.join(' ')).not.toContain('toparlanan');
  });

  it('toparlanma seed’lerin %75’inde sağlanmazsa FAIL', () => {
    const recovered = { recovered: true } as LongHorizonUnitOutput['perturbations'][number];
    const failed = { recovered: false } as LongHorizonUnitOutput['perturbations'][number];
    const verdict = evaluateLongHorizon(
      corpus(32, (seed) => ({ perturbations: [seed < 16 ? failed : recovered] })),
    );
    expect(verdict.recoveredShare).toBeCloseTo(0.5, 5);
    expect(verdict.failures.join(' ')).toContain('toparlanan');
  });

  it('boş korpus değerlendirilemez', () => {
    expect(() => evaluateLongHorizon([])).toThrow(RangeError);
  });
});

describe('uzun ufuk eğrisi', () => {
  it('küme kadro değişimi madde ağırlıklı toplanır', () => {
    const sample = {
      tick: 600,
      activeCount: 300,
      clusteredFraction: 0.8,
      clusterCount: 2,
      meanSpeed: 0.2,
      voidLossCount: 12,
      cappedFraction: 0,
      fringeStructuredFraction: 0.1,
      clusters: [
        { size: 100, churn: 0.1, ageTicks: 600 },
        { size: 300, churn: 0.5, ageTicks: 1200 },
      ],
    } as unknown as MorphologySample;

    const point = compactSample(sample);

    expect(point.churn).toBeCloseTo((0.1 * 100 + 0.5 * 300) / 400, 6);
    expect(point.oldestClusterTicks).toBe(1200);
    expect(point.activeCount).toBe(300);
  });

  it('kümesiz örnekte churn sıfırdır', () => {
    const sample = { tick: 0, clusters: [], activeCount: 512 } as unknown as MorphologySample;
    expect(compactSample(sample).churn).toBe(0);
    expect(compactSample(sample).oldestClusterTicks).toBe(0);
  });

  /* Senaryo etiketi adayın KENDİ metninden okunur; çağıranın iddiasından değil. */
  it('senaryo aday metninden okunur', () => {
    expect(scenarioOf(serializeSubstrateCandidate(defaultSubstrateCandidate))).toBe('intrinsic');
    expect(
      scenarioOf(
        serializeSubstrateCandidate({
          ...defaultSubstrateCandidate,
          scenario: { kind: 'void-stress', tidalControl: false },
        }),
      ),
    ).toBe('void-stress');
    expect(() => scenarioOf('{}')).toThrow(RangeError);
  });
});
