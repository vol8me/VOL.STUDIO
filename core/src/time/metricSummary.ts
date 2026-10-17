import type { MetricSummary } from './FrameWindow';
import { RollingWindow } from '../collections/RollingWindow';

export function summarizeMetricSamples(values: readonly number[]): MetricSummary | null {
  const window = new RollingWindow(Math.max(1, values.length));
  for (const value of values) window.push(value);
  if (window.count === 0) return null;
  return {
    min: window.min,
    max: window.max,
    avg: window.average,
    samples: window.count,
    p50: window.percentile(0.5),
    p95: window.percentile(0.95),
    p99: window.percentile(0.99),
  };
}
