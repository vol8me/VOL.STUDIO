import { parentPort, workerData } from 'node:worker_threads';

/* F1 seeding araştırması worker'ı; TS yükleyicisi execArgv ile verilir. */
const { runSeedingUnit } = await import('./seedingStudy.ts');

parentPort.postMessage(
  workerData.units.map((unit) => ({ workId: unit.workId, output: runSeedingUnit(unit.input) })),
);
