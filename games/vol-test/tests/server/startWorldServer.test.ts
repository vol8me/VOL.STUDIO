import { Client } from '@colyseus/sdk';
import { createServer } from 'node:http';
import { matchMaker } from '@colyseus/core';
import { PROTOCOL_VERSION } from '@volstudio/network/protocol';
import { DEFAULT_GUARD } from '@volstudio/network/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROOM } from '@/network/rooms';
import { WORLD_SCHEMA } from '@/network/schema';
import { startWorldServer } from '../../server/index';
import { until } from '../support/netHarness';

type Started = Awaited<ReturnType<typeof startWorldServer>>;
const started: Started[] = [];

afterEach(async () => {
  await Promise.all(started.splice(0).map((server) => server.stop()));
});

async function start(options: Parameters<typeof startWorldServer>[3]): Promise<Started> {
  const server = await startWorldServer(0, '127.0.0.1', undefined, options);
  started.push(server);
  return server;
}

describe('startWorldServer', () => {
  it('birincil oda süreç içi depo bağını tüketir ve insansız kalınca korunur', async () => {
    const load = vi.fn(() => undefined);
    const save = vi.fn(() => true);
    const server = await start({ climateStore: { load, save } });
    expect(load).toHaveBeenCalledOnce();
    const [listing] = await matchMaker.query({ name: ROOM.world });
    const room = matchMaker.getLocalRoomById(listing.roomId);
    expect(room.autoDispose).toBe(false);
    await server.stop();
    expect(save).toHaveBeenCalledOnce();
  });

  it('ops kapanışı hata verse de oyun sunucusu kapanır ve stop tek kez yürür', async () => {
    const server = await start({ ops: { port: 0, host: '127.0.0.1' } });
    await server.ops!.close();
    const close = vi.spyOn(server.ops!, 'close').mockRejectedValue(new Error('ops kapanışı'));
    await expect(server.stop()).rejects.toThrow('ops kapanışı');
    expect(server.http.listening).toBe(false);
    await expect(server.stop()).rejects.toThrow('ops kapanışı');
    expect(close).toHaveBeenCalledOnce();
    started.splice(started.indexOf(server), 1);
  });

  it('ops portu doluysa kurulmuş dünyayı ve oyun portunu geri kapatır', async () => {
    const occupied = createServer();
    await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve));
    const address = occupied.address() as { port: number };
    try {
      await expect(
        startWorldServer(0, '127.0.0.1', undefined, {
          ops: { port: address.port, host: '127.0.0.1' },
        }),
      ).rejects.toThrow(/EADDRINUSE/);
      expect(await matchMaker.query({ name: ROOM.world })).toHaveLength(0);
      const server = await start(undefined);
      expect(server.http.listening).toBe(true);
    } finally {
      await new Promise<void>((resolve) => occupied.close(() => resolve()));
    }
  });

  it('işletim kapısı kapalıdır, kapı ve ops verilmedikçe kurulmaz', async () => {
    const server = await start(undefined);
    expect(server.ops).toBeNull();
    expect(server.guard).toBeNull();
  });

  it('işletim kapısı oda adım süresi, trafik ve bağlantı kapısı sayaçlarını verir', async () => {
    const server = await start({
      guard: { ...DEFAULT_GUARD, requestBurst: 100, requestsPerSecond: 100 },
      ops: { port: 0, host: '127.0.0.1' },
    });
    expect((await fetch(`${server.ops!.endpoint}/healthz`)).status).toBe(200);
    const room = await new Client(server.endpoint).joinOrCreate(
      ROOM.world,
      { protocol: PROTOCOL_VERSION, name: 'Ada' },
      WORLD_SCHEMA,
    );
    await until(() => (server.guard?.stats().sockets ?? 0) === 1, 'açık soket');
    const metrics = (await (await fetch(`${server.ops!.endpoint}/metrics`)).json()) as {
      rooms: Array<{ humans: number; step: { count: number }; traffic: { clients: number } }>;
      guard: { sockets: number } | null;
      loop: unknown;
    };
    expect(metrics.rooms).toHaveLength(1);
    expect(metrics.rooms[0]).toMatchObject({ humans: 1, traffic: { clients: 1 } });
    expect(metrics.rooms[0].step.count).toBeGreaterThan(0);
    expect(metrics.guard).toMatchObject({ sockets: 1 });
    expect(metrics.loop).toBeDefined();
    await room.leave();
  });
});
