export interface FrameIntervalSummary {
  frames: number;
  fps: number;
  meanMs: number;
  p50: number;
  p95: number;
  p99: number;
  over20ms: number;
  over34ms: number;
}

export function summarizeFrameIntervals(values: readonly number[]): FrameIntervalSummary | null {
  const deltas = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!deltas.length) return null;
  const sorted = [...deltas].sort((a, b) => a - b);
  const round = (value: number) => Math.round(value * 100) / 100;
  const pick = (quantile: number) =>
    round(sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))]);
  const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  return {
    frames: deltas.length,
    fps: Math.round(10_000 / mean) / 10,
    meanMs: round(mean),
    p50: pick(0.5),
    p95: pick(0.95),
    p99: pick(0.99),
    over20ms: deltas.filter((value) => value > 20).length,
    over34ms: deltas.filter((value) => value > 34).length,
  };
}
