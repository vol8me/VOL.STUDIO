import { parentPort, workerData } from 'node:worker_threads';

/*
 * Worker girişi (E12). TypeScript yükleyicisi `execArgv: ['--import', 'tsx']`
 * ile verilir: `register('tsx/esm')` Node 20+'ta reddediliyor ve ana iş
 * parçacığının yükleyicisi worker'a miras kalmıyor.
 */
const { runSeedUnit } = await import('./seedRunner.ts');

parentPort.postMessage(
  workerData.units.map((unit) => ({ workId: unit.workId, output: runSeedUnit(unit.input) })),
);
