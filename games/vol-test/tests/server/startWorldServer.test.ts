import { Client } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '@volstudio/network/protocol';
import { DEFAULT_GUARD } from '@volstudio/network/server';
import { afterEach, describe, expect, it } from 'vitest';
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
