import { describe, expect, it } from 'vitest';
import { substrateConfig } from '@/config/substrate';
import { ParticleStore } from '@/runtime/sim/ParticleStore';
import { createHabitatDomain } from '@/runtime/sim/WorldDomain';
import {
  MorphologyMetrics,
  defaultMetricsConfig,
  type MorphologySample,
} from '@/../scripts/morphology/metrics';
import {
  PhaseClassifier,
  REASON_CODES,
  aggregateSeedVerdicts,
  isStructured,
  type PhaseClassification,
  type ReasonCode,
} from '@/../scripts/morphology/phaseClassifier';

/*
 * E11: her gerekçe kodu SENTETİK seriyle ayrı ayrı üretilir. Gerçek fizikli
 * mikro fixture'lar `tests/long/phaseClassifier.long.ts`tedir (süre kuralları
 * dakikalar istiyor); `MICRO_ORBIT_PERSISTENT` E8'in, `STARTUP_MASSACRE` E9'un
 * uzun testinde gerçek fizikle zaten üretiliyor.
 *
 * Pencereler tempodan çıkar: 60 sn = 360 örnek, 5 dk = 1800 örnek.
 */
const INITIAL = 100;
const WINDOW_60S = 360;
const WINDOW_5M = 1800;

/** Hiçbir kuralın ateşlemediği taban örnek; her test yalnız kendi alanını bozar. */
function healthy(): Partial<MorphologySample> {
  return {
    activeCount: INITIAL,
    meanSpeed: 0.5,
    cappedFraction: 0,
    clusteredFraction: 0.5,
    clusterSizeMax: 30,
    clusterCompactness: 0.5,
  };
}

function baseSample(): MorphologySample {
  return new MorphologyMetrics(defaultMetricsConfig).sample(
    new ParticleStore(4),
    createHabitatDomain(substrateConfig.world.boundsUnits, substrateConfig.habitat, 7),
    0,
    0,
  );
}

function makeSeries(
  count: number,
  overrides: Partial<MorphologySample> | ((index: number) => Partial<MorphologySample>) = {},
): MorphologySample[] {
  const base = baseSample();
  return Array.from({ length: count }, (_, index) => ({
    ...base,
    tick: index,
    ...healthy(),
    ...(typeof overrides === 'function' ? overrides(index) : overrides),
  }));
}

const classifier = new PhaseClassifier();

function classify(
  series: MorphologySample[],
  context: Parameters<PhaseClassifier['classify']>[2] = {},
): PhaseClassification {
  return classifier.classify(series, INITIAL, context);
}

describe('Gerekçe kodları (E11)', () => {
  it('kod listesi donmuştur ve on bir koddan oluşur', () => {
    expect(REASON_CODES).toHaveLength(11);
    expect(REASON_CODES).toContain('STARTUP_MASSACRE');
    expect(REASON_CODES).toContain('FRINGE_DEPENDENT');
    expect(REASON_CODES).toContain('CRYSTAL_FROZEN');
  });

  it('DEAD: aktif madde %5’in altına inince', () => {
    const verdict = classify(makeSeries(10, { activeCount: 4 }));

    expect(verdict.primary).toBe('DEAD');
    expect(verdict.reasons).toContain('DEAD');
  });

  it('STARTUP_MASSACRE: E9 kapısı düşünce (bağlama testi)', () => {
    const verdict = classify(makeSeries(10), { startupMassacre: true });

    expect(verdict.primary).toBe('STARTUP_MASSACRE');
  });

  it('VOID_LOSS_DOMINATED: maddenin yarısından fazlası kaybolunca', () => {
    const verdict = classify(
      makeSeries(10, (index) => ({ activeCount: index === 9 ? 30 : INITIAL })),
    );

    expect(verdict.reasons).toContain('VOID_LOSS_DOMINATED');
  });

  /* §8.4: tavandaki parçacık payı ≥ %30, ≥ 60 sn. ORTALAMA HIZ değil. */
  it('SPEED_CAP_CHAOS: tavandaki pay 60 saniye boyunca eşiğin üstünde', () => {
    const verdict = classify(makeSeries(WINDOW_60S, { cappedFraction: 0.35 }));

    expect(verdict.reasons).toContain('SPEED_CAP_CHAOS');
  });

  it('SPEED_CAP_CHAOS ortalama hızla DEĞİL, tavandaki payla ateşler', () => {
    // Hız yüksek ama kimse tavanda değil: kural ateşlememeli.
    const verdict = classify(makeSeries(WINDOW_60S, { meanSpeed: 2.3, cappedFraction: 0 }));

    expect(verdict.reasons).not.toContain('SPEED_CAP_CHAOS');
  });

  /* §8.4: hız tavanın %2'sinin (2,4 × 0,02 = 0,048) altında, ≥ 60 sn. */
  it('STASIS: hız tavanın %2’sinin altında 60 saniye', () => {
    const verdict = classify(makeSeries(WINDOW_60S, { meanSpeed: 0.01 }));

    expect(verdict.reasons).toContain('STASIS');
  });

  it('STASIS eşiği MUTLAK değil, tavanın oranıdır', () => {
    // 0,03 eski mutlak eşiğin (0,02) ÜSTÜNDE ama tavanın %2'sinin (0,048) altında.
    const verdict = classify(makeSeries(WINDOW_60S, { meanSpeed: 0.03 }));

    expect(verdict.reasons).toContain('STASIS');
  });

  it('CRYSTAL_FROZEN: yüksek kompaktlık ve neredeyse sıfır hız', () => {
    const verdict = classify(makeSeries(10, { clusterCompactness: 0.9, meanSpeed: 0.005 }));

    expect(verdict.reasons).toContain('CRYSTAL_FROZEN');
  });

  it('SINGLE_COLLAPSE: en büyük küme 5 dakika boyunca maddenin %80’i', () => {
    const verdict = classify(makeSeries(WINDOW_5M, { clusterSizeMax: 85 }));

    expect(verdict.reasons).toContain('SINGLE_COLLAPSE');
  });

  it('GAS: kümedeki madde 5 dakika boyunca %20’nin altında', () => {
    const verdict = classify(makeSeries(WINDOW_5M, { clusteredFraction: 0.1 }));

    expect(verdict.reasons).toContain('GAS');
  });

  it('MICRO_ORBIT_PERSISTENT: micro-orbit payı 5 dakika boyunca %5’in üstünde', () => {
    const series = makeSeries(WINDOW_5M);
    const verdict = classify(series, {
      microOrbitFractionSeries: series.map(() => 0.08),
    });

    expect(verdict.reasons).toContain('MICRO_ORBIT_PERSISTENT');
  });

  it('FRINGE_DEPENDENT: E10 ölçümü bağımlılık bulunca (bağlama testi)', () => {
    const verdict = classify(makeSeries(10), { fringeDependent: true });

    expect(verdict.reasons).toContain('FRINGE_DEPENDENT');
  });

  it('DYNAMIC_STRUCTURED: hiçbir gerekçe ateşlemeyince', () => {
    const verdict = classify(makeSeries(WINDOW_5M));

    expect(verdict.primary).toBe('DYNAMIC_STRUCTURED');
    expect(verdict.reasons).toEqual(['DYNAMIC_STRUCTURED']);
  });
});

describe('Zaman penceresi (E11)', () => {
  /*
   * ESKİ HATA: `stasisDurationTicks` TICK sayısıydı ama örnek sayısıyla
   * karşılaştırılıyordu; örnek aralığı 10 tick olduğu için 60 tick'lik kural
   * 600 tick boyunca aranıyordu. Artık süre saniyedir ve tempoyla çevrilir.
   */
  it('pencereden kısa seride süre kuralı ATEŞLEMEZ', () => {
    const short = classify(makeSeries(WINDOW_60S - 1, { cappedFraction: 0.9 }));
    const long = classify(makeSeries(WINDOW_60S, { cappedFraction: 0.9 }));

    expect(short.reasons).not.toContain('SPEED_CAP_CHAOS');
    expect(long.reasons).toContain('SPEED_CAP_CHAOS');
  });

  it('koşul pencerenin İÇİNDE bir kez bozulursa kural ateşlemez', () => {
    const series = makeSeries(WINDOW_60S, (index) => ({
      cappedFraction: index === WINDOW_60S - 5 ? 0.1 : 0.9,
    }));

    expect(classify(series).reasons).not.toContain('SPEED_CAP_CHAOS');
  });

  it('hizasız micro-orbit serisi sessizce kabul edilmez', () => {
    expect(() => classify(makeSeries(10), { microOrbitFractionSeries: [0.5, 0.5] })).toThrow(
      RangeError,
    );
  });
});

describe('Birden fazla gerekçe ve birincil seçimi (E11)', () => {
  it('bir seed birden fazla gerekçe taşıyabilir', () => {
    const verdict = classify(makeSeries(WINDOW_5M, { clusteredFraction: 0.1, meanSpeed: 0.01 }));

    expect(verdict.reasons).toContain('GAS');
    expect(verdict.reasons).toContain('STASIS');
    expect(verdict.reasons.length).toBeGreaterThan(1);
  });

  it('birincil gerekçe şiddet sırasına göre seçilir', () => {
    const verdict = classify(makeSeries(WINDOW_5M, { activeCount: 4, clusteredFraction: 0.1 }), {
      fringeDependent: true,
    });

    // DEAD, GAS ve FRINGE_DEPENDENT birlikte; en temel olan DEAD.
    expect(verdict.reasons).toContain('GAS');
    expect(verdict.reasons).toContain('FRINGE_DEPENDENT');
    expect(verdict.primary).toBe('DEAD');
  });
});

describe('Aday toplama: çoğunluk, plurality değil (E11)', () => {
  function verdictsOf(codes: readonly ReasonCode[]): PhaseClassification[] {
    return codes.map((code) => ({
      primary: code,
      reasons: [code],
      confidence: 0.9,
      details: [],
    }));
  }

  it('bir gerekçe seed’lerin yarısında görülürse aday düşer', () => {
    const aggregation = aggregateSeedVerdicts(
      verdictsOf([
        'GAS',
        'GAS',
        'GAS',
        'GAS',
        'GAS',
        'GAS',
        'STASIS',
        'STASIS',
        'STASIS',
        'STASIS',
        'DYNAMIC_STRUCTURED',
        'DYNAMIC_STRUCTURED',
      ]),
    );

    expect(aggregation.majorityReason).toBe('GAS');
    expect(aggregation.failed).toBe(true);
    expect(aggregation.structured).toBe(false);
  });

  /*
   * REGRESYON: eski `dominantPhase` en çok görülen fazı seçiyordu. Burada GAS
   * %42 ile en çok görülen ama ÇOĞUNLUK değil; aday ne GAS ilan edilir ne de
   * yapısal sayılır.
   */
  it('en çok görülen gerekçe çoğunluk değilse aday o gerekçeyle damgalanmaz', () => {
    const aggregation = aggregateSeedVerdicts(
      verdictsOf([
        'GAS',
        'GAS',
        'GAS',
        'GAS',
        'GAS',
        'STASIS',
        'STASIS',
        'STASIS',
        'STASIS',
        'DYNAMIC_STRUCTURED',
        'DYNAMIC_STRUCTURED',
        'DYNAMIC_STRUCTURED',
      ]),
    );

    expect(aggregation.reasonCounts.GAS).toBe(5);
    expect(aggregation.majorityReason).toBeNull();
    expect(aggregation.failed).toBe(false);
    expect(aggregation.structured).toBe(false);
    expect(isStructured(aggregation)).toBe(false);
  });

  it('DYNAMIC_STRUCTURED için seed’lerin dörtte üçü gerekir', () => {
    const nine = aggregateSeedVerdicts(
      verdictsOf([
        ...Array.from({ length: 9 }, () => 'DYNAMIC_STRUCTURED' as ReasonCode),
        'GAS',
        'STASIS',
        'CRYSTAL_FROZEN',
      ]),
    );
    const eight = aggregateSeedVerdicts(
      verdictsOf([
        ...Array.from({ length: 8 }, () => 'DYNAMIC_STRUCTURED' as ReasonCode),
        'GAS',
        'GAS',
        'STASIS',
        'CRYSTAL_FROZEN',
      ]),
    );

    expect(nine.structured).toBe(true);
    expect(isStructured(nine)).toBe(true);
    expect(eight.structured).toBe(false);
  });

  it('çoğunlukta sert gerekçe varken yapı iddiası geçersizdir', () => {
    const aggregation = aggregateSeedVerdicts([
      ...verdictsOf(Array.from({ length: 9 }, () => 'DYNAMIC_STRUCTURED' as ReasonCode)),
      ...Array.from({ length: 3 }, () => ({
        primary: 'GAS' as ReasonCode,
        reasons: ['GAS', 'DYNAMIC_STRUCTURED'] as ReasonCode[],
        confidence: 0.9,
        details: [],
      })),
    ]);

    // DYNAMIC_STRUCTURED 12/12 ama GAS de 3/12; çoğunluk eşiğini geçmiyor.
    expect(aggregation.structured).toBe(true);
    expect(aggregation.failed).toBe(false);
  });

  it('seedsiz toplama reddedilir', () => {
    expect(() => aggregateSeedVerdicts([])).toThrow(RangeError);
  });
});

describe('Sınıflandırılamayan koşu (E11)', () => {
  it('yapı ölçütü tutmazsa gerekçe listesi boş kalır ve güven düşer', () => {
    const verdict = classify(makeSeries(10, { clusterCompactness: 0.2, meanSpeed: 0.2 }));

    expect(verdict.reasons).toEqual([]);
    expect(verdict.confidence).toBeLessThan(0.5);
  });

  it('boş seri DEAD verir', () => {
    expect(classifier.classify([], INITIAL).primary).toBe('DEAD');
  });
});
