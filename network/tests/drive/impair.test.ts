import { createServer, connect, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { CLEAN_LINK, ImpairedLink } from '../../src/drive';

/** Gelen her baytı geri yollayan sunucu. */
let echo: Server;
const links: ImpairedLink[] = [];
const sockets: Socket[] = [];

async function startEcho(): Promise<number> {
  echo = createServer((socket) => {
    sockets.push(socket);
    socket.on('data', (chunk) => socket.write(chunk));
    socket.on('error', () => undefined);
  });
  await new Promise<void>((resolve) => echo.listen(0, '127.0.0.1', resolve));
  return (echo.address() as { port: number }).port;
}

async function link(profile = CLEAN_LINK, random?: () => number): Promise<ImpairedLink> {
  const port = await startEcho();
  const created = await ImpairedLink.start({ host: '127.0.0.1', port }, { profile, random });
  links.push(created);
  return created;
}

function open(port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => resolve(socket));
    socket.on('error', reject);
    sockets.push(socket);
  });
}

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  await Promise.all(links.splice(0).map((created) => created.close()));
  await new Promise<void>((resolve) => echo.close(() => resolve()));
});

/** Bir sonraki veriyi (ya da kapanışı) bekler ve geçen süreyi ölçer. */
function nextData(socket: Socket): Promise<{ text: string; ms: number }> {
  const began = performance.now();
  return new Promise((resolve) => {
    socket.once('data', (chunk: Buffer) =>
      resolve({ text: chunk.toString(), ms: performance.now() - began }),
    );
  });
}

describe('ImpairedLink', () => {
  it('temiz hatta veriyi olduğu gibi ve çabuk geri getirir; sayaçları tutar', async () => {
    const proxy = await link();
    const socket = await open(proxy.port);
    const reply = nextData(socket);
    socket.write('merhaba');
    const { text, ms } = await reply;
    expect(text).toBe('merhaba');
    expect(ms).toBeLessThan(100);
    expect(proxy.stats()).toMatchObject({ connections: 1, bytesUp: 7, bytesDown: 7, delayed: 0 });
    expect(proxy.endpoint).toBe(`http://127.0.0.1:${proxy.port}`);
  });

  it('her yöne sabit gecikme ekler: gidiş-dönüş iki katıdır', async () => {
    const proxy = await link({ latencyMs: 60 });
    const socket = await open(proxy.port);
    const reply = nextData(socket);
    socket.write('x');
    const { ms } = await reply;
    expect(ms).toBeGreaterThanOrEqual(110);
    expect(ms).toBeLessThan(400);
    expect(proxy.stats().delayed).toBeGreaterThanOrEqual(2);
  });

  it('titreşim sırayı bozmaz: geç gelen parça öncekini geçemez', async () => {
    let call = 0;
    // İlk parça en uzun, ikincisi en kısa gecikmeyi alır: sıra yine de korunmalı.
    const random = (): number => [1, 0][call++ % 2] ?? 0;
    const proxy = await link({ latencyMs: 80, jitterMs: 70 }, random);
    const socket = await open(proxy.port);
    let received = '';
    socket.on('data', (chunk: Buffer) => (received += chunk.toString()));
    socket.write('A');
    await new Promise((resolve) => setTimeout(resolve, 5));
    socket.write('B');
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(received).toBe('AB');
  });

  it('kayıp, arkadaki veriyi yeniden iletim süresi kadar bekletir', async () => {
    const proxy = await link({ latencyMs: 0, stallProbability: 1, stallMs: 120 });
    const socket = await open(proxy.port);
    const reply = nextData(socket);
    socket.write('x');
    expect((await reply).ms).toBeGreaterThanOrEqual(220);
  });

  it('bant genişliği sınırı büyük veriyi orantılı geciktirir', async () => {
    const proxy = await link({ latencyMs: 0, bytesPerSecond: 10_000 });
    const socket = await open(proxy.port);
    let got = 0;
    const done = new Promise<number>((resolve) => {
      const began = performance.now();
      socket.on('data', (chunk: Buffer) => {
        got += chunk.length;
        if (got >= 2000) resolve(performance.now() - began);
      });
    });
    socket.write(Buffer.alloc(2000, 1));
    // 2000 bayt, 10 000 bayt/sn: yukarı ve aşağı yönde 200 ms'er.
    expect(await done).toBeGreaterThanOrEqual(350);
  });

  it('profil çalışırken değişir: yeni parçalar yeni gecikmeyi alır', async () => {
    const proxy = await link({ latencyMs: 0 });
    const socket = await open(proxy.port);
    const fast = nextData(socket);
    socket.write('a');
    expect((await fast).ms).toBeLessThan(100);
    proxy.setProfile({ latencyMs: 100 });
    expect(proxy.profile.latencyMs).toBe(100);
    const slow = nextData(socket);
    socket.write('b');
    expect((await slow).ms).toBeGreaterThanOrEqual(180);
  });

  it('kara delik veriyi tutar, bağlantıyı açık bırakır ve bırakılınca sırayla teslim eder', async () => {
    const proxy = await link();
    const socket = await open(proxy.port);
    let received = '';
    socket.on('data', (chunk: Buffer) => (received += chunk.toString()));
    proxy.blackhole();
    socket.write('bir');
    socket.write('iki');
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(received).toBe('');
    expect(socket.destroyed).toBe(false);
    proxy.release();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(received).toBe('biriki');
  });

  it('sever açık bağlantıları hemen koparır', async () => {
    const proxy = await link();
    const socket = await open(proxy.port);
    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
    // Okunmayan veri kapan��� (end) geciktirir: ak��� a��k tut.
    socket.resume();
    socket.write('x');
    await new Promise((resolve) => setTimeout(resolve, 50));
    proxy.sever();
    await closed;
    expect(socket.destroyed).toBe(true);
  });

  it('istemci kapanınca kuyruktaki veri teslim edilir, sonra uç kapanır', async () => {
    const proxy = await link({ latencyMs: 80 });
    const socket = await open(proxy.port);
    let received = '';
    socket.on('data', (chunk: Buffer) => (received += chunk.toString()));
    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
    socket.end('son');
    await closed;
    expect(received).toBe('son');
  });
});
