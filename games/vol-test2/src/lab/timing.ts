import { RingStats } from '@/app/ringStats';

/**
 * Bir işin kare başına süresini ölçer ve yüzdeliklerini verir. Yükler kendi içlerinde "sim" ve "sunum"
 * gibi parçaları ayrı ölçer: toplam kare süresi hangisinin yavaşladığını söylemez.
 */
export class SpanTimer {
  private readonly ring: RingStats;

  constructor(
    capacity: number,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.ring = new RingStats(capacity);
  }

  private startedAt = 0;

  /** Ölçümü başlatır; kare başına tahsis yapmamak için kapanış yerine `begin`/`end` çifti vardır. */
  begin(): void {
    this.startedAt = this.now();
  }

  end(): void {
    this.ring.push(this.now() - this.startedAt);
  }

  p50(): number {
    return this.ring.percentile(0.5);
  }

  p95(): number {
    return this.ring.percentile(0.95);
  }

  get samples(): number {
    return this.ring.count;
  }
}

/** Sayacı üç ondalığa yuvarlar: günlük ve rapor okunur kalır. */
export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
