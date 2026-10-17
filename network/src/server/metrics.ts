import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import type { RollingWindow } from '@volstudio/core/collections';

export interface TickSummary {
  readonly samples: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

export function summarize(window: RollingWindow): TickSummary {
  return {
    samples: window.count,
    meanMs: window.average,
    p50Ms: window.percentile(0.5),
    p99Ms: window.percentile(0.99),
    maxMs: window.max,
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
