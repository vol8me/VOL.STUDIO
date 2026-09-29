// İşçi canlılığı: her görev işçisi kendi alt iş parçacığında paylaşılan
// belleğe kalp atışı yazar. İşçi ölünce (bellek taşması, çöküş) alt iş
// parçacığı da sonlanır ve sayaç durur; `Atomics.wait` ile bloklu ana iş
// parçacığı `exit` olayını göremediği için ölümü sayacın durmasından anlar.
// Görev senkron koştuğundan işçinin kendi zamanlayıcısı bu işi göremez.
import { Worker } from 'node:worker_threads';

const HEARTBEAT_INTERVAL_MS = 250;

const BEAT = `const { workerData } = require('node:worker_threads');
const { beats, slot, interval } = workerData;
setInterval(() => Atomics.add(beats, slot, 1), interval);`;

export function startHeartbeat(beats, slot) {
  const heart = new Worker(BEAT, {
    eval: true,
    workerData: { beats, slot, interval: HEARTBEAT_INTERVAL_MS },
  });
  heart.unref();
  return heart;
}
