import { parentPort, workerData } from 'node:worker_threads';

/* Uzun ufuk iş birimi worker'ı (E17); yükleyici execArgv ile verilir. */
const { runLongHorizon } = await import('./longRun.ts');

parentPort.postMessage(
  workerData.units.map((unit) => ({ workId: unit.workId, output: runLongHorizon(unit.input) })),
);
