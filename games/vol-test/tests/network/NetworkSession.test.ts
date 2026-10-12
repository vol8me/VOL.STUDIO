import { describe, expect, it, vi } from 'vitest';
import type { NetworkRoom } from '@volstudio/network/client';
import { NetworkSession } from '@/network/NetworkSession';

function room() {
  let listener: (() => void) | undefined;
  const sendInput = vi.fn();
  const dispose = vi.fn(() => Promise.resolve());
  let state: unknown = { tick: 1, players: new Map() };
  const channel: NetworkRoom = {
    sessionId: 'self',
    sendInput,
    onState: vi.fn((callback: () => void) => {
      listener = callback;
      return () => {
        listener = undefined;
      };
    }),
    getState: () => state,
    dispose,
  };
  return {
    channel,
    sendInput,
    dispose,
    emit(next: unknown) {
      state = next;
      listener?.();
    },
    get subscribed() {
      return Boolean(listener);
    },
  };
}

describe('NetworkSession', () => {
  it('odaya katılır, eski patchleri yok sayar, artan seq ile yalnız input gönderir ve leave temizler', async () => {
    const fake = room();
    const statuses: string[] = [];
    const worlds: number[] = [];
    const join = vi.fn(() => Promise.resolve(fake.channel));
    const session = new NetworkSession(
      'http://127.0.0.1:2567',
      (status) => statuses.push(status),
      (world, id) => {
        expect(id).toBe('self');
        worlds.push(world.tick);
      },
      join,
    );
    await session.connect();
    expect(join).toHaveBeenCalledWith('http://127.0.0.1:2567', 'voltest');
    expect(statuses).toEqual(['connecting', 'connected']);
    fake.emit({ tick: 2, players: new Map() });
    fake.emit({ tick: 1, players: new Map() });
    expect(worlds).toEqual([1, 2]);
    session.checkFreshness(3000);
    expect(statuses.at(-1)).toBe('error');
    fake.emit({ tick: 3, players: new Map() });
    expect(statuses.at(-1)).toBe('connected');
    const intent = { moveX: 1, moveY: 0, aimX: 0, aimY: 0, fire: true, boost: false, brake: false };
    session.send(intent);
    session.send(intent);
    expect(fake.sendInput).toHaveBeenNthCalledWith(1, { ...intent, seq: 0 });
    expect(fake.sendInput).toHaveBeenNthCalledWith(2, { ...intent, seq: 1 });
    await session.dispose();
    await session.dispose();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(fake.subscribed).toBe(false);
    fake.emit({ tick: 4, players: new Map() });
    session.send(intent);
    expect(worlds).toEqual([1, 2, 3]);
    expect(fake.sendInput).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)).toBe('left');
  });

  it('hatalı bağlanmayı görünür hata durumu yapar', async () => {
    const statuses: string[] = [];
    const session = new NetworkSession(
      'not-an-endpoint',
      (status) => statuses.push(status),
      vi.fn(),
      () => Promise.reject(new Error('bağlantı yok')),
    );
    await session.connect();
    expect(statuses).toEqual(['connecting', 'error']);
    await session.dispose();
  });

  it('sahne kapanırken geciken join sonucu gelirse odada kalmaz', async () => {
    const fake = room();
    let resolveJoin!: (joined: NetworkRoom) => void;
    const pending = new Promise<NetworkRoom>((resolve) => (resolveJoin = resolve));
    const statuses: string[] = [];
    const session = new NetworkSession(
      'http://127.0.0.1:2567',
      (status) => statuses.push(status),
      vi.fn(),
      () => pending,
    );
    const joining = session.connect();
    await session.dispose();
    resolveJoin(fake.channel);
    await joining;
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(fake.subscribed).toBe(false);
    expect(statuses).toEqual(['connecting', 'left']);
  });
});
