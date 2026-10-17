/**
 * Sabit kovalı sayaç: bellek ölçüm sayısıyla büyümez, bu yüzden 24 saatlik koşuda da kullanılır.
 * Değerler `width` genişliğindeki kovalara yazılır; yüzdelik kovanın üst sınırıdır (en çok bir kova
 * yukarı yuvarlar). Son kovadan büyükler son kovaya düşer ama `max` gerçek değeri tutar.
 */
export class Histogram {
  private readonly counts: Uint32Array;
  private total = 0;
  private sum = 0;
  private peak = 0;

  constructor(
    private readonly width: number,
    buckets: number,
  ) {
    if (!(width > 0) || !Number.isSafeInteger(buckets) || buckets < 2)
      throw new RangeError('Kova genişliği pozitif, kova sayısı en az 2 olmalı.');
    this.counts = new Uint32Array(buckets);
  }

  record(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    const bucket = Math.min(this.counts.length - 1, Math.floor(value / this.width));
    this.counts[bucket]++;
    this.total++;
    this.sum += value;
    if (value > this.peak) this.peak = value;
  }

  get count(): number {
    return this.total;
  }

  get max(): number {
    return this.peak;
  }

  get mean(): number {
    return this.total === 0 ? 0 : this.sum / this.total;
  }

  /** Yüzdelik değer (0-1); boşsa 0. Son kovaya düşen değerler için gerçek `max` döner. */
  percentile(fraction: number): number {
    if (this.total === 0) return 0;
    const rank = Math.max(1, Math.ceil(this.total * Math.min(1, Math.max(0, fraction))));
    let seen = 0;
    for (let bucket = 0; bucket < this.counts.length; bucket++) {
      seen += this.counts[bucket];
      if (seen >= rank) {
        return bucket === this.counts.length - 1
          ? this.peak
          : Math.min(this.peak, (bucket + 1) * this.width);
      }
    }
    return this.peak;
  }

  reset(): void {
    this.counts.fill(0);
    this.total = 0;
    this.sum = 0;
    this.peak = 0;
  }
}

export interface DistributionSummary {
  readonly count: number;
  readonly mean: number;
  readonly p50: number;
  readonly p99: number;
  readonly max: number;
}

export function summarizeHistogram(histogram: Histogram): DistributionSummary {
  return {
    count: histogram.count,
    mean: histogram.mean,
    p50: histogram.percentile(0.5),
    p99: histogram.percentile(0.99),
    max: histogram.max,
  };
}
