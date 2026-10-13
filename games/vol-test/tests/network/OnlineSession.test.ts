import { JoinError, type Lobby, type Room } from '@volstudio/network/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NETWORK } from '@/config/network';
import type { EventBatch } from '@/network/events';
import { ROOM } from '@/network/rooms';
import { OnlineSession, type ConnectionStatus, type OnlineRequest } from '@/network/OnlineSession';
import type { MatchSnapshot } from '@/network/schema';
import { openSession, startServer, until, type TestServer } from '../support/netHarness';

let server: TestServer | undefined;
const sessions: OnlineSession[] = [];

afterEach(async () => {
  for (const session of sessions.splice(0)) session.dispose();
  await server?.stop();
  server = undefined;
});

async function open(request: OnlineRequest, name = 'Pilot'): Promise<OnlineSession> {
  server ??= await startServer();
  const session = await openSession(server, request, name);
  sessions.push(session);
  return session;
}

async function failure(pending: Promise<unknown>): Promise<string> {
  try {
    await pending;
  } catch (error) {
    expect(error).toBeInstanceOf(JoinError);
    return (error as JoinError).reason;
  }
  throw new Error('Katılım reddedilmedi.');
}

describe('OnlineSession katılım', () => {
  it('hızlı maça katılır ve kendi kaydını, sunucu eksenini, gecikmeyi hazır verir', async () => {
    const session = await open({ kind: 'quick', mode: 'teams' }, 'Yolcu');
    expect(session.status).toBe('live');
    expect(session.self?.name).toBe('Yolcu');
    expect(session.self?.vehicleId).toBeGreaterThan(0);
    expect(session.code).toBe('');
    expect(session.room.state.mode).toBe('teams');
    await until(() => session.timeline.known, 'sunucu ekseni');
    // Olaylar benzetim saatiyle gelir; eksen dönüşümü SDK sunucu saatine yakın düşmelidir.
    await until(() => session.room.state.timeMs > 200, 'yama akışı');
    const mapped = session.timeline.toServer(session.room.state.timeMs);
    expect(Math.abs(mapped! - session.room.clock.lastServerTime())).toBeLessThan(250);
    // Gösterim anı gerçek sunucu saatinden geridedir ve yama yaşı bir yama aralığını aşmaz.
    const clock = session.room.clock;
    expect(session.displayTimeMs).toBeLessThan(
      clock.serverNow() - NETWORK.interpolationDelayMs + 1,
    );
    expect(session.snapshotAgeMs).toBeGreaterThanOrEqual(0);
    expect(session.snapshotAgeMs).toBeLessThan(NETWORK.patchRateMs * 4);
    expect(session.pingMs).toBeGreaterThanOrEqual(0);
    expect(session.jitterMs).toBeGreaterThanOrEqual(0);
  });

  it('özel oda kurar, kodu büyük-küçük harf ve ayraçtan bağımsız eşler', async () => {
    const host = await open({ kind: 'create', code: 'KMN23' }, 'Ev');
    expect(host.code).toBe('KMN23');
    const guest = await open({ kind: 'join', code: ' km-n23 ' }, 'Konuk');
    expect(guest.code).toBe('KMN23');
    expect(guest.room.roomId).toBe(host.room.roomId);
    await until(() => host.room.state.players.size === 2, 'iki oyuncu');
  });

  it('var olmayan kodla katılım not-found, biçimi bozuk kod code olarak reddedilir', async () => {
    server = await startServer();
    expect(
      await failure(
        OnlineSession.open({
          endpoint: server.endpoint,
          name: 'A',
          request: { kind: 'join', code: 'PQRS3' },
        }),
      ),
    ).toBe('not-found');
    expect(
      await failure(
        OnlineSession.open({
          endpoint: server.endpoint,
          name: 'A',
          request: { kind: 'create', code: '0O1I' },
        }),
      ),
    ).toBe('code');
  });

  it('biçimi bozuk kod eşleştiriciye hiç gitmez', async () => {
    const lobby = { joinOrCreate: vi.fn(), create: vi.fn(), join: vi.fn() };
    const reason = await failure(
      OnlineSession.open({
        endpoint: 'http://127.0.0.1:1',
        name: 'A',
        request: { kind: 'join', code: 'x' },
        lobby: lobby,
      }),
    );
    expect(reason).toBe('code');
    expect(lobby.join).not.toHaveBeenCalled();
  });

  it('ulaşılamayan sunucu unreachable olarak bildirilir', async () => {
    const reason = await failure(
      OnlineSession.open({
        endpoint: 'http://127.0.0.1:1',
        name: 'A',
        request: { kind: 'quick', mode: 'ffa' },
      }),
    );
    expect(reason).toBe('unreachable');
  });
});

describe('OnlineSession olaylar ve durum', () => {
  it('olay paketlerini abonelere dağıtır; abonelik kaldırılınca durur', async () => {
    const first = await open({ kind: 'quick', mode: 'ffa' }, 'Bir');
    const received: EventBatch[] = [];
    const stop = first.onEvents((batch) => received.push(batch));
    await open({ kind: 'quick', mode: 'ffa' }, 'İki');
    await until(
      () => received.some((batch) => batch.events.some((event) => event.kind === 'joined')),
      'katılma olayı',
    );
    stop();
    const count = received.length;
    await open({ kind: 'quick', mode: 'ffa' }, 'Üç');
    await until(() => first.room.state.players.size === 3, 'üçüncü oyuncu');
    expect(received).toHaveLength(count);
  });

  it('leave kapanışı bildirir ve ikinci leave bekletmez', async () => {
    const session = await open({ kind: 'quick', mode: 'ffa' });
    const seen: ConnectionStatus[] = [];
    session.onStatus((status) => seen.push(status));
    await session.leave();
    expect(session.status).toBe('closed');
    expect(session.closeCode).toBeDefined();
    expect(seen).toEqual(['closed']);
    await session.leave();
  });

  it('kopan bağlantı reconnecting olur, geri gelince live olur ve kayıt korunur', async () => {
    const session = await open({ kind: 'quick', mode: 'ffa' });
    const record = session.self;
    const seen: ConnectionStatus[] = [];
    session.onStatus((status) => seen.push(status));
    session.room.reconnection.enabled = true;
    session.room.reconnection.minUptime = 0;
    // 4010: istemcinin "ağ gitti, yeniden dene" kapanış kodu.
    session.room.connection.close(4010);
    await until(() => seen.length >= 2, 'kopma ve dönüş');
    expect(seen.slice(0, 2)).toEqual(['reconnecting', 'live']);
    expect(session.status).toBe('live');
    expect(session.self).toBe(record);
  });

  it('dispose dinleyicileri bırakır ve odadan ayrılır', async () => {
    const session = await open({ kind: 'quick', mode: 'ffa' });
    const listener = vi.fn();
    session.onEvents(listener);
    session.onStatus(listener);
    session.dispose();
    expect(session.status).toBe('closed');
    await until(() => !session.room.connection.isOpen, 'bağlantı kapanışı');
    expect(listener).not.toHaveBeenCalled();
  });
});

type FakeSignal<A extends unknown[]> = ((cb: (...args: A) => void) => void) & {
  remove(cb: (...args: A) => void): void;
  invoke(...args: A): void;
};

function fakeSignal<A extends unknown[]>(): FakeSignal<A> {
  const handlers = new Set<(...args: A) => void>();
  const signal = ((cb: (...args: A) => void) => {
    handlers.add(cb);
  }) as FakeSignal<A>;
  signal.remove = (cb) => {
    handlers.delete(cb);
  };
  signal.invoke = (...args) => {
    for (const handler of [...handlers]) handler(...args);
  };
  return signal;
}

/** Oyuncu kaydı hiç görünmeyen, kapanışı denetlenebilir sahte oda. */
function emptyRoom() {
  const room = {
    sessionId: 'ben',
    state: { players: new Map<string, unknown>() },
    onStateChange: fakeSignal<[unknown]>(),
    onLeave: fakeSignal<[number]>(),
    leave: vi.fn(() => Promise.resolve(1000)),
  };
  const lobby = {
    joinOrCreate: vi.fn(() => Promise.resolve(room)),
  } as unknown as Lobby;
  return { room: room as unknown as Room<MatchSnapshot>, raw: room, lobby };
}

describe('OnlineSession yerleşme', () => {
  it('kayıt gelmezse süre dolunca failed olur ve odadan çıkar', async () => {
    const { raw, lobby } = emptyRoom();
    const reason = await failure(
      OnlineSession.open({
        endpoint: 'http://127.0.0.1:1',
        name: 'A',
        request: { kind: 'quick', mode: 'ffa' },
        lobby,
        settleTimeoutMs: 20,
      }),
    );
    expect(reason).toBe('failed');
    expect(raw.leave).toHaveBeenCalled();
  });

  it('seçilen aracın model indeksini katılım seçeneğinde taşır; verilmezse ilk araçtır', async () => {
    const { lobby } = emptyRoom();
    const join = (model?: number) =>
      failure(
        OnlineSession.open({
          endpoint: 'http://127.0.0.1:1',
          name: 'A',
          request: { kind: 'quick', mode: 'ffa' },
          ...(model === undefined ? {} : { model }),
          lobby,
          settleTimeoutMs: 5,
        }),
      );
    await join(2);
    await join();
    expect(lobby.joinOrCreate).toHaveBeenNthCalledWith(
      1,
      ROOM.match,
      { name: 'A', model: 2, mode: 'ffa' },
      expect.anything(),
    );
    expect(lobby.joinOrCreate).toHaveBeenNthCalledWith(
      2,
      ROOM.match,
      { name: 'A', model: 0, mode: 'ffa' },
      expect.anything(),
    );
  });

  it('oda yerleşmeden kapanırsa failed olur', async () => {
    const { raw, lobby } = emptyRoom();
    const pending = OnlineSession.open({
      endpoint: 'http://127.0.0.1:1',
      name: 'A',
      request: { kind: 'quick', mode: 'ffa' },
      lobby,
      settleTimeoutMs: 5000,
    });
    await vi.waitFor(() => expect(lobby.joinOrCreate).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    raw.onLeave.invoke(1006);
    expect(await failure(pending)).toBe('failed');
  });
});
