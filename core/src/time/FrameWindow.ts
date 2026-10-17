import { summarizeFrameIntervals, type FrameIntervalSummary } from './frameSummary';
import { summarizeMetricSamples } from './metricSummary';

export interface MetricSummary {
  min: number;
  max: number;
  avg: number;
  samples: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface FrameWindowSummary extends FrameIntervalSummary {
  context: string;
  start: number;
  end: number;
  metrics: Record<string, MetricSummary>;
  slowestFrame: { at: number; intervalMs: number; metrics: Record<string, number> };
}

export class FrameWindow {
  private context = '';
  private start = 0;
  private previous: number | null = null;
  private readonly intervals: number[] = [];
  private readonly metrics = new Map<string, number[]>();
  private slowestFrame: FrameWindowSummary['slowestFrame'] | null = null;

  constructor(private readonly durationMs = 10_000) {}

  push(
    now: number,
    context: string,
    values: Readonly<Record<string, number>>,
  ): FrameWindowSummary | null {
    if (!Number.isFinite(now)) return null;
    let completed: FrameWindowSummary | null = null;
    if (this.previous !== null && this.context !== context) completed = this.flush();
    if (this.previous === null) {
      this.start = now;
      this.previous = now;
      this.context = context;
      return completed;
    }
    const delta = now - this.previous;
    if (delta <= 0) return completed;
    this.previous = now;
    this.intervals.push(delta);
    const finiteValues: Record<string, number> = {};
    for (const [name, value] of Object.entries(values)) {
      if (!Number.isFinite(value)) continue;
      finiteValues[name] = value;
      const metric = this.metrics.get(name) ?? [];
      metric.push(value);
      this.metrics.set(name, metric);
    }
    if (!this.slowestFrame || delta > this.slowestFrame.intervalMs) {
      this.slowestFrame = { at: now, intervalMs: delta, metrics: finiteValues };
    }
    if (now - this.start >= this.durationMs) {
      completed = this.flush();
      this.start = now;
      this.previous = now;
      this.context = context;
    }
    return completed;
  }

  flush(): FrameWindowSummary | null {
    const timing = summarizeFrameIntervals(this.intervals);
    const result = timing
      ? {
          ...timing,
          context: this.context,
          start: this.start,
          end: this.previous!,
          slowestFrame: this.slowestFrame!,
          metrics: Object.fromEntries(
            [...this.metrics].map(([name, values]) => [name, summarizeMetricSamples(values)!]),
          ),
        }
      : null;
    this.previous = null;
    this.intervals.length = 0;
    this.metrics.clear();
    this.slowestFrame = null;
    return result;
  }
}
