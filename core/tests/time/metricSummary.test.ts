import { describe, expect, it } from 'vitest';
import { summarizeMetricSamples } from '../../src/time/metricSummary';

describe('summarizeMetricSamples', () => {
  it('sıfır örneğini korur, bozuk sayıları atar ve caller tamponunu sıralamaz', () => {
    const values = [8, 0, 2, NaN, Infinity];
    expect(summarizeMetricSamples(values)).toMatchObject({
      min: 0,
      max: 8,
      samples: 3,
      p50: 2,
      p95: 8,
      p99: 8,
    });
    expect(summarizeMetricSamples(values)?.avg).toBeCloseTo(10 / 3);
    expect(values[0]).toBe(8);
  });
  it('geçerli örnek yoksa sıfır ölçüm uydurmaz', () => {
    expect(summarizeMetricSamples([])).toBeNull();
    expect(summarizeMetricSamples([NaN])).toBeNull();
  });
});
