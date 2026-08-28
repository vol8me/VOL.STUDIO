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

  describe('p95 — nearest-rank yönteminin düşük N davranışı', () => {
    /**
     * k'ıncı örneğin süresi tam olarak k ms olacak şekilde artan bir saat.
     * Her örnek iki `now()` çağrısı yapar (başlangıç okuması, bitiş okuması);
     * yalnızca bitiş çağrısında saat k kadar ilerler, böylece elapsedMs = k.
     */
    function increasingPerSampleClock(): () => number {
      let time = 0;
      let sampleIndex = 0;
      let awaitingEnd = false;
      return () => {
        if (!awaitingEnd) {
          awaitingEnd = true;
          return time;
        }
        awaitingEnd = false;
        sampleIndex += 1;
        time += sampleIndex;
        return time;
      };
    }

    it('N < 20 iken p95 tam olarak en yavaş örneğe eşittir (nearest-rank formülünün doğal sonucu)', () => {
      // 19 örnek, k'ıncısı k ms sürer: en yavaş = maksimum = 19. örnek (19 ms).
      const result = runBenchmark(workload(), {
        iterations: 1,
        warmupIterations: 0,
        samples: 19,
        now: increasingPerSampleClock(),
      });

      const maxMs = Math.max(...result.samples.map((sample) => sample.msPerIteration));
      expect(maxMs).toBe(19);
      expect(result.p95MsPerIteration).toBe(maxMs);
    });

    it('N ≥ 20 iken p95 artık maksimumdan ayrışabilir', () => {
      // 20 örnek: nearest-rank ceil(20*0.95)-1 = 18 (0-tabanlı) — sıralı 20
      // örneğin SONUNCUSU değil, sondan bir öncekisi (19 ms, maksimum 20 ms).
      const result = runBenchmark(workload(), {
        iterations: 1,
        warmupIterations: 0,
        samples: 20,
        now: increasingPerSampleClock(),
      });

      const sorted = result.samples.map((sample) => sample.msPerIteration).sort((a, b) => a - b);
      const maxMs = sorted.at(-1)!;
      const secondHighestMs = sorted.at(-2)!;
      expect(maxMs).toBe(20);
      expect(secondHighestMs).toBe(19);
      expect(result.p95MsPerIteration).toBe(secondHighestMs);
      expect(result.p95MsPerIteration).toBeLessThan(maxMs);
    });
  });
});
