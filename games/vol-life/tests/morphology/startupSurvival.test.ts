import { describe, expect, it } from 'vitest';
import {
  defaultStartupGate,
  evaluateStartupSurvival,
  isAtSpeedCap,
  measureStartupSurvival,
  type StartupMetrics,
  type StartupSample,
  type StartupSeries,
} from '@/../scripts/morphology/startupSurvival';

/*
 * E9: kapı §8.4'ten birebir gelir. Testler üç satırı AYRI AYRI düşürür —
 * üçü birden bozulursa hangisinin çalıştığı bilinmez (E7 presedansı).
 *
 * Sentetik serinin kaybı BİLİNİR: 1000 maddeden saniyede %3, 10 sn'de 0,70
 * koruma ve 0,30 Void kaybı. TODO'nun tarif ettiği "ilk 10 saniyede %30-50
 * maddeyi Void'e fırlatan profil" tam olarak budur.
 */
const INITIAL = 1000;
const SAMPLE_STEP = 0.1;
const END_SECONDS = 60;

interface SeriesShape {
  readonly retention?: (seconds: number) => number;
  readonly meanSpeed?: (seconds: number) => number;
  readonly cappedFraction?: (seconds: number) => number;
}

/** Yatışmış taban: kayıp yok, hız 2. saniyede 5'ten 1'e iner, tavan boş. */
const healthy: Required<SeriesShape> = {
  retention: () => 1,
  meanSpeed: (seconds) => (seconds < 2 ? 5 : 1),
  cappedFraction: () => 0,
};

function makeSeries(seed: number, shape: SeriesShape = {}): StartupSeries {
  const retention = shape.retention ?? healthy.retention;
  const meanSpeed = shape.meanSpeed ?? healthy.meanSpeed;
  const cappedFraction = shape.cappedFraction ?? healthy.cappedFraction;
  const samples: StartupSample[] = [];
  for (let step = 0; step * SAMPLE_STEP <= END_SECONDS + 1e-9; step++) {
    const seconds = Number((step * SAMPLE_STEP).toFixed(6));
    const activeCount = Math.round(retention(seconds) * INITIAL);
    samples.push({
      seconds,
      activeCount,
      meanSpeed: meanSpeed(seconds),
      cappedFraction: cappedFraction(seconds),
      voidLossTotal: INITIAL - activeCount,
    });
  }
  return { seed, initialCount: INITIAL, samples };
}

/** Saniyede %3 kayıp, %40'ta taban. */
function lossyRetention(seconds: number): number {
  return Math.max(0.4, 1 - 0.03 * seconds);
}

function corpus(count: number, shape: (seed: number) => SeriesShape): StartupMetrics[] {
  return Array.from({ length: count }, (_, index) =>
    measureStartupSurvival(makeSeries(index + 1, shape(index + 1))),
  );
}

describe('Başlangıç sağkalımı metrikleri (E9)', () => {
  it('bilinen kayıplı seride dört metriği de tam değerle ölçer', () => {
    const metrics = measureStartupSurvival(makeSeries(1, { retention: lossyRetention }));

    expect(metrics.matterRetention5).toBeCloseTo(0.85, 6);
    expect(metrics.matterRetention10).toBeCloseTo(0.7, 6);
    expect(metrics.matterRetention30).toBeCloseTo(0.4, 6);
    expect(metrics.startupVoidLoss).toBeCloseTo(0.3, 6);
  });

  it('erken patlama tepesini yalnız ilk 10 saniyeden alır', () => {
    // 20. saniyedeki daha yüksek tepe PENCERE DIŞIDIR ve sayılmamalı.
    const metrics = measureStartupSurvival(
      makeSeries(1, { cappedFraction: (s) => (s < 3 ? 0.2 : s > 19 && s < 21 ? 0.9 : 0) }),
    );

    expect(metrics.earlyBurstPeak).toBeCloseTo(0.2, 6);
  });

  it('yatışma anını 20–60 sn medyanının 1,2 katına göre bulur', () => {
    const metrics = measureStartupSurvival(makeSeries(1));

    // Band = 1,2 × 1 = 1,2; hız 2. saniyede 1'e iniyor.
    expect(metrics.timeToStructuralRegime).toBeCloseTo(2, 6);
    expect(metrics.speedPeakSeconds).toBe(0);
    expect(metrics.speedPeak).toBeCloseTo(5, 6);
    expect(metrics.transientOvershoot).toBeCloseTo(5, 6);
  });

  /*
   * GERÇEK ÖLÇÜMÜN ŞEKLİ (12 seed × 2 yapılandırma): hız DÜŞÜK başlar,
   * yükselir, tepeyi saniyeler sonra yapar. "Banda ilk değme" ölçütü böyle bir
   * koşuya sıfır verir ve patlamayı hiç görmez; kalıcı yatışma dünyanın
   * gerçekten ne zaman rejime girdiğini söyler.
   */
  it('yükselen transientte yatışma tepeden SONRA ölçülür', () => {
    const metrics = measureStartupSurvival(
      makeSeries(1, { meanSpeed: (s) => (s < 30 ? 0.1 + s * 0.05 : 1.2) }),
    );

    expect(metrics.timeToStructuralRegime).toBeCloseTo(30, 6);
    expect(metrics.speedPeakSeconds).toBeCloseTo(29.9, 1);
    expect(metrics.transientOvershoot).toBeGreaterThan(1.2);
  });

  it('koşu sonunda hâlâ bandın üstündeyse rejime hiç girmemiştir', () => {
    const metrics = measureStartupSurvival(makeSeries(1, { meanSpeed: (s) => (s < 50 ? 1 : 5) }));

    expect(metrics.timeToStructuralRegime).toBe(Number.POSITIVE_INFINITY);
    expect(metrics.transientOvershoot).toBeCloseTo(5, 6);
  });

  /* Kalıcılık şartının çalıştığı yer: geç aşımlar yatışmayı İLERİ iter. */
  it('geç aşımlar yatışma anını ileri iter', () => {
    const metrics = measureStartupSurvival(
      makeSeries(1, {
        meanSpeed: (s) => (s < 2 ? 5 : s >= 20 && s < 51 && Math.floor(s) % 10 === 0 ? 9 : 1),
      }),
    );

    expect(metrics.timeToStructuralRegime).toBeCloseTo(51, 6);
    expect(metrics.speedPeakSeconds).toBeCloseTo(20, 6);
  });

  it('eksik kapsam ve geçersiz girdi sessizce sıfırlanmaz', () => {
    const short = makeSeries(1);
    const truncated: StartupSeries = {
      ...short,
      samples: short.samples.filter((s) => s.seconds <= 30),
    };

    expect(() => measureStartupSurvival(truncated)).toThrow(RangeError);
    expect(() => measureStartupSurvival({ ...short, initialCount: 0 })).toThrow(RangeError);
    expect(() => measureStartupSurvival({ ...short, samples: [] })).toThrow(RangeError);
  });

  it('hız tavanı sayımının tek tanımı vardır', () => {
    expect(isAtSpeedCap(2, 2)).toBe(true);
    expect(isAtSpeedCap(1.999, 2)).toBe(true);
    expect(isAtSpeedCap(1.9, 2)).toBe(false);
  });
});

describe('Başlangıç sağkalımı kapısı (E9)', () => {
  it('sağlıklı korpus üç satırı da geçer', () => {
    const verdict = evaluateStartupSurvival(corpus(12, () => ({})));

    expect(verdict.passed).toBe(true);
    expect(verdict.startupMassacre).toBe(false);
    expect(verdict.reasons).toEqual([]);
  });

  it('yalnız sağkalım satırı düşer ve STARTUP_MASSACRE gerekçesi doğar', () => {
    const verdict = evaluateStartupSurvival(corpus(12, () => ({ retention: lossyRetention })));

    expect(verdict.initialSurvival).toBe(false);
    expect(verdict.startupMassacre).toBe(true);
    expect(verdict.earlyBurst).toBe(true);
    expect(verdict.transientSettling).toBe(true);
    expect(verdict.retention10Median).toBeCloseTo(0.7, 6);
  });

  /* Medyan geçse bile en kötü ondalık dilim tek başına kapıyı düşürmeli. */
  it('yalnız en kötü ondalık dilim yüzünden düşer', () => {
    const verdict = evaluateStartupSurvival(
      corpus(12, (seed) =>
        seed <= 2 ? { retention: (s) => (s <= 10 ? 0.85 : 0.95) } : { retention: () => 0.99 },
      ),
    );

    expect(verdict.retention10Median).toBeGreaterThanOrEqual(
      defaultStartupGate.retention10MedianMin,
    );
    expect(verdict.retention30Median).toBeGreaterThanOrEqual(
      defaultStartupGate.retention30MedianMin,
    );
    expect(verdict.retention10WorstDecile).toBeLessThan(
      defaultStartupGate.retention10WorstDecileMin,
    );
    expect(verdict.initialSurvival).toBe(false);
  });

  it('yalnız erken patlama satırı düşer', () => {
    const verdict = evaluateStartupSurvival(
      corpus(12, (seed) => (seed <= 7 ? { cappedFraction: (s) => (s < 5 ? 0.2 : 0) } : {})),
    );

    expect(verdict.earlyBurst).toBe(false);
    expect(verdict.earlyBurstFailureFraction).toBeGreaterThanOrEqual(
      defaultStartupGate.seedFailureFractionForReject,
    );
    expect(verdict.initialSurvival).toBe(true);
    expect(verdict.transientSettling).toBe(true);
  });

  /* Tavandaki pay azınlık seed'deyse §8.4'ün toplama kuralı reddetmez. */
  it('erken patlama azınlıkta kalırsa satır düşmez', () => {
    const verdict = evaluateStartupSurvival(
      corpus(12, (seed) => (seed <= 3 ? { cappedFraction: (s) => (s < 5 ? 0.2 : 0) } : {})),
    );

    expect(verdict.earlyBurstFailureFraction).toBeCloseTo(0.25, 6);
    expect(verdict.earlyBurst).toBe(true);
    expect(verdict.passed).toBe(true);
  });

  it('yalnız transient yatışması satırı düşer', () => {
    const verdict = evaluateStartupSurvival(
      corpus(12, (seed) => (seed <= 3 ? { meanSpeed: (s) => (s < 50 ? 1 : 5) } : {})),
    );

    expect(verdict.settledSeedFraction).toBeCloseTo(0.75, 6);
    expect(verdict.transientSettling).toBe(false);
    expect(verdict.initialSurvival).toBe(true);
    expect(verdict.earlyBurst).toBe(true);
  });

  it('seedsiz korpus reddedilir', () => {
    expect(() => evaluateStartupSurvival([])).toThrow(RangeError);
  });
});
