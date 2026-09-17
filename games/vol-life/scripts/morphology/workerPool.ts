import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { shardForWork } from './shards';
import { runSeedUnit, type SeedUnitInput, type SeedUnitOutput } from './seedRunner';

/**
 * Gerçek paralel shard koşusu (E12).
 *
 * Bölme DETERMİNİSTİKTİR: iş birimi, kimliğinin hash'iyle bir worker'a düşer,
 * sırayla dağıtılmaz. Birleştirme iş kimliğine göre sıralıdır; worker'ların
 * bitiş sırası sonucu etkileyemez. Hem seri hem paralel yol AYNI `runSeedUnit`
 * fonksiyonunu çağırır, bu yüzden eşitlik kurulumdan gelir.
 */
export interface PoolUnit {
  readonly workId: string;
  readonly input: SeedUnitInput;
}

export interface PoolResult {
  readonly workId: string;
  readonly output: SeedUnitOutput;
}

/**
 * Yol TEMBEL çözülür: vitest gibi ortamlarda `import.meta.url` dosya şeması
 * taşımaz ve modül yüklenirken `fileURLToPath` patlar. O durumda paket kökünden
 * çözülür.
 */
function workerPath(): string {
  const url = new URL('./seedWorker.mjs', import.meta.url);
  if (url.protocol === 'file:') return fileURLToPath(url);
  return resolve(process.cwd(), 'scripts/morphology/seedWorker.mjs');
}

export async function runSeedUnits(
  units: readonly PoolUnit[],
  workerCount: number,
): Promise<PoolResult[]> {
  if (!Number.isInteger(workerCount) || workerCount < 1) {
    throw new RangeError(`Worker sayısı pozitif tam sayı olmalı: ${workerCount}`);
  }
  if (units.length === 0) return [];
  if (workerCount === 1) {
    return sortByWorkId(
      units.map((unit) => ({ workId: unit.workId, output: runSeedUnit(unit.input) })),
    );
  }

  const buckets: PoolUnit[][] = Array.from({ length: workerCount }, () => []);
  for (const unit of units) buckets[shardForWork(unit.workId, workerCount)].push(unit);

  const settled = await Promise.all(
    buckets.map((bucket) => (bucket.length === 0 ? Promise.resolve([]) : runBucket(bucket))),
  );
  return sortByWorkId(settled.flat());
}

function runBucket(units: readonly PoolUnit[]): Promise<PoolResult[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath(), {
      workerData: { units },
      // TS yükleyicisi worker'a miras kalmaz; açıkça verilir.
      execArgv: ['--import', 'tsx'],
    });
    worker.once('message', (message: PoolResult[]) => {
      void worker.terminate();
      resolve(message);
    });
    worker.once('error', (error) => {
      void worker.terminate();
      reject(error instanceof Error ? error : new Error(String(error)));
    });
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker ${code} koduyla çıktı`));
    });
  });
}

/** Birleştirme iş kimliğine göre; bitiş sırası sonucu DEĞİŞTİREMEZ. */
function sortByWorkId(results: PoolResult[]): PoolResult[] {
  return [...results].sort((a, b) => (a.workId < b.workId ? -1 : a.workId > b.workId ? 1 : 0));
}
