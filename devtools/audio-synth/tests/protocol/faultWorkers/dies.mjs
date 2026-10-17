// Hata enjeksiyonu: hazır olur, ilk görevde yanıt vermeden ölür (çöküş ya
// da bellek taşmasının yerine geçer).
import { workerData } from 'node:worker_threads';
import { startHeartbeat } from '../../../src/protocol/parallelHeartbeat.mjs';

const { port, signal, beats, slot } = workerData;
startHeartbeat(beats, slot);
port.on('message', () => process.exit(3));
port.postMessage({ ready: true });
Atomics.add(signal, 0, 1);
Atomics.notify(signal, 0);
