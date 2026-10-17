import { createServer, connect, type Server, type Socket } from 'node:net';
import { createRandom } from '@volstudio/core/random';

/**
 * Bozuk ağ profili. `latencyMs` her yönün sabit gecikmesidir (gidiş-dönüş iki katıdır); `jitterMs`
 * her parçaya 0..jitterMs eklenir. WebSocket TCP üstünde koştuğundan paket kaybı uygulamaya düşen
 * paket olarak değil yeniden iletim bekleyişi olarak görünür: `stallPct` yüzdesindeki parçalar
 * `stallMs` kadar ek bekler ve arkadaki her şey (sıra korunur) onunla birlikte bekler.
 */
export interface ImpairmentProfile {
  readonly latencyMs: number;
  readonly jitterMs: number;
  readonly stallPct: number;
  readonly stallMs: number;
}

export interface ImpairedProxy {
  /** `ws://` adresi (HTTP eşleştirme isteği de aynı porttan geçer). */
  readonly endpoint: string;
  /** Aktarılan parça ve bekletilen (stall) parça sayıları. */
  readonly stats: { chunks: number; stalled: number };
  stop(): Promise<void>;
}

interface Queued {
  readonly due: number;
  readonly chunk: Buffer;
}

/** Tek yön: gelen parçalar sıra korunarak `due` anında yazılır. */
function pump(
  from: Socket,
  to: Socket,
  profile: ImpairmentProfile,
  random: ReturnType<typeof createRandom>,
  stats: ImpairedProxy['stats'],
): void {
  const queue: Queued[] = [];
  let lastDue = 0;
  let timer: NodeJS.Timeout | undefined;
  let ended = false;

  const flush = (): void => {
    timer = undefined;
    const now = Date.now();
    while (queue.length > 0 && queue[0].due <= now) {
      const next = queue.shift() as Queued;
      if (!to.destroyed) to.write(next.chunk);
    }
    if (queue.length > 0) timer = setTimeout(flush, Math.max(0, queue[0].due - Date.now()));
    else if (ended && !to.destroyed) to.end();
  };

  from.on('data', (chunk: Buffer) => {
    stats.chunks += 1;
    let delay = profile.latencyMs + random.next() * profile.jitterMs;
    if (random.next() * 100 < profile.stallPct) {
      delay += profile.stallMs;
      stats.stalled += 1;
    }
    // Sıra korunur: bir parça öncekinden erken çıkamaz (TCP'nin baş-sırası engellemesi).
    lastDue = Math.max(lastDue, Date.now() + delay);
    queue.push({ due: lastDue, chunk });
    timer ??= setTimeout(flush, Math.max(0, lastDue - Date.now()));
  });
  from.on('end', () => {
    ended = true;
    if (queue.length === 0 && !to.destroyed) to.end();
  });
  const close = (): void => {
    if (timer) clearTimeout(timer);
    queue.length = 0;
    to.destroy();
  };
  from.on('error', close);
  from.on('close', close);
}

/** Hedef sunucunun önüne gecikme, titreşim ve yeniden iletim bekleyişi koyan TCP vekili başlatır. */
export function startImpairedProxy(
  targetPort: number,
  profile: ImpairmentProfile,
  seed = 1,
): Promise<ImpairedProxy> {
  const random = createRandom(seed);
  const stats = { chunks: 0, stalled: 0 };
  const sockets = new Set<Socket>();
  const server: Server = createServer((client) => {
    const upstream = connect({ host: '127.0.0.1', port: targetPort });
    sockets.add(client);
    sockets.add(upstream);
    for (const socket of [client, upstream]) {
      socket.setNoDelay(true);
      socket.on('close', () => sockets.delete(socket));
    }
    pump(client, upstream, profile, random, stats);
    pump(upstream, client, profile, random, stats);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string')
        return reject(new Error('Vekil portu okunamadı'));
      resolve({
        endpoint: `ws://127.0.0.1:${address.port}`,
        stats,
        stop: () =>
          new Promise<void>((done) => {
            for (const socket of sockets) socket.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}
