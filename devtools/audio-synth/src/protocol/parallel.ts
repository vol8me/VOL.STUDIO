import {
  MessageChannel,
  receiveMessageOnPort,
  Worker,
  type MessagePort,
} from 'node:worker_threads';
import { renderSession } from '../kernel/session';
import { runTaskInline, type TaskContext, type TaskName } from './parallelTasks';

/**
 * Toplu işleri worker iş parçacıklarında koşar ve sonuçları GİRDİ SIRASINA
 * yerleştirir: tamamlanma sırası sonucu ve sırayı etkilemez. Protokol API'si
 * senkron olduğu için ana iş parçacığı `Atomics.wait` ile bekler ve yanıtı
 * `receiveMessageOnPort` ile senkron alır.
 */

const WORKER_URL = new URL('./parallelWorker.mjs', import.meta.url);
/** Bir worker'ın açılıp görev almaya hazır olması için süre sınırı. */
const READY_TIMEOUT_MS = 60_000;
/**
 * Tek bir görevin yanıt süre sınırı. Görev başınadır: başka bir worker'ın
 * ilerlemesi asılı kalan görevin süresini sıfırlamaz.
 */
const TASK_TIMEOUT_MS = 30 * 60_000;
/** Kalp atışı bu kadar durursa worker ölmüş sayılır (atış aralığı 250 ms). */
const HEARTBEAT_STALE_MS = 10_000;
const WAIT_SLICE_MS = 1_000;

/** Testin hata enjeksiyonu için; üretim yolu varsayılanları kullanır. */
export interface PoolOptions {
  readonly workerUrl?: URL;
  readonly taskTimeoutMs?: number;
  readonly heartbeatStaleMs?: number;
}

interface Handle {
  readonly index: number;
  readonly worker: Worker;
  readonly port: MessagePort;
  task: number;
  deadline: number;
  beat: number;
  beatAt: number;
}

interface Reply {
  readonly id?: number;
  readonly ok?: boolean;
  readonly ready?: boolean;
  readonly output?: unknown;
  readonly error?: { readonly name: string; readonly message: string };
}

export class ParallelTaskError extends Error {
  constructor(task: string, detail: { readonly name: string; readonly message: string }) {
    super(`${task}: worker hatası (${detail.name}): ${detail.message}`);
    this.name = 'ParallelTaskError';
  }
}

function contextOf(repoRoot: string): TaskContext {
  const session = renderSession();
  return { repoRoot, quality: session.quality, cache: session.cache !== null };
}

class Pool {
  readonly signal = new Int32Array(new SharedArrayBuffer(4));
  readonly handles: Handle[];
  private readonly beats: Int32Array;

  constructor(
    count: number,
    private readonly name: string,
    private readonly options: Required<PoolOptions>,
  ) {
    this.beats = new Int32Array(new SharedArrayBuffer(4 * count));
    const now = Date.now();
    this.handles = Array.from({ length: count }, (_, index) => {
      const { port1, port2 } = new MessageChannel();
      const worker = new Worker(options.workerUrl, {
        workerData: { port: port2, signal: this.signal, beats: this.beats, slot: index },
        transferList: [port2],
      });
      return { index, worker, port: port1, task: -1, deadline: 0, beat: 0, beatAt: now };
    });
  }

  /**
   * Bir dilim bekler, sonra canlılığı denetler: kalp atışı duran worker
   * ölmüştür; süresi dolan görev asılı kalmıştır. İkisi de adıyla düşer.
   */
  wait(seen: number, watched: readonly Handle[], what: string): void {
    Atomics.wait(this.signal, 0, seen, WAIT_SLICE_MS);
    this.check(watched, what);
  }

  /** İlerleyen worker'lar varken de ölü ya da asılı olan görülür. */
  check(watched: readonly Handle[], what: string): void {
    const now = Date.now();
    for (const handle of watched) {
      const beat = Atomics.load(this.beats, handle.index);
      if (beat !== handle.beat) {
        handle.beat = beat;
        handle.beatAt = now;
      } else if (now - handle.beatAt > this.options.heartbeatStaleMs) {
        throw new ParallelTaskError(this.name, {
          name: 'WorkerDied',
          message: `worker ${handle.index} ${what} sırasında öldü (kalp atışı durdu; bellek taşması ya da çöküş)`,
        });
      }
      if (now > handle.deadline) {
        throw new Error(`paralel toplu iş: ${what} süre sınırını aştı (worker ${handle.index})`);
      }
    }
  }

  awaitReady(): void {
    const pending = new Set(this.handles);
    const deadline = Date.now() + READY_TIMEOUT_MS;
    for (const handle of pending) handle.deadline = deadline;
    while (pending.size > 0) {
      const seen = Atomics.load(this.signal, 0);
      for (const handle of [...pending]) {
        const reply = receiveMessageOnPort(handle.port)?.message as Reply | undefined;
        if (!reply) continue;
        if (!reply.ready)
          throw new ParallelTaskError(this.name, reply.error ?? { name: '?', message: '' });
        pending.delete(handle);
      }
      if (pending.size > 0) this.wait(seen, [...pending], 'worker açılışı');
    }
  }

  close(): void {
    for (const handle of this.handles) {
      handle.port.close();
      void handle.worker.terminate();
    }
  }
}

/**
 * Görevi her girdi için koşar. `workers <= 1` ya da tek girdi seri yoldur:
 * aynı görev işlevi ana iş parçacığında, etkin render oturumuyla çalışır.
 */
export function runTasks<O>(
  repoRoot: string,
  name: TaskName,
  inputs: readonly unknown[],
  workers: number,
  options: PoolOptions = {},
): O[] {
  const ctx = contextOf(repoRoot);
  if (workers <= 1 || inputs.length <= 1) {
    return inputs.map((input) => runTaskInline(name, input, ctx) as O);
  }
  const taskTimeoutMs = options.taskTimeoutMs ?? TASK_TIMEOUT_MS;
  const pool = new Pool(Math.min(workers, inputs.length), name, {
    workerUrl: options.workerUrl ?? WORKER_URL,
    taskTimeoutMs,
    heartbeatStaleMs: options.heartbeatStaleMs ?? HEARTBEAT_STALE_MS,
  });
  try {
    pool.awaitReady();
    const results = new Array<O>(inputs.length);
    let next = 0;
    let done = 0;
    const assign = (handle: Handle) => {
      handle.task = next < inputs.length ? next++ : -1;
      if (handle.task >= 0) {
        handle.deadline = Date.now() + taskTimeoutMs;
        handle.port.postMessage({ id: handle.task, name, input: inputs[handle.task], ctx });
      }
    };
    pool.handles.forEach(assign);
    while (done < inputs.length) {
      const seen = Atomics.load(pool.signal, 0);
      let progressed = false;
      for (const handle of pool.handles) {
        if (handle.task < 0) continue;
        const reply = receiveMessageOnPort(handle.port)?.message as Reply | undefined;
        if (!reply) continue;
        if (!reply.ok) throw new ParallelTaskError(name, reply.error ?? { name: '?', message: '' });
        results[reply.id as number] = reply.output as O;
        done++;
        progressed = true;
        assign(handle);
      }
      const busy = pool.handles.filter((handle) => handle.task >= 0);
      if (progressed) pool.check(busy, 'görev yanıtı');
      else pool.wait(seen, busy, 'görev yanıtı');
    }
    return results;
  } finally {
    pool.close();
  }
}
