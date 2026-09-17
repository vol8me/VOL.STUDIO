import { parentPort, workerData } from 'node:worker_threads';

/*
 * Çoklu-seed uzun ufuk worker'ı (F7). Ölçüm broad/refinement ile AYNI
 * `runSeedUnit`ten geçer; worker yalnız çıktıyı eğriye indirger, böylece tam
 * örnek dizisi (küme kayıtlarıyla birlikte) iş parçacığı sınırını hiç geçmez.
 */
const { runLongHorizonUnit } = await import('./longHorizon.ts');

parentPort.postMessage(
  workerData.units.map((unit) => ({
    workId: unit.workId,
    output: runLongHorizonUnit(unit.input),
  })),
);
