import { summarizeFrameIntervals, type FrameIntervalSummary } from './frameSummary';

export interface MetricSummary {
  min: number;
  max: number;
  avg: number;
  samples: number;
}

export interface FrameWindowSummary extends FrameIntervalSummary {
  context: string;
  start: number;
  end: number;
  metrics: Record<string, MetricSummary>;
}

export class FrameWindow {
  private context = '';
  private start = 0;
  private previous: number | null = null;
  private readonly intervals: number[] = [];
  private readonly metrics = new Map<
    string,
    { min: number; max: number; sum: number; samples: number }
  >();

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
    for (const [name, value] of Object.entries(values)) {
      if (!Number.isFinite(value)) continue;
      const metric = this.metrics.get(name) ?? { min: value, max: value, sum: 0, samples: 0 };
      metric.min = Math.min(metric.min, value);
      metric.max = Math.max(metric.max, value);
      metric.sum += value;
      metric.samples++;
      this.metrics.set(name, metric);
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
          metrics: Object.fromEntries(
            [...this.metrics].map(([name, value]) => [
              name,
              {
                min: value.min,
                max: value.max,
                avg: value.sum / value.samples,
                samples: value.samples,
              },
            ]),
          ),
        }
      : null;
    this.previous = null;
    this.intervals.length = 0;
    this.metrics.clear();
    return result;
  }
}
