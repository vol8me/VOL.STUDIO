import { matchMaker } from '@colyseus/core';
import { Client, type Room } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '@volstudio/network/protocol';
import {
  startHost,
  type HostOptions,
  type Logger,
  type StartedHost,
} from '@volstudio/network/server';
import { OnlineSession } from '@/network/OnlineSession';
import { ROOM } from '@/network/rooms';
import { WORLD_SCHEMA, type WorldSnapshot } from '@/network/schema';
import { createRooms, type Rooms } from '../../server/index';
import type { WorldRoom, WorldRoomOptions } from '../../server/WorldRoom';

export type TestServer = StartedHost<Rooms>;

/** Testte odaya geçen işletim seçenekleri: varsayılan olarak botsuz, yalnız insanlı dünya. */
export type TestWorld = Omit<WorldRoomOptions, 'logger' | 'primary'>;

/**
 * Rastgele portta gerçek bir oyun sunucusu başlatır. Odalar `joinOrCreate` ile kurulur ve son insan
 * ayrılınca kapanır; bot gerektiren testler `world.perFaction` verir.
 */
export function startServer(
  logger?: Logger,
  world: TestWorld = { perFaction: 0 },
  host: Omit<HostOptions, 'logger'> = {},
): Promise<TestServer> {
  return startHost(createRooms(logger, world), { port: 0, host: '127.0.0.1' }, { ...host, logger });
}

export interface JoinParams {
  readonly name?: string;
  readonly faction?: unknown;
  readonly protocol?: number;
  /** Seçilen aracın `VEHICLE_IDS` indeksi; sunucu doğrular. Kasıtlı geçersiz değer için `unknown`. */
  readonly model?: unknown;
}

/** Savaş dünyasına katılır (yoksa kurar); `protocol` varsayılan olarak güncel sürümdür. */
export function joinWorld(
  server: Pick<TestServer, 'endpoint'>,
  params: JoinParams = {},
): Promise<Room<WorldSnapshot>> {
  return new Client(server.endpoint).joinOrCreate<WorldSnapshot>(
    ROOM.world,
    { protocol: PROTOCOL_VERSION, ...params },
    WORLD_SCHEMA,
  ) as Promise<Room<WorldSnapshot>>;
}

/** Sunucu içindeki odayı (yetkili örnek) verir; yalnız süreç içi testlerde kullanılır. */
export function serverRoom(room: Room): WorldRoom {
  const local = matchMaker.getLocalRoomById(room.roomId);
  if (!local) throw new Error(`Oda süreç içinde yok: ${room.roomId}`);
  return local as unknown as WorldRoom;
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
export async function joined(room: Room<WorldSnapshot>) {
  await until(() => room.state.players.get(room.sessionId) !== undefined, 'oyuncu kaydı');
  return room.state.players.get(room.sessionId)!;
}

/** Oyunun istemci oturumuyla katılır; otomatik yeniden bağlanma yalnız onu sınayan testte açılır. */
export async function openSession(
  server: TestServer,
  name = 'Pilot',
  faction?: number,
): Promise<OnlineSession> {
  const session = await OnlineSession.open({ endpoint: server.endpoint, name, faction });
  session.room.reconnection.enabled = false;
  return session;
}
