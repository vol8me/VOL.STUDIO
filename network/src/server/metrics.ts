import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';

/** Sabit uzunluklu halka: son N ölçüm. Ayırma yapmaz. */
export class Ring {
  private readonly values: Float64Array;
  private next = 0;
  private filled = 0;

  constructor(size: number) {
    this.values = new Float64Array(size);
  }

  push(value: number): void {
    this.values[this.next] = value;
    this.next = (this.next + 1) % this.values.length;
    this.filled = Math.min(this.filled + 1, this.values.length);
  }

  get count(): number {
    return this.filled;
  }

  /** Yüzdelik değer (0-1); boşsa 0. */
  percentile(fraction: number): number {
    if (this.filled === 0) return 0;
    const sorted = this.values.slice(0, this.filled).sort();
    return sorted[Math.min(this.filled - 1, Math.floor(this.filled * fraction))];
  }

  get mean(): number {
    if (this.filled === 0) return 0;
    let sum = 0;
    for (let index = 0; index < this.filled; index++) sum += this.values[index];
    return sum / this.filled;
  }

  get max(): number {
    let max = 0;
    for (let index = 0; index < this.filled; index++) max = Math.max(max, this.values[index]);
    return max;
  }
}

export interface TickSummary {
  readonly samples: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

export function summarize(ring: Ring): TickSummary {
  return {
    samples: ring.count,
    meanMs: ring.mean,
    p50Ms: ring.percentile(0.5),
    p99Ms: ring.percentile(0.99),
    maxMs: ring.max,
  };
}

const LOOP_RESOLUTION_MS = 10;
let loopDelay: IntervalHistogram | null = null;

/** Süreç genelinde tek olay döngüsü gecikme ölçeri; ilk çağrıda açılır. */
export function eventLoopDelay(): IntervalHistogram {
  if (loopDelay === null) {
    loopDelay = monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS });
    loopDelay.enable();
  }
  return loopDelay;
}

export interface LoopSummary {
  readonly meanMs: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

/**
 * Histogram nanosaniye verir ve ölçüm aralığının kendisini (`resolution`) içerir: boşta süreçte bile
 * değerler ~10 ms'dir. Burada o taban çıkarılır; sonuç olay döngüsünün ek gecikmesidir.
 * Windows'ta zamanlayıcı ayrıca ~15,6 ms ayrıklıdır; bu taban Linux'ta yoktur.
 */
export function drainEventLoopDelay(): LoopSummary {
  const histogram = eventLoopDelay();
  const summary = {
    meanMs: Number.isFinite(histogram.mean)
      ? Math.max(0, histogram.mean / 1e6 - LOOP_RESOLUTION_MS)
      : 0,
    p99Ms: Math.max(0, histogram.percentile(99) / 1e6 - LOOP_RESOLUTION_MS),
    maxMs: Math.max(0, histogram.max / 1e6 - LOOP_RESOLUTION_MS),
  };
  histogram.reset();
  return summary;
}

export interface ProcessSnapshot {
  readonly loop: LoopSummary;
  readonly memory: NodeJS.MemoryUsage;
  readonly cpu: NodeJS.CpuUsage;
  readonly uptimeSeconds: number;
  readonly pid: number;
  readonly node: string;
  readonly platform: NodeJS.Platform;
}

/** Süreç genelinde sağlık özeti. Olay döngüsü histogramı okunurken sıfırlanır. */
export function processSnapshot(): ProcessSnapshot {
  return {
    loop: drainEventLoopDelay(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    uptimeSeconds: process.uptime(),
    pid: process.pid,
    node: process.version,
    platform: process.platform,
  };
}
