import { defineRoom, matchMaker } from '@colyseus/core';
import { Client, type Room } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '@volstudio/network/protocol';
import { startHost, type Logger, type StartedHost } from '@volstudio/network/server';
import { MATCH, type MatchConfig } from '@/config/network';
import { MatchState, type MatchSnapshot } from '@/network/schema';
import { ROOM } from '@/network/rooms';
import { MatchRoom, PrivateRoom } from '../../server/MatchRoom';
import { createRooms, type Rooms } from '../../server/index';

export type TestServer = StartedHost<Rooms>;

/** Rastgele portta gerçek bir oyun sunucusu başlatır. */
export function startServer(logger?: Logger): Promise<TestServer> {
  return startHost(createRooms(logger), { port: 0, host: '127.0.0.1' }, { logger });
}

/** Hızlı maç kuralları: iki öldürmede biter, ara verme çeyrek saniyedir. */
export const QUICK_RULES: MatchConfig = {
  ...MATCH,
  scoreLimit: { ffa: 2, teams: 2 },
  intermissionMs: 250,
};

class QuickMatchRoom extends MatchRoom {
  protected override readonly config = QUICK_RULES;
}

class QuickPrivateRoom extends PrivateRoom {
  protected override readonly config = QUICK_RULES;
}

/** Kısa maç kurallı sunucu; oda adları ve eşleştirme üretimle aynıdır. */
export function startQuickServer(logger?: Logger): Promise<TestServer> {
  const rooms = {
    [ROOM.match]: defineRoom(QuickMatchRoom, { logger }).filterBy(['mode']),
    [ROOM.private]: defineRoom(QuickPrivateRoom, { logger, claims: new Set<string>() }).filterBy([
      'code',
    ]),
  };
  return startHost(
    rooms,
    { port: 0, host: '127.0.0.1' },
    { logger },
  ) as unknown as Promise<TestServer>;
}

export interface JoinParams {
  readonly name?: string;
  readonly mode?: string;
  readonly code?: string;
  readonly protocol?: number;
}

const SCHEMA = MatchState as unknown as new () => MatchSnapshot;

/** Herkese açık odaya katılır (yoksa kurar); `protocol` varsayılan olarak güncel sürümdür. */
export function joinPublic(
  server: TestServer,
  params: JoinParams = {},
): Promise<Room<MatchSnapshot>> {
  return new Client(server.endpoint).joinOrCreate<MatchSnapshot>(
    ROOM.match,
    { protocol: PROTOCOL_VERSION, ...params },
    SCHEMA,
  ) as Promise<Room<MatchSnapshot>>;
}

/** Özel oda yöntemleri: `create` kurar, `join` yalnız var olana katılır. */
export function privateRoom(
  server: TestServer,
  method: 'create' | 'join',
  params: JoinParams = {},
): Promise<Room<MatchSnapshot>> {
  return new Client(server.endpoint)[method]<MatchSnapshot>(
    ROOM.private,
    { protocol: PROTOCOL_VERSION, ...params },
    SCHEMA,
  ) as Promise<Room<MatchSnapshot>>;
}

/** Sunucu içindeki odayı (yetkili örnek) verir; yalnız süreç içi testlerde kullanılır. */
export function serverRoom(room: Room): MatchRoom {
  const local = matchMaker.getLocalRoomById(room.roomId);
  if (!local) throw new Error(`Oda süreç içinde yok: ${room.roomId}`);
  return local as unknown as MatchRoom;
}

/** Koşul sağlanana dek yoklar; süre dolarsa neyi beklediğini söyleyen hata atar. */
export async function until(
  predicate: () => boolean,
  what: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Zamanında gerçekleşmedi: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Sunucudan ilk tam durum gelip oyuncu kaydı görünene dek bekler. */
export async function joined(room: Room<MatchSnapshot>) {
  await until(() => room.state.players.get(room.sessionId) !== undefined, 'oyuncu kaydı');
  return room.state.players.get(room.sessionId)!;
}
