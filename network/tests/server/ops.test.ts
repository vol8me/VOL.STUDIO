import { request } from 'node:http';
import { connect } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { Logger, OpsError, serveOps, type OpsOptions, type OpsServer } from '../../src/server';

const open: OpsServer[] = [];

async function start(options: Partial<OpsOptions> = {}): Promise<OpsServer> {
  const server = await serveOps({ port: 0, ...options });
  open.push(server);
  return server;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((server) => server.close()));
});

/** `Host` başlığını elle verebilmek için ham HTTP isteği. */
function raw(
  server: OpsServer,
  path: string,
  options: { host?: string; method?: string; body?: string } = {},
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: server.port,
        path,
        method: options.method ?? 'GET',
        setHost: false,
        headers: { host: options.host ?? `127.0.0.1:${server.port}` },
      },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => (text += chunk));
        response.on('end', () => resolve({ status: response.statusCode ?? 0, text }));
      },
    );
    req.on('error', reject);
    req.end(options.body);
  });
}

/** HTTP/1.0 isteği `Host` başlığı olmadan geçerlidir; Node HTTP/1.1'de eksik başlığı kendisi reddeder. */
function withoutHost(server: OpsServer): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(server.port, '127.0.0.1', () =>
      socket.write('GET /healthz HTTP/1.0\r\n\r\n'),
    );
    let text = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => (text += chunk));
    socket.on('end', () => resolve(text));
    socket.on('error', reject);
  });
}

async function json(server: OpsServer, path: string, init?: RequestInit) {
  const response = await fetch(`${server.endpoint}${path}`, init);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('serveOps', () => {
  it('sağlık ucu düz metin ok verir ve önbelleğe almayı yasaklar', async () => {
    const server = await start();
    const response = await fetch(`${server.endpoint}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('metrics süreç özetine oyun ölçümlerini ekler', async () => {
    const server = await start({ metrics: () => ({ rooms: 3 }) });
    const { status, body } = await json(server, '/metrics');
    expect(status).toBe(200);
    expect(body.rooms).toBe(3);
    expect(body.pid).toBe(process.pid);
    expect(body).toHaveProperty('loop');
    expect(body).toHaveProperty('memory');
  });

  it('metrics oyun ölçümü olmadan da çalışır; eşzamansız ölçümü bekler', async () => {
    const bare = await start();
    expect((await json(bare, '/metrics')).body.pid).toBe(process.pid);
    const later = await start({ metrics: () => Promise.resolve({ late: true }) });
    expect((await json(later, '/metrics')).body.late).toBe(true);
  });
});

describe('/logs', () => {
  it('günlük verilmemişse 404 verir', async () => {
    const server = await start();
    expect((await json(server, '/logs')).status).toBe(404);
  });

  it('artımlı ve seviye süzgeçli okur', async () => {
    const logger = Logger.create({ src: 'test', level: 'debug' });
    logger.info('bir');
    logger.error('iki');
    logger.info('üç');
    const server = await start({ logger });
    const all = (await json(server, '/logs')).body as { records: { ev: string }[]; next: number };
    expect(all.records.map((record) => record.ev)).toContain('bir');
    const tail = (await json(server, `/logs?since=${all.next - 1}`)).body as {
      records: { ev: string }[];
    };
    expect(tail.records).toHaveLength(1);
    const errors = (await json(server, '/logs?level=error')).body as { records: { ev: string }[] };
    expect(errors.records.map((record) => record.ev)).toEqual(['iki']);
    const limited = (await json(server, '/logs?limit=1')).body as { records: unknown[] };
    expect(limited.records).toHaveLength(1);
  });

  it('geçersiz parametreyi 400 ile reddeder', async () => {
    const server = await start({ logger: Logger.create({ src: 'test' }) });
    for (const query of ['level=yüksek', 'since=-1', 'since=x', 'limit=0', 'limit=2001']) {
      expect((await json(server, `/logs?${query}`)).status).toBe(400);
    }
  });
});

describe('ek rotalar', () => {
  it('GET ve POST rotalarını çalıştırır; gövdeyi JSON olarak verir', async () => {
    const server = await start({
      routes: {
        'GET /echo': ({ url }) => ({ q: url.searchParams.get('q') }),
        'POST /sum': ({ body }) => {
          const { a, b } = body as { a: number; b: number };
          return { sum: a + b };
        },
        'POST /empty': ({ body }) => ({ body: body === undefined ? 'yok' : 'var' }),
        'POST /nothing': () => undefined,
      },
    });
    expect((await json(server, '/echo?q=7')).body).toEqual({ q: '7' });
    const sum = await json(server, '/sum', {
      method: 'POST',
      body: JSON.stringify({ a: 2, b: 3 }),
    });
    expect(sum.body).toEqual({ sum: 5 });
    expect((await json(server, '/empty', { method: 'POST' })).body).toEqual({ body: 'yok' });
    expect((await json(server, '/nothing', { method: 'POST' })).body).toEqual({ ok: true });
  });

  it('bilinmeyen yola 404, yanlış yönteme 405 verir', async () => {
    const server = await start({ routes: { 'POST /do': () => ({}) } });
    expect((await json(server, '/yok')).status).toBe(404);
    expect((await json(server, '/do')).status).toBe(405);
  });

  it('geçersiz JSON gövdesine 400, büyük gövdeye 413 verir', async () => {
    const server = await start({ routes: { 'POST /do': () => ({}) }, maxBodyBytes: 32 });
    expect((await json(server, '/do', { method: 'POST', body: '{bozuk' })).status).toBe(400);
    const big = await raw(server, '/do', {
      method: 'POST',
      body: JSON.stringify({ x: 'y'.repeat(100) }),
    });
    expect(big.status).toBe(413);
  });

  it('OpsError durum kodunu taşır; beklenmeyen hata 500 olur, ayrıntı sızmaz ve günlüğe yazılır', async () => {
    const logger = Logger.create({ src: 'test' });
    const server = await start({
      logger,
      routes: {
        'GET /conflict': () => {
          throw new OpsError(409, 'çakışma');
        },
        'GET /boom': () => {
          throw new Error('gizli ayrıntı');
        },
      },
    });
    const conflict = await json(server, '/conflict');
    expect(conflict).toEqual({ status: 409, body: { error: 'çakışma' } });
    const boom = await json(server, '/boom');
    expect(boom.status).toBe(500);
    expect(JSON.stringify(boom.body)).not.toContain('gizli');
    const failed = logger.since().records.find((record) => record.ev === 'route.failed');
    expect(failed?.lvl).toBe('error');
    expect(failed?.src).toBe('ops');
  });
});

describe('Host başlığı koruması', () => {
  it('loopback adlarını kabul eder', async () => {
    const server = await start();
    for (const host of ['127.0.0.1:1', 'localhost:2', 'localhost', '[::1]:3']) {
      expect((await raw(server, '/healthz', { host })).status, host).toBe(200);
    }
  });

  it('yabancı ya da eksik Host başlığını 403 ile reddeder', async () => {
    const server = await start();
    for (const host of ['evil.example', 'evil.example:80', '127.0.0.1.evil.example']) {
      expect((await raw(server, '/healthz', { host })).status, host).toBe(403);
    }
    expect(await withoutHost(server)).toMatch(/^HTTP\/1\.[01] 403 /);
  });

  it('joker adrese bağlanınca Host sınırlaması kalkar (açık uzak erişim kararı)', async () => {
    const server = await start({ host: '0.0.0.0' });
    expect((await raw(server, '/healthz', { host: 'ops.lab.internal' })).status).toBe(200);
  });
});

describe('yaşam döngüsü', () => {
  it('close sunucuyu kapatır; ardından bağlanılamaz', async () => {
    const server = await start();
    await server.close();
    await expect(fetch(`${server.endpoint}/healthz`)).rejects.toThrow();
  });

  it('kullanımdaki porta bağlanmak reddedilir', async () => {
    const first = await start();
    await expect(serveOps({ port: first.port })).rejects.toThrow();
  });

  it('günlük verilmişse dinleme olayını yazar', async () => {
    const logger = Logger.create({ src: 'test' });
    const server = await start({ logger });
    const event = logger.since().records.find((record) => record.ev === 'listening');
    expect(event?.src).toBe('ops');
    expect(event?.data).toEqual({ host: '127.0.0.1', port: server.port });
  });
});
