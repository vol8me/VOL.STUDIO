import type { MorphologySample } from './metrics';
import { medianOf } from './stats';

/**
 * Geç çöküş dedektörü (F8). §8.4'ün kuralı BİREBİR uygulanır:
 *
 * "Yapılı madde payı 10–20 dk medyanından > %50 düşüp ≥ 3 dk öyle kalırsa
 * çöküş. Son 5 dk'nın eğimi anlamlı düşüşse ya da çöküş 25. dakikadan sonra
 * seed'lerin ≥ %10'unda başlarsa 60 dk canary koşulur."
 *
 * Final snapshot'a bakmak geç çöküşü GÖRMEZ: 30. dakikada ölmüş bir dünya ile
 * 12. dakikada ölmüş bir dünya aynı son kareyi verebilir.
 */
export interface CollapseConfig {
  /** Referans pencere: 10–20 dakika. */
  readonly referenceStartMinutes: number;
  readonly referenceEndMinutes: number;
  /** Bu orandan fazla düşüş çöküştür. */
  readonly dropFraction: number;
  /** Düşüşün en az bu kadar sürmesi gerekir. */
  readonly sustainedMinutes: number;
  /** Bu dakikadan sonra başlayan çöküş canary tetikler. */
  readonly lateCollapseMinutes: number;
  /** Canary için gereken seed payı. */
  readonly canarySeedFraction: number;
  /** Eğim penceresi: son 5 dakika. */
  readonly slopeWindowMinutes: number;
  readonly fixedStepMs: number;
  readonly sampleIntervalTicks: number;
}

export const defaultCollapseConfig: CollapseConfig = {
  referenceStartMinutes: 10,
  referenceEndMinutes: 20,
  dropFraction: 0.5,
  sustainedMinutes: 3,
  lateCollapseMinutes: 25,
  canarySeedFraction: 0.1,
  slopeWindowMinutes: 5,
  fixedStepMs: 1000 / 60,
  sampleIntervalTicks: 60,
};

export interface SeedCollapse {
  readonly seed: number;
  readonly collapsed: boolean;
  /** Çöküşün başladığı dakika; çökmediyse `null`. */
  readonly collapseStartMinutes: number | null;
  readonly referenceMedian: number;
  /** Son penceredeki eğim (pay/dakika); negatifse düşüş. */
  readonly tailSlopePerMinute: number;
}

export interface CollapseReport {
  readonly seeds: readonly SeedCollapse[];
  readonly collapsedSeedFraction: number;
  readonly lateCollapseSeedFraction: number;
  /** 60 dakikalık canary gerekiyor mu ve neden. */
  readonly canaryRequired: boolean;
  readonly canaryReasons: readonly string[];
}

/**
 * Dedektör örnekten YALNIZ tick ve yapılı madde payını okur. İmza bu iki alana
 * daraltıldı ki uzun ufuk koşusunun (F7) indirgenmiş eğrisi de aynı dedektöre
 * girebilsin; ikinci bir çöküş ölçütü yazmak iki farklı "çöküş" tanımı üretirdi.
 */
export type CollapseSeriesPoint = Pick<MorphologySample, 'tick' | 'clusteredFraction'>;

export function detectSeedCollapse(
  seed: number,
  series: readonly CollapseSeriesPoint[],
  config: CollapseConfig = defaultCollapseConfig,
): SeedCollapse {
  if (series.length === 0) {
    throw new RangeError('Çöküş ölçümü boş seriyle yapılamaz.');
  }
  const minutesOf = (sample: CollapseSeriesPoint): number =>
    (sample.tick * config.fixedStepMs) / 60000;
  const reference = series.filter((sample) => {
    const minutes = minutesOf(sample);
    return minutes >= config.referenceStartMinutes && minutes <= config.referenceEndMinutes;
  });
  if (reference.length === 0) {
    throw new RangeError(
      `Referans penceresi (${config.referenceStartMinutes}–${config.referenceEndMinutes} dk) örnek içermiyor.`,
    );
  }
  const referenceMedian = medianOf(reference.map((sample) => sample.clusteredFraction));
  const threshold = referenceMedian * (1 - config.dropFraction);

  let collapseStart: number | null = null;
  let runStart: number | null = null;
  for (const sample of series) {
    const minutes = minutesOf(sample);
    if (minutes < config.referenceStartMinutes) continue;
    if (sample.clusteredFraction < threshold) {
      runStart ??= minutes;
      // Düşüş yeterince SÜRDÜ mü; anlık bir çukur çöküş değildir.
      if (collapseStart === null && minutes - runStart >= config.sustainedMinutes) {
        collapseStart = runStart;
      }
    } else {
      runStart = null;
    }
  }

  const tailStart = minutesOf(series[series.length - 1]) - config.slopeWindowMinutes;
  const tail = series.filter((sample) => minutesOf(sample) >= tailStart);
  return {
    seed,
    collapsed: collapseStart !== null,
    collapseStartMinutes: collapseStart,
    referenceMedian,
    tailSlopePerMinute: slope(tail.map((sample) => [minutesOf(sample), sample.clusteredFraction])),
  };
}

export function buildCollapseReport(
  seeds: readonly SeedCollapse[],
  config: CollapseConfig = defaultCollapseConfig,
  /** Eğimin "anlamlı düşüş" sayıldığı sınır; referans medyanın oranı olarak. */
  significantSlopeFraction = 0.05,
): CollapseReport {
  if (seeds.length === 0) throw new RangeError('Çöküş raporu en az bir seed ister.');
  const collapsed = seeds.filter((entry) => entry.collapsed);
  const late = collapsed.filter(
    (entry) => (entry.collapseStartMinutes ?? 0) >= config.lateCollapseMinutes,
  );
  const steepTail = seeds.filter(
    (entry) =>
      entry.tailSlopePerMinute < -significantSlopeFraction * Math.max(1e-9, entry.referenceMedian),
  );

  const reasons: string[] = [];
  if (late.length / seeds.length >= config.canarySeedFraction) {
    reasons.push(
      `geç çöküş seed'lerin %${((late.length / seeds.length) * 100).toFixed(0)}'inde (${
        config.lateCollapseMinutes
      }. dakikadan sonra)`,
    );
  }
  if (steepTail.length > 0) {
    reasons.push(
      `son ${config.slopeWindowMinutes} dakikanın eğimi ${steepTail.length} seed'de anlamlı düşüşte`,
    );
  }

  return {
    seeds,
    collapsedSeedFraction: collapsed.length / seeds.length,
    lateCollapseSeedFraction: late.length / seeds.length,
    canaryRequired: reasons.length > 0,
    canaryReasons: reasons,
  };
}

/** En küçük kareler eğimi; iki noktadan azsa eğim tanımsızdır ve sıfırdır. */
function slope(points: readonly (readonly [number, number])[]): number {
  if (points.length < 2) return 0;
  const meanX = points.reduce((sum, [x]) => sum + x, 0) / points.length;
  const meanY = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
  let numerator = 0;
  let denominator = 0;
  for (const [x, y] of points) {
    numerator += (x - meanX) * (y - meanY);
    denominator += (x - meanX) ** 2;
  }
  return denominator > 0 ? numerator / denominator : 0;
}
