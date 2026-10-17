import { createServer, connect, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { startImpairedProxy, type ImpairedProxy } from './impairedProxy';

let echo: Server | undefined;
let proxy: ImpairedProxy | undefined;

afterEach(async () => {
  await proxy?.stop();
  await new Promise<void>((done) => (echo ? echo.close(() => done()) : done()));
  echo = proxy = undefined;
});

async function start(profile: Parameters<typeof startImpairedProxy>[1], seed = 1) {
  echo = createServer((socket) => socket.pipe(socket));
  const port = await new Promise<number>((resolve) =>
    echo!.listen(0, '127.0.0.1', () => resolve((echo!.address() as { port: number }).port)),
  );
  proxy = await startImpairedProxy(port, profile, seed);
  const url = new URL(proxy.endpoint.replace('ws://', 'http://'));
  const socket = connect({ host: url.hostname, port: Number(url.port) });
  socket.setNoDelay(true);
  await new Promise((resolve) => socket.once('connect', resolve));
  return socket;
}

describe('impairedProxy', () => {
  it('gecikmeyi her yöne uygular: gidiş-dönüş en az iki katıdır', async () => {
    const socket = await start({ latencyMs: 60, jitterMs: 0, stallPct: 0, stallMs: 0 });
    const sent = Date.now();
    const reply = new Promise<Buffer>((resolve) => socket.once('data', resolve));
    socket.write('ping');
    expect((await reply).toString()).toBe('ping');
    expect(Date.now() - sent).toBeGreaterThanOrEqual(115);
    socket.destroy();
  });

  it('sırayı korur ve bekletilen parçanın arkasındakiler onunla bekler', async () => {
    const socket = await start({ latencyMs: 5, jitterMs: 0, stallPct: 100, stallMs: 80 });
    const received: string[] = [];
    socket.on('data', (chunk) => received.push(chunk.toString()));
    for (const part of ['a', 'b', 'c']) {
      socket.write(part);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(received.join('')).toBe('abc');
    expect(proxy!.stats.stalled).toBeGreaterThanOrEqual(3);
    socket.destroy();
  });

  it('bekletme yüzdesi sıfırken hiçbir parça bekletilmez', async () => {
    const socket = await start({ latencyMs: 1, jitterMs: 2, stallPct: 0, stallMs: 500 });
    const reply = new Promise<Buffer>((resolve) => socket.once('data', resolve));
    socket.write('x');
    await reply;
    expect(proxy!.stats.stalled).toBe(0);
    expect(proxy!.stats.chunks).toBeGreaterThanOrEqual(2);
    socket.destroy();
  });
});
