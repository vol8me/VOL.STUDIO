import { request } from 'node:http';
import { connect } from 'node:net';
import { Room, defineRoom } from '@colyseus/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createLobby, JoinError } from '../../src/client';
import {
  addressKey,
  ConnectionGuard,
  DEFAULT_GUARD,
  guardSettings,
  Logger,
  startHost,
  type GuardSettings,
  type StartedHost,
} from '../../src/server';

const settings = (patch: Partial<GuardSettings> = {}): GuardSettings => ({
  ...DEFAULT_GUARD,
  ...patch,
});

describe('guardSettings', () => {
  it('varsayılanları verir ve ortamı okur', () => {
    expect(guardSettings({})).toEqual(DEFAULT_GUARD);
    expect(
      guardSettings({
        VOL_NET_MAX_SOCKETS: '10',
        VOL_NET_MAX_SOCKETS_PER_ADDRESS: '2',
        VOL_NET_REQUEST_RATE: '3',
        VOL_NET_REQUEST_BURST: '6',
        VOL_NET_ORIGINS: 'https://Oyun.example, tauri://localhost',
        VOL_NET_TRUST_PROXY: 'on',
      }),
    ).toEqual({
      maxSockets: 10,
      maxSocketsPerAddress: 2,
      requestsPerSecond: 3,
      requestBurst: 6,
      origins: ['https://oyun.example', 'tauri://localhost'],
      trustProxy: true,
    });
  });

  it('geçersiz değerde başlatmayı durdurur', () => {
    expect(() => guardSettings({ VOL_NET_MAX_SOCKETS: '0' })).toThrow(RangeError);
    expect(() => guardSettings({ VOL_NET_ORIGINS: 'oyun.example' })).toThrow(/köken/);
    expect(() => guardSettings({ VOL_NET_ORIGINS: 'https://a.example/yol' })).toThrow(/köken/);
  });
});

describe('addressKey', () => {
  it('IPv4’ü olduğu gibi, eşlemeli IPv6’yı IPv4’e indirger', () => {
    expect(addressKey('203.0.113.7')).toBe('203.0.113.7');
    expect(addressKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('IPv6’yı /64 önekine indirger; aynı ağdaki adresler tek anahtardır', () => {
    const a = addressKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    expect(a).toBe('2001:0db8:0001:0002::/64');
    expect(addressKey('2001:db8:1:2::1')).toBe(a);
    expect(addressKey('2001:db8:1:3::1')).not.toBe(a);
    expect(addressKey('::1')).toBe('0000:0000:0000:0000::/64');
    expect(addressKey('fe80::1%eth0')).toBe('fe80:0000:0000:0000::/64');
  });

  it('adres yoksa ortak bir anahtara düşer', () => {
    expect(addressKey(undefined)).toBe('unknown');
  });
});

describe('ConnectionGuard', () => {
  it('adres başına hız aşılınca 429 ve Retry-After verir; başka adres etkilenmez', () => {
    let now = 0;
    const guard = new ConnectionGuard(
      settings({ requestsPerSecond: 2, requestBurst: 2 }),
      () => now,
    );
    expect(guard.admitRequest('1.1.1.1', undefined).ok).toBe(true);
    expect(guard.admitRequest('1.1.1.1', undefined).ok).toBe(true);
    const refused = guard.admitRequest('1.1.1.1', undefined);
    expect(refused).toMatchObject({ ok: false, reason: 'rate', status: 429 });
    expect(refused.ok === false && refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(guard.admitRequest('2.2.2.2', undefined).ok).toBe(true);
    now += 600;
    expect(guard.admitRequest('1.1.1.1', undefined).ok).toBe(true);
  });

  it('adres başına eşzamanlı soketi sınırlar ve kapanışta yer açar', () => {
    const guard = new ConnectionGuard(settings({ maxSocketsPerAddress: 2 }), () => 0);
    const first = guard.admitUpgrade('1.1.1.1', undefined);
    const second = guard.admitUpgrade('1.1.1.1', undefined);
    expect(first.ok && second.ok).toBe(true);
    expect(guard.admitUpgrade('1.1.1.1', undefined)).toMatchObject({
      ok: false,
      reason: 'address-sockets',
      status: 429,
    });
    expect(guard.admitUpgrade('2.2.2.2', undefined).ok).toBe(true);
    if (first.ok) first.release();
    if (first.ok) first.release();
    expect(guard.admitUpgrade('1.1.1.1', undefined).ok).toBe(true);
    expect(guard.stats().sockets).toBe(3);
  });

  it('toplam soket sınırında 503 verir', () => {
    const guard = new ConnectionGuard(settings({ maxSockets: 1 }), () => 0);
    expect(guard.admitUpgrade('1.1.1.1', undefined).ok).toBe(true);
    expect(guard.admitUpgrade('2.2.2.2', undefined)).toMatchObject({
      ok: false,
      reason: 'sockets',
      status: 503,
    });
    expect(guard.stats().rejected.sockets).toBe(1);
  });

  it('izin listesi varsa yabancı kökeni reddeder, kökensiz istemciyi geçirir', () => {
    const guard = new ConnectionGuard(settings({ origins: ['https://oyun.example'] }), () => 0);
    expect(guard.admitRequest('1.1.1.1', 'https://OYUN.example').ok).toBe(true);
    expect(guard.admitRequest('1.1.1.1', undefined).ok).toBe(true);
    expect(guard.admitRequest('1.1.1.1', 'https://kotu.example')).toMatchObject({
      ok: false,
      reason: 'origin',
      status: 403,
    });
    expect(guard.admitUpgrade('1.1.1.1', 'null')).toMatchObject({ ok: false, reason: 'origin' });
  });

  it('boş izin listesinde köken denetlenmez', () => {
    const guard = new ConnectionGuard(settings(), () => 0);
    expect(guard.admitRequest('1.1.1.1', 'https://her.yer').ok).toBe(true);
  });

  it('idle adresleri unutur: izlenen adres sayısı sınırsız büyümez', () => {
    let now = 0;
    const guard = new ConnectionGuard(
      settings({ requestBurst: 1, requestsPerSecond: 1 }),
      () => now,
    );
    for (let index = 0; index < 600; index++) {
      guard.admitRequest(`10.0.${Math.floor(index / 250)}.${index % 250}`, undefined);
      now += 1000;
    }
    // Süpürme 256 kabulde bir çalışır; eski adresler bu sürede silinmiş olmalı.
    expect(guard.stats().addresses).toBe(0);
    expect(guard.admitRequest('10.9.9.9', undefined).ok).toBe(true);
  });
});

class PingRoom extends Room {
  override onCreate(): void {
    this.onMessage('input', (client, message: unknown) => client.send('echo', message));
  }
}

const rooms = { ping: defineRoom(PingRoom) };
const started: StartedHost<typeof rooms>[] = [];

async function start(guard: GuardSettings, logger?: Logger): Promise<StartedHost<typeof rooms>> {
  const host = await startHost(rooms, { port: 0, host: '127.0.0.1' }, { guard, logger });
  started.push(host);
  return host;
}

afterEach(async () => {
  await Promise.all(started.splice(0).map((host) => host.stop()));
});

function head(
  port: number,
  headers: Record<string, string> = {},
): Promise<{ status: number; retryAfter: string | undefined }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/', method: 'GET', headers }, (res) => {
      res.resume();
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, retryAfter: res.headers['retry-after'] as string }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

describe('startHost + guard', () => {
  it('hız sınırını aşan istek 429 alır ve Retry-After taşır; günlük bir kez uyarır', async () => {
    const logger = Logger.create({ src: 'test' });
    const host = await start(settings({ requestsPerSecond: 1, requestBurst: 2 }), logger);
    const statuses: number[] = [];
    let retryAfter: string | undefined;
    for (let index = 0; index < 6; index++) {
      const result = await head(host.port);
      statuses.push(result.status);
      if (result.status === 429) retryAfter = result.retryAfter;
    }
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThanOrEqual(3);
    expect(retryAfter).toBe('1');
    expect(host.guard?.stats().rejected.rate).toBeGreaterThanOrEqual(3);
    const warnings = logger.since().records.filter((record) => record.ev === 'guard.rejected');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].data).toMatchObject({ reason: 'rate', status: 429 });
  });

  it('yabancı köken HTTP’de 403 alır, izinli köken geçer', async () => {
    const host = await start(settings({ origins: ['https://oyun.example'] }));
    expect((await head(host.port, { Origin: 'https://kotu.example' })).status).toBe(403);
    expect((await head(host.port, { Origin: 'https://oyun.example' })).status).not.toBe(403);
  });

  it('ters vekil güvenilmiyorsa X-Forwarded-For adres sınırını atlatamaz', async () => {
    const host = await start(settings({ requestsPerSecond: 1, requestBurst: 2 }));
    const statuses: number[] = [];
    for (let index = 0; index < 6; index++)
      statuses.push((await head(host.port, { 'X-Forwarded-For': `9.9.9.${index}` })).status);
    expect(statuses).toContain(429);
  });

  it('ters vekile güvenilirse sağ uçtaki adres sayılır', async () => {
    const host = await start(settings({ requestsPerSecond: 1, requestBurst: 2, trustProxy: true }));
    const statuses: number[] = [];
    for (let index = 0; index < 6; index++)
      statuses.push((await head(host.port, { 'X-Forwarded-For': `9.9.9.${index}` })).status);
    expect(statuses).not.toContain(429);
  });

  it('gerçek istemci eşleşir; aşan soket kapıda reddedilir, kapanınca yer açılır', async () => {
    const host = await start(
      settings({ maxSocketsPerAddress: 1, requestBurst: 100, requestsPerSecond: 100 }),
    );
    const room = await createLobby(host.endpoint).joinOrCreate('ping');
    expect(host.guard?.stats().sockets).toBe(1);
    await expect(createLobby(host.endpoint).joinOrCreate('ping')).rejects.toBeDefined();
    expect(host.guard?.stats().rejected['address-sockets']).toBeGreaterThanOrEqual(1);
    await room.leave();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(host.guard?.stats().sockets).toBe(0);
    const again = await createLobby(host.endpoint).joinOrCreate('ping');
    await again.leave();
  });

  it('hız sınırına takılan katılım istemcide `busy` olarak görünür', async () => {
    const host = await start(settings({ requestsPerSecond: 1, requestBurst: 1 }));
    const reasons: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const failure = await createLobby(host.endpoint)
        .joinOrCreate('ping')
        .then(
          (room) => room.leave().then(() => undefined),
          (error: unknown) => error,
        );
      if (failure instanceof JoinError) reasons.push(failure.reason);
    }
    expect(reasons).toContain('busy');
  });

  it('ham yükseltme reddi bağlantıyı kapatır ve HTTP durum satırı yazar', async () => {
    const host = await start(
      settings({
        maxSockets: 1,
        maxSocketsPerAddress: 5,
        requestBurst: 100,
        requestsPerSecond: 100,
      }),
    );
    const holder = await createLobby(host.endpoint).joinOrCreate('ping');
    const reply = await new Promise<string>((resolve, reject) => {
      const socket = connect(host.port, '127.0.0.1');
      let text = '';
      socket.on('data', (chunk) => (text += chunk.toString('latin1')));
      socket.on('close', () => resolve(text));
      socket.on('error', reject);
      socket.write(
        'GET /abc/def HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n' +
          'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n',
      );
    });
    expect(reply).toMatch(/^HTTP\/1\.1 503 Service Unavailable/);
    expect(reply).toContain('Retry-After: 5');
    await holder.leave();
  });
});
