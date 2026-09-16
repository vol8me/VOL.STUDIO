import type { ParticleStore } from '@/runtime/sim/ParticleStore';
import { medianOf, percentile } from './stats';

/**
 * E9 — başlangıç sağkalımı resmi morfoloji kriteri.
 *
 * Eşikler §8.4'ten BİREBİR alınmıştır ve herhangi bir ölçümden ÖNCE yazılmıştır;
 * bir adayı geçirmek için değiştirilemezler (§8.4 ön-kayıt kuralı). Bir eşik
 * değişirse o ana kadarki bütün sağkalım sonuçları geçersizdir.
 *
 * Metrik tanımları TODO'daki maddeden gelir: "ilk 10 saniyede dünyanın %30-50
 * maddesini Void'e fırlatan profile" — yani `startupVoidLoss` ilk 10 saniyede
 * Void'e giden maddenin başlangıç maddesine oranıdır.
 */

/**
 * Hız tavanında sayılma toleransı. "Tavandaki parçacık payı" tek yerde
 * tanımlıdır; örnekleyen taraf da bu sabiti kullanır.
 */
export const SPEED_CAP_EPSILON = 0.999;

export function isAtSpeedCap(speed: number, maxSpeed: number): boolean {
  return speed >= maxSpeed * SPEED_CAP_EPSILON;
}

export interface StartupSample {
  readonly seconds: number;
  readonly activeCount: number;
  readonly meanSpeed: number;
  /** `isAtSpeedCap` ile sayılmış, tavandaki parçacıkların aktiflere oranı. */
  readonly cappedFraction: number;
  /** Koşu başından beri Void'e düşen toplam madde (kümülatif). */
  readonly voidLossTotal: number;
}

export interface StartupSeries {
  readonly seed: number;
  readonly initialCount: number;
  readonly samples: readonly StartupSample[];
}

export interface StartupMetrics {
  readonly seed: number;
  readonly matterRetention5: number;
  readonly matterRetention10: number;
  readonly matterRetention30: number;
  readonly startupVoidLoss: number;
  readonly earlyBurstPeak: number;
  /**
   * §8.4'ün LAFZI: ortalama hızın bandın altına ilk indiği an (sn). Bu
   * substratta ayırt etmediği ÖLÇÜLDÜ; gerekçe ve sayılar DESIGN §8'de.
   */
  readonly timeToStructuralRegime: number;
  /** Ortalama hızın tepe yaptığı an ve değeri; dejenerasyonun kanıtı. */
  readonly speedPeakSeconds: number;
  readonly speedPeak: number;
}

export interface StartupGate {
  readonly retention10MedianMin: number;
  readonly retention10WorstDecileMin: number;
  readonly retention30MedianMin: number;
  readonly earlyBurstMaxCappedFraction: number;
  readonly earlyWindowSeconds: number;
  readonly settlingSeconds: number;
  readonly settlingSeedFractionMin: number;
  /** §8.4 "Aday toplama": bir sert gerekçe seed'lerin ≥ %50'sinde ise FAIL. */
  readonly seedFailureFractionForReject: number;
  readonly transientWindowStartSeconds: number;
  readonly transientWindowEndSeconds: number;
  readonly transientBandMultiple: number;
}

export const defaultStartupGate: StartupGate = {
  retention10MedianMin: 0.95,
  retention10WorstDecileMin: 0.9,
  retention30MedianMin: 0.9,
  earlyBurstMaxCappedFraction: 0.1,
  earlyWindowSeconds: 10,
  settlingSeconds: 4,
  settlingSeedFractionMin: 0.9,
  seedFailureFractionForReject: 0.5,
  transientWindowStartSeconds: 20,
  transientWindowEndSeconds: 60,
  transientBandMultiple: 1.2,
};

export interface StartupVerdict {
  readonly initialSurvival: boolean;
  readonly earlyBurst: boolean;
  readonly transientSettling: boolean;
  readonly retention10Median: number;
  readonly retention10WorstDecile: number;
  readonly retention30Median: number;
  readonly earlyBurstFailureFraction: number;
  readonly settledSeedFraction: number;
  /**
   * Sağkalım satırının düştüğünü söyler. Bunu `STARTUP_MASSACRE` enum üyesine
   * BAĞLAMAK E11'in işidir; sabit gerekçe enum'u bu modülde tanımlanmaz.
   */
  readonly startupMassacre: boolean;
  readonly passed: boolean;
  readonly reasons: readonly string[];
}

/** Örnek aralığı kayan noktalıdır; an eşleşmesi tam eşitlikle aranmaz. */
const SECOND_TOLERANCE = 1e-6;

export function measureStartupSurvival(
  series: StartupSeries,
  gate: StartupGate = defaultStartupGate,
): StartupMetrics {
  if (series.initialCount <= 0) {
    throw new RangeError(`Başlangıç maddesi pozitif olmalı: ${series.initialCount}`);
  }
  if (series.samples.length === 0) throw new RangeError('Sağkalım serisi boş olamaz.');
  const covered = series.samples[series.samples.length - 1].seconds;
  if (covered + SECOND_TOLERANCE < gate.transientWindowEndSeconds) {
    throw new RangeError(
      `Seri ${gate.transientWindowEndSeconds} sn'yi kapsamalı, ${covered} sn kapsıyor.`,
    );
  }

  const early = series.samples.filter((s) => s.seconds <= gate.earlyWindowSeconds);
  const band = settlingBand(series.samples, gate);
  const settleIndex = series.samples.findIndex((s) => s.meanSpeed < band);
  const speedPeakSample = series.samples.reduce(
    (best, sample) => (sample.meanSpeed > best.meanSpeed ? sample : best),
    series.samples[0],
  );

  return {
    seed: series.seed,
    matterRetention5: retentionAt(series, 5),
    matterRetention10: retentionAt(series, 10),
    matterRetention30: retentionAt(series, 30),
    startupVoidLoss: sampleAt(series, gate.earlyWindowSeconds).voidLossTotal / series.initialCount,
    earlyBurstPeak: early.reduce((peak, s) => Math.max(peak, s.cappedFraction), 0),
    timeToStructuralRegime:
      settleIndex >= 0 ? series.samples[settleIndex].seconds : Number.POSITIVE_INFINITY,
    speedPeakSeconds: speedPeakSample.seconds,
    speedPeak: speedPeakSample.meanSpeed,
  };
}

/**
 * Yatışma bandı: 20–60 sn ortalama hız medyanının 1,2 katı. Pencere serinin
 * İÇİNDEN gelir; boşsa banda karar verilemez ve hata atılır — sessizce sıfır
 * bant üretmek her koşuyu "yatışmış" gösterirdi.
 */
function settlingBand(samples: readonly StartupSample[], gate: StartupGate): number {
  const window = samples.filter(
    (s) =>
      s.seconds >= gate.transientWindowStartSeconds && s.seconds <= gate.transientWindowEndSeconds,
  );
  if (window.length === 0) {
    throw new RangeError(
      `Yatışma penceresi (${gate.transientWindowStartSeconds}–${gate.transientWindowEndSeconds} sn) örnek içermiyor.`,
    );
  }
  return medianOf(window.map((s) => s.meanSpeed)) * gate.transientBandMultiple;
}

function sampleAt(series: StartupSeries, seconds: number): StartupSample {
  const found = series.samples.find((s) => Math.abs(s.seconds - seconds) < SECOND_TOLERANCE);
  if (!found) throw new RangeError(`Seri ${seconds}. saniyede örnek taşımıyor.`);
  return found;
}

function retentionAt(series: StartupSeries, seconds: number): number {
  return sampleAt(series, seconds).activeCount / series.initialCount;
}

/**
 * Korpus kapısı. Satırlar §8.4'ün üç kuralıdır; "hiçbir örneğinde" kuralı seed
 * başına değerlendirilir, seed'ler arası toplama ise §8.4'ün "Aday toplama"
 * satırıyla yapılır — yeni bir toplama kuralı uydurulmaz.
 */
export function evaluateStartupSurvival(
  metrics: readonly StartupMetrics[],
  gate: StartupGate = defaultStartupGate,
): StartupVerdict {
  if (metrics.length === 0) throw new RangeError('Kapı en az bir seed ölçümü ister.');
  const retention10 = [...metrics.map((m) => m.matterRetention10)].sort((a, b) => a - b);
  const retention10Median = medianOf(retention10);
  const retention10WorstDecile = percentile(retention10, 0.1);
  const retention30Median = medianOf(metrics.map((m) => m.matterRetention30));

  const burstFailures = metrics.filter(
    (m) => m.earlyBurstPeak > gate.earlyBurstMaxCappedFraction,
  ).length;
  const earlyBurstFailureFraction = burstFailures / metrics.length;
  const settledSeedFraction =
    metrics.filter((m) => m.timeToStructuralRegime <= gate.settlingSeconds).length / metrics.length;

  const initialSurvival =
    retention10Median >= gate.retention10MedianMin &&
    retention10WorstDecile >= gate.retention10WorstDecileMin &&
    retention30Median >= gate.retention30MedianMin;
  const earlyBurst = earlyBurstFailureFraction < gate.seedFailureFractionForReject;
  const transientSettling = settledSeedFraction >= gate.settlingSeedFractionMin;

  const reasons: string[] = [];
  if (!initialSurvival) {
    reasons.push(
      `başlangıç sağkalımı: 10 sn medyan ${retention10Median.toFixed(3)} (≥ ${
        gate.retention10MedianMin
      }), en kötü ondalık ${retention10WorstDecile.toFixed(3)} (≥ ${
        gate.retention10WorstDecileMin
      }), 30 sn medyan ${retention30Median.toFixed(3)} (≥ ${gate.retention30MedianMin})`,
    );
  }
  if (!earlyBurst) {
    reasons.push(
      `erken patlama: seed'lerin ${(earlyBurstFailureFraction * 100).toFixed(
        0,
      )}%'inde tavandaki pay > ${gate.earlyBurstMaxCappedFraction}`,
    );
  }
  if (!transientSettling) {
    reasons.push(
      `transient yatışması: seed'lerin ${(settledSeedFraction * 100).toFixed(0)}%'i ${
        gate.settlingSeconds
      } sn içinde yatıştı (≥ ${(gate.settlingSeedFractionMin * 100).toFixed(0)}%)`,
    );
  }

  return {
    initialSurvival,
    earlyBurst,
    transientSettling,
    retention10Median,
    retention10WorstDecile,
    retention30Median,
    earlyBurstFailureFraction,
    settledSeedFraction,
    startupMassacre: !initialSurvival,
    passed: initialSurvival && earlyBurst && transientSettling,
    reasons,
  };
}

/**
 * Örnekleyicinin bağımlılığı YAPISALDIR: `LifeWorld` tipine bağlanmaz, çünkü
 * bu katman araştırma tarafıdır ve fixture dünyaları da aynı kapıdan geçer.
 */
export interface StartupSamplerSource {
  readonly particles: ParticleStore;
  readonly reservoir: { readonly voidLossTotal: number };
  step(): void;
}

export interface StartupSamplerOptions {
  readonly seed: number;
  readonly maxSpeed: number;
  readonly seconds: number;
  readonly simulationHz: number;
  readonly sampleIntervalTicks: number;
  /** Olay döngüsünün bırakılma sıklığı; `yieldEveryTicks` aşağıda anlatılıyor. */
  readonly yieldEveryTicks?: number;
}

/**
 * Dakikalar süren tek parça senkron blok, vitest raportörünün `onTaskUpdate`
 * RPC'sini aç bırakır ve koşum "Timeout calling onTaskUpdate" ile 1 döner
 * (testler geçse bile). `habitatTopology.long.ts` aynı kök nedeni belgeliyor.
 * Bırakma yalnız zamanlamayı değiştirir: korpus, iddia ve eşikler aynıdır.
 */
const DEFAULT_YIELD_EVERY_TICKS = 300;

/**
 * Seriyi üretmenin TEK yolu. Ölçüm betiği de uzun test de buradan geçer;
 * "tavandaki parçacık payı" sayımının ikinci bir tanımı olmaz.
 */
export async function sampleStartupSeries(
  world: StartupSamplerSource,
  options: StartupSamplerOptions,
): Promise<StartupSeries> {
  const initialCount = world.particles.activeCount;
  const totalTicks = options.seconds * options.simulationHz;
  const yieldEvery = options.yieldEveryTicks ?? DEFAULT_YIELD_EVERY_TICKS;
  const samples: StartupSample[] = [];
  for (let tick = 0; tick <= totalTicks; tick++) {
    if (tick % options.sampleIntervalTicks === 0) {
      samples.push(captureSample(world, tick / options.simulationHz, options.maxSpeed));
    }
    world.step();
    if (tick % yieldEvery === 0) await new Promise((resolve) => setImmediate(resolve));
  }
  return { seed: options.seed, initialCount, samples };
}

function captureSample(
  world: StartupSamplerSource,
  seconds: number,
  maxSpeed: number,
): StartupSample {
  const particles = world.particles;
  let capped = 0;
  let speedSum = 0;
  let alive = 0;
  for (let slot = 0; slot < particles.capacity; slot++) {
    if (particles.active[slot] === 0) continue;
    alive++;
    const speed = Math.hypot(particles.vx[slot], particles.vy[slot]);
    speedSum += speed;
    if (isAtSpeedCap(speed, maxSpeed)) capped++;
  }
  return {
    seconds,
    activeCount: alive,
    meanSpeed: alive > 0 ? speedSum / alive : 0,
    cappedFraction: alive > 0 ? capped / alive : 0,
    voidLossTotal: world.reservoir.voidLossTotal,
  };
}
