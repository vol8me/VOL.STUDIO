import { describe, expect, it } from 'vitest';
import { createCoreSimulationWorkloads } from '../../src/benchmark/workloads';
import { runBenchmarkSuite } from '../../src/benchmark/harness';

describe('CORE simulation workload seti', () => {
  it('standart mekanizma workloadlarını deterministik adlarla sağlar', () => {
    expect(
      createCoreSimulationWorkloads({ entityCount: 8, gridSize: 8 }).map((item) => item.name),
    ).toEqual([
      'core/spatial-rebuild',
      'core/spatial-incremental',
      'core/pathfinder-reuse',
      'core/scheduler-drain',
      'core/object-pool-cycle',
    ]);
  });

  it('bütün workloadlar gerçek adımları finite metriklerle tamamlar', () => {
    const result = runBenchmarkSuite(
      createCoreSimulationWorkloads({ entityCount: 16, gridSize: 12 }),
      { iterations: 3, warmupIterations: 1, samples: 1 },
    );

    expect(result.workloads).toHaveLength(5);
    for (const workload of result.workloads) {
      expect(Number.isFinite(workload.medianMsPerIteration)).toBe(true);
      expect(Number.isFinite(workload.p95MsPerIteration)).toBe(true);
      expect(workload.samples).toHaveLength(1);
    }
  });

  it('workload boyutları geçerli tam sayı olmalıdır', () => {
    expect(() => createCoreSimulationWorkloads({ entityCount: 0 })).toThrow(/entityCount/);
    expect(() => createCoreSimulationWorkloads({ gridSize: 1.5 })).toThrow(/gridSize/);
  });
});
