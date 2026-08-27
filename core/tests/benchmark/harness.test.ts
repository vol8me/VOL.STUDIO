import { describe, expect, it } from 'vitest';
import { runBenchmark, runBenchmarkSuite, type BenchmarkWorkload } from '../../src/benchmark';

function workload(name = 'test/workload'): BenchmarkWorkload {
  return {
    name,
    create: () => {
      let value = 0;
      return {
        step: () => {
          value += 1;
        },
        dispose: () => {
          expect(value).toBeGreaterThan(0);
        },
      };
    },
  };
}

describe('benchmark harness', () => {
  it('warmup, örnek ve ömrü ayrı ayrı yönetir', () => {
    const result = runBenchmark(workload(), {
      iterations: 4,
      warmupIterations: 2,
      samples: 3,
      now: (() => {
        let time = 0;
        return () => (time += 10);
      })(),
    });

    expect(result.name).toBe('test/workload');
    expect(result.iterations).toBe(4);
    expect(result.warmupIterations).toBe(2);
    expect(result.samples).toHaveLength(3);
    expect(result.samples.every((sample) => sample.elapsedMs === 10)).toBe(true);
    expect(result.medianMsPerIteration).toBe(2.5);
    expect(result.p95MsPerIteration).toBe(2.5);
    expect(result.operationsPerSecond).toBe(400);
  });

  it('suite her workload için bağımsız sonuç üretir', () => {
    const result = runBenchmarkSuite([workload('one'), workload('two')], {
      iterations: 2,
      warmupIterations: 0,
      samples: 1,
      now: () => 1,
    });

    expect(result.workloads.map((item) => item.name)).toEqual(['one', 'two']);
    expect(result.workloads.every((item) => item.samples[0]?.elapsedMs === 0)).toBe(true);
  });

  it('ölçüm seçeneklerini erken ve anlaşılır biçimde reddeder', () => {
    expect(() => runBenchmark(workload(), { iterations: 0 })).toThrow(/iterations/);
    expect(() => runBenchmark(workload(), { warmupIterations: -1 })).toThrow(/warmupIterations/);
    expect(() => runBenchmark(workload(), { samples: Number.NaN })).toThrow(/samples/);
  });
});
