// Paralel toplu işlerin worker önyüklemesi: TypeScript görevlerini tsx ile yükler.
// Yükleme başarısız olursa ana iş parçacığı bunu el sıkışmasında görür; bloklu
// bekleyen ana iş parçacığı worker'ın asenkron `error` olayını göremez.
import { workerData } from 'node:worker_threads';

const { port, signal } = workerData;
try {
  const { register } = await import('tsx/esm/api');
  register();
  const { serveTasks } = await import('./parallelTasks.ts');
  serveTasks({ port, signal });
} catch (error) {
  port.postMessage({ ready: false, error: { name: error.name, message: error.message } });
  Atomics.add(signal, 0, 1);
  Atomics.notify(signal, 0);
}
