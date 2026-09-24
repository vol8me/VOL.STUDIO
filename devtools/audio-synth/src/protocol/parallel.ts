import {
  MessageChannel,
  receiveMessageOnPort,
  Worker,
  type MessagePort,
} from 'node:worker_threads';
import { renderSession } from '../engine/session';
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
/** Tek bir görevin yanıt süre sınırı; aşılırsa worker yanıt vermiyor sayılır. */
const TASK_TIMEOUT_MS = 30 * 60_000;
const WAIT_SLICE_MS = 1_000;

interface Handle {
  readonly worker: Worker;
  readonly port: MessagePort;
  task: number;
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

function waitFor(signal: Int32Array, seen: number, deadline: number, what: string): void {
  if (Atomics.wait(signal, 0, seen, WAIT_SLICE_MS) === 'timed-out' && Date.now() > deadline) {
    throw new Error(`paralel toplu iş: ${what} süre sınırını aştı`);
  }
}

function spawn(count: number, signal: Int32Array): Handle[] {
  return Array.from({ length: count }, () => {
    const { port1, port2 } = new MessageChannel();
    const worker = new Worker(WORKER_URL, {
      workerData: { port: port2, signal },
      transferList: [port2],
    });
    return { worker, port: port1, task: -1 };
  });
}

function awaitReady(handles: readonly Handle[], signal: Int32Array, name: string): void {
  const pending = new Set(handles);
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (pending.size > 0) {
    const seen = Atomics.load(signal, 0);
    for (const handle of [...pending]) {
      const reply = receiveMessageOnPort(handle.port)?.message as Reply | undefined;
      if (!reply) continue;
      if (!reply.ready)
        throw new ParallelTaskError(name, reply.error ?? { name: '?', message: '' });
      pending.delete(handle);
    }
    if (pending.size > 0) waitFor(signal, seen, deadline, 'worker açılışı');
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
): O[] {
  const ctx = contextOf(repoRoot);
  if (workers <= 1 || inputs.length <= 1) {
    return inputs.map((input) => runTaskInline(name, input, ctx) as O);
  }
  const signal = new Int32Array(new SharedArrayBuffer(4));
  const handles = spawn(Math.min(workers, inputs.length), signal);
  try {
    awaitReady(handles, signal, name);
    const results = new Array<O>(inputs.length);
    let next = 0;
    let done = 0;
    const assign = (handle: Handle) => {
      handle.task = next < inputs.length ? next++ : -1;
      if (handle.task >= 0) {
        handle.port.postMessage({ id: handle.task, name, input: inputs[handle.task], ctx });
      }
    };
    handles.forEach(assign);
    let deadline = Date.now() + TASK_TIMEOUT_MS;
    while (done < inputs.length) {
      const seen = Atomics.load(signal, 0);
      let progressed = false;
      for (const handle of handles) {
        if (handle.task < 0) continue;
        const reply = receiveMessageOnPort(handle.port)?.message as Reply | undefined;
        if (!reply) continue;
        if (!reply.ok) throw new ParallelTaskError(name, reply.error ?? { name: '?', message: '' });
        results[reply.id as number] = reply.output as O;
        done++;
        progressed = true;
        assign(handle);
      }
      if (progressed) deadline = Date.now() + TASK_TIMEOUT_MS;
      else waitFor(signal, seen, deadline, 'görev yanıtı');
    }
    return results;
  } finally {
    for (const handle of handles) {
      handle.port.close();
      void handle.worker.terminate();
    }
  }
}
