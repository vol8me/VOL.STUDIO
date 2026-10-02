import type { MetricSummary } from './FrameWindow';

export function summarizeMetricSamples(values: readonly number[]): MetricSummary | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const percentile = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sorted.reduce(
      (mean, value, index) => mean * (index / (index + 1)) + value / (index + 1),
      0,
    ),
    samples: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
  };
}
