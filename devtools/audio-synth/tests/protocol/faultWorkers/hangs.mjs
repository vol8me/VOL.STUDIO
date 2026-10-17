// Hata enjeksiyonu: hazır olur, görevi alır ama hiç yanıtlamaz; kalp atışı
// sürer (canlı ama asılı worker).
import { workerData } from 'node:worker_threads';
import { startHeartbeat } from '../../../src/protocol/parallelHeartbeat.mjs';

const { port, signal, beats, slot } = workerData;
startHeartbeat(beats, slot);
port.on('message', () => {});
port.postMessage({ ready: true });
Atomics.add(signal, 0, 1);
Atomics.notify(signal, 0);
