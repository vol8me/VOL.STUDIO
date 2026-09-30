import { createCoreSimulationWorkloads, runBenchmarkSuite } from './benchmark/index';

/**
 * `scaling` kapısının CORE ölçümü: varlık sayısına bağlı iş yükleri iki girdi
 * boyunda koşar, rapor `quality.json` → `scaling.core.$measure` tarifine uyar.
 */
const ENTITY_WORKLOADS = new Set(['core/spatial-rebuild', 'core/spatial-incremental']);
const INPUTS = [128, 512];

const spatial = INPUTS.map((entities) => {
  const workloads = createCoreSimulationWorkloads({ entityCount: entities }).filter((workload) =>
    ENTITY_WORKLOADS.has(workload.name),
  );
  const result = runBenchmarkSuite(workloads, { iterations: 200, warmupIterations: 50 });
  const ms = result.workloads.reduce((sum, workload) => sum + workload.medianMsPerIteration, 0);
  return { entities, ms };
});

console.log(JSON.stringify({ spatial }));
