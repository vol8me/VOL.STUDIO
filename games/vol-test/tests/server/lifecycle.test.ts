import { Client } from '@colyseus/sdk';
import type { Room } from '@volstudio/network/client';
import { ImpairedLink } from '@volstudio/network/drive';
import { afterEach, describe, expect, it } from 'vitest';
import { NETWORK } from '@/config/network';
import { WAR } from '@/config/war';
import { EVENT_MESSAGE, type EventBatch, type NetEvent } from '@/network/events';
import { WORLD_SCHEMA, type WorldSnapshot } from '@/network/schema';
import {
  joined,
  joinWorld,
  serverRoom,
  startServer,
  until,
  type JoinParams,
  type TestServer,
} from '../support/netHarness';

/**
 * Oturum yaşam döngüsü matrisi: bağlantının oyuncunun hangi anında koptuğuna göre oyuncu kaydı, olay
 * akışı ve yeniden bağlanma. Gerçek sunucu ve gerçek SDK istemcisi; sessiz ölüm ve ağ değişimi
 * `ImpairedLink` aracısıyla kurulur. Kimlik IP değil yeniden bağlanma belirtecidir: kaynak adres ya
 * da soket değişse de oturum aynı kayda döner.
 */
type Seat = Room<WorldSnapshot>;

let server: TestServer | undefined;
let link: ImpairedLink | undefined;
const seats: Seat[] = [];

afterEach(async () => {
  link?.release();
  await Promise.all(
    seats.splice(0).map((seat) => {
      seat.reconnection.enabled = false;
      return Promise.race([
        seat.leave().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 300)),
      ]);
    }),
  );
  await link?.close();
  link = undefined;
  await server?.stop();
  server = undefined;
});

async function join(params: JoinParams = {}, via: { endpoint: string } = server!): Promise<Seat> {
  const seat = await joinWorld(via, params);
  seat.reconnection.enabled = false;
  seat.onMessage(EVENT_MESSAGE, () => undefined);
  seats.push(seat);
  await joined(seat);
  return seat;
}

const self = (seat: Seat) => seat.state.players.get(seat.sessionId)!;
const vehicleOf = (seat: Seat) => serverRoom(seat).vehicleOf(seat.sessionId)!;

function collect(seat: Seat): NetEvent[] {
  const events: NetEvent[] = [];
  seat.onMessage(EVENT_MESSAGE, (batch: EventBatch) => events.push(...batch.events));
  return events;
}

/** İstemcinin "ağ gitti, yeniden dene" kodu (4010) ile bağlantıyı koparır; SDK geri bağlanır. */
async function dropAndReturn(seat: Seat): Promise<void> {
  seat.reconnection.enabled = true;
  seat.reconnection.minUptime = 0;
  const dropped = new Promise<void>((resolve) => seat.onDrop(() => resolve()));
  const back = new Promise<void>((resolve) => seat.onReconnect(() => resolve()));
  seat.connection.close(4010);
  await dropped;
  await back;
}

/** Bir çift: `killer` cephe 0, `victim` cephe 1; ikisi de korumasız. */
async function pair() {
  server = await startServer();
  const killer = await join({ name: 'Av', faction: 0 });
  const victim = await join({ name: 'Kurban', faction: 1 });
  for (const seat of [killer, victim]) vehicleOf(seat).vitality.protectionRemainingMs = 0;
  return { killer, victim, sim: serverRoom(killer).simulation };
}

describe('oturum yaşam döngüsü: kopma anı', () => {
  it('ölüp yeniden doğmayı beklerken kopan oyuncu ölü kalır, dönünce yine doğar; ölüm bir kez yazılır', async () => {
    const { killer, victim, sim } = await pair();
    sim.applyDamage(self(victim).vehicleId, 1e6, self(killer).vehicleId);
    await until(() => !self(victim).alive, 'ölüm');
    vehicleOf(victim).vitality.respawnRemainingMs = 60_000;
    await dropAndReturn(victim);
    expect(self(victim).alive).toBe(false);
    expect(self(victim).connected).toBe(true);
    expect(self(victim).deaths).toBe(1);
    vehicleOf(victim).vitality.respawnRemainingMs = 5;
    await until(() => self(victim).alive, 'dönüş sonrası yeniden doğma');
    expect(self(victim).deaths).toBe(1);
    expect(self(killer).kills).toBe(1);
  }, 20_000);

  it('doğma korumasındayken kopup dönen oyuncu için ikinci katılım olayı yayılmaz', async () => {
    server = await startServer();
    const watcher = await join({ name: 'Gözcü' });
    const seen = collect(watcher);
    const traveller = await join({ name: 'Yolcu' });
    const vehicleId = self(traveller).vehicleId;
    expect(self(traveller).protectionMs).toBeGreaterThan(0);
    await dropAndReturn(traveller);
    // Olaylar adım adım yayılır: birkaç adım bekleyip toplananı oku.
    const tick = watcher.state.tick;
    await until(() => watcher.state.tick > tick + 3, 'olay yayını');
    const joins = seen.filter((event) => event.kind === 'joined' && event.vehicleId === vehicleId);
    expect(joins).toHaveLength(1);
    expect(seen.some((event) => event.kind === 'left')).toBe(false);
    expect(self(traveller).vehicleId).toBe(vehicleId);
    expect(serverRoom(watcher).playerCount).toBe(2);
  }, 20_000);

  it('savaşı bitiren ölümle aynı anda kopan oyuncu dönünce yeni savaşta kayıtlı kalır', async () => {
    const { killer, victim, sim } = await pair();
    serverRoom(killer).battle.scores[0] = WAR.score.dominance - 1;
    sim.applyDamage(self(victim).vehicleId, 1e6, self(killer).vehicleId);
    await dropAndReturn(victim);
    await until(() => killer.state.factions[0].wins === 1, 'zafer sayacı');
    expect(killer.state.factions[0].score).toBe(0);
    expect(self(victim).connected).toBe(true);
    // Savaş yalnız cephe puanını sıfırlar; oyuncunun ölümü ve öldürmesi kayıtta kalır.
    await until(() => self(victim).deaths === 1, 'kopuk oyuncunun ölüm sayacı');
    expect(self(killer).kills).toBe(1);
    expect(serverRoom(killer).playerCount).toBe(2);
  }, 20_000);

  it('arka arkaya iki kopma aynı kayda döner: oturum, araç ve oyuncu sayısı değişmez', async () => {
    server = await startServer();
    const watcher = await join({ name: 'Gözcü' });
    const seen = collect(watcher);
    const seat = await join({ name: 'Yolcu' });
    const sessionId = seat.sessionId;
    const vehicleId = self(seat).vehicleId;
    await dropAndReturn(seat);
    await dropAndReturn(seat);
    expect(seat.sessionId).toBe(sessionId);
    expect(self(seat).vehicleId).toBe(vehicleId);
    expect(self(seat).connected).toBe(true);
    expect(serverRoom(watcher).playerCount).toBe(2);
    expect(seen.some((event) => event.kind === 'left')).toBe(false);
  }, 30_000);
});

describe('oturum yaşam döngüsü: pencere ve kapanış', () => {
  it('yeniden bağlanma penceresi dolunca oyuncu kalkar ve eski belirteç reddedilir', async () => {
    server = await startServer();
    const watcher = await join({ name: 'Gözcü' });
    const gone = await join({ name: 'Giden' });
    const token = gone.reconnectionToken;
    const mutable = NETWORK as { reconnectSeconds: number };
    const original = mutable.reconnectSeconds;
    mutable.reconnectSeconds = 1;
    try {
      gone.connection.close(4010);
      await until(() => serverRoom(watcher).playerCount === 1, 'pencere dolması', 8000);
    } finally {
      mutable.reconnectSeconds = original;
    }
    await expect(new Client(server.endpoint).reconnect(token, WORLD_SCHEMA)).rejects.toBeDefined();
    await until(() => watcher.state.players.size === 1, 'kaydın istemciden kalkması');
  }, 20_000);

  it('sunucu, bağlı ve kopmuş oyuncularla durdurulunca işlenmemiş söz reddi sızmaz', async () => {
    server = await startServer();
    await join({ name: 'Bağlı' });
    const dropped = await join({ name: 'Kopuk' });
    const room = serverRoom(dropped);
    dropped.connection.close(4010);
    await until(() => room.state.players.get(dropped.sessionId)?.connected === false, 'kopma');
    const leaked: unknown[] = [];
    const watch = (reason: unknown): void => {
      leaked.push(reason);
    };
    process.on('unhandledRejection', watch);
    try {
      await server.stop();
      server = undefined;
      await new Promise((resolve) => setTimeout(resolve, 50));
    } finally {
      process.off('unhandledRejection', watch);
    }
    expect(leaked).toEqual([]);
  });
});

describe('oturum yaşam döngüsü: ağ', () => {
  async function behindLink() {
    // Canlılık yoklaması hızlandırılır: sessiz ölüm ~0,6 sn'de fark edilir (üretimde ~9 sn).
    server = await startServer(undefined, undefined, { pingIntervalMs: 200, pingMaxRetries: 3 });
    link = await ImpairedLink.start({ host: '127.0.0.1', port: server.port });
    const watcher = await join({ name: 'Gözcü' });
    const seat = await join({ name: 'Yolcu' }, link);
    seat.reconnection.enabled = true;
    seat.reconnection.minUptime = 0;
    return { watcher, seat };
  }

  it('sessizce ölen bağlantı (uyuyan telefon) sunucuda kopuk görünür; ağ gelince aynı oturum döner', async () => {
    const { watcher, seat } = await behindLink();
    const sessionId = seat.sessionId;
    const vehicleId = self(seat).vehicleId;
    link!.blackhole();
    await until(
      () => watcher.state.players.get(sessionId)?.connected === false,
      'sessiz ölümün fark edilmesi',
      10_000,
    );
    // Oyuncu pencere içinde: kayıt ve araç yerinde.
    expect(serverRoom(watcher).playerCount).toBe(2);
    const back = new Promise<void>((resolve) => seat.onReconnect(() => resolve()));
    link!.sever();
    link!.release();
    await back;
    await until(() => watcher.state.players.get(sessionId)?.connected === true, 'dönüş');
    expect(seat.sessionId).toBe(sessionId);
    expect(self(seat).vehicleId).toBe(vehicleId);
  }, 30_000);

  it('ağ değişimi (Wi-Fi yerine LTE): yeni soketle aynı oturum sürer; kimlik adres değil belirteçtir', async () => {
    const { watcher, seat } = await behindLink();
    const sessionId = seat.sessionId;
    const before = link!.stats().connections;
    const back = new Promise<void>((resolve) => seat.onReconnect(() => resolve()));
    link!.sever();
    await back;
    await until(() => watcher.state.players.get(sessionId)?.connected === true, 'dönüş');
    expect(link!.stats().connections).toBeGreaterThan(before);
    expect(seat.sessionId).toBe(sessionId);
    expect(serverRoom(watcher).playerCount).toBe(2);
  }, 30_000);
});
