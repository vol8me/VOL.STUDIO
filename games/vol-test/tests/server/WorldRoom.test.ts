import { Client, type Room } from '@colyseus/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { startWorldServer } from '../../server/index';

let server: Awaited<ReturnType<typeof startWorldServer>> | undefined;
const clients: Room[] = [];

interface RoomView {
  tick: number;
  players: Map<
    string,
    { vehicleId: number; x: number; y: number; health: number; maxHealth: number; alive: boolean }
  >;
}

function state(room: Room): RoomView {
  return room.state as RoomView;
}

const intent = (seq: number) => ({
  seq,
  moveX: 1,
  moveY: 0,
  aimX: 0,
  aimY: 0,
  fire: false,
  boost: false,
  brake: false,
});

async function waitForState(room: Room, predicate: () => boolean): Promise<void> {
  if (predicate()) return;
  await new Promise<void>((resolve) => {
    room.onStateChange((state) => {
      if (state && predicate()) resolve();
    });
  });
}

async function join(): Promise<Room> {
  const room = await new Client(server!.endpoint).joinOrCreate('voltest', { protocol: 1 });
  clients.push(room);
  return room;
}

afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map((room) => room.leave()));
  await server?.server.gracefullyShutdown(false);
  server = undefined;
});

describe('gerçek WebSocket üzerinden VOL.TEST oda otoritesi', () => {
  it('12 oyuncuyu tek dünyaya alır, 13. kişiyi ve yanlış protokolü reddeder', async () => {
    server = await startWorldServer(0);
    const guests = await Promise.all(Array.from({ length: 12 }, () => join()));
    const observer = guests[0];
    await waitForState(observer, () => state(observer).players.size === 12);
    const ids = new Set(Array.from(state(observer).players.values(), (entry) => entry.vehicleId));
    expect(ids.size).toBe(12);
    expect(state(observer).players.get(observer.sessionId)).toMatchObject({
      health: 100,
      maxHealth: 100,
      alive: true,
    });
    await expect(
      new Client(server.endpoint).joinById(observer.roomId, { protocol: 1 }),
    ).rejects.toThrow();
    await expect(
      new Client(server.endpoint).joinOrCreate('voltest', { protocol: 99 }),
    ).rejects.toThrow();
  }, 20_000);

  it('64 komut burst hız hilesi üretmez, sahte diğer oyuncu pozunu yazamaz', async () => {
    server = await startWorldServer(0);
    const first = await join();
    const second = await join();
    await waitForState(first, () => state(first).players.size === 2);
    const startTick = state(first).tick;
    const entity = state(first).players.get(first.sessionId)!;
    const start = { x: entity.x, y: entity.y };
    for (let seq = 0; seq < 64; seq++) {
      first.send('input', { ...intent(seq), x: 9e8, y: 9e8, target: second.sessionId });
    }
    await waitForState(first, () => state(first).tick >= startTick + 12);
    const current = state(first).players.get(first.sessionId)!;
    expect(Math.hypot(current.x - start.x, current.y - start.y)).toBeLessThan(100);
    expect(current.x).toBeLessThan(4096);
    expect(current.y).toBeLessThan(4096);
    expect(state(first).players.has(second.sessionId)).toBe(true);
  }, 12_000);
});
