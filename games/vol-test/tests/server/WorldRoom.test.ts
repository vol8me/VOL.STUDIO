import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { Predict, classifyJoinError, type JoinFailure, type Room } from '@volstudio/network/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NETWORK } from '@/config/network';
import { TANK } from '@/config/tank';
import { STRIKER, VEHICLE_IDS, VEHICLES, modelOf } from '@/config/vehicles';
import { WAR } from '@/config/war';
import { WORLD } from '@/config/world';
import { EVENT_MESSAGE, type EventBatch, type NetEvent } from '@/network/events';
import { PredictedPilot } from '@/network/PredictedPilot';
import { ROOM } from '@/network/rooms';
import type { WorldSnapshot, TankInputData } from '@/network/schema';
import { WORLD_SCHEMA } from '@/network/schema';
import { World } from '@/sim/world/World';
import { createPrimaryWorld } from '../../server/index';
import { commandAt } from '../support/commands';
import {
  joined,
  joinWorld,
  serverRoom,
  startServer,
  until,
  type JoinParams,
  type TestServer,
  type TestWorld,
} from '../support/netHarness';

type Seat = Room<WorldSnapshot>;

let server: TestServer | undefined;
const seats: Seat[] = [];

afterEach(async () => {
  // Kapanış beklemesi sınırlıdır: sunucu tarafından zaten kapatılmış bir oda `leave`i beklemez.
  await Promise.all(
    seats
      .splice(0)
      .map((seat) =>
        Promise.race([
          seat.leave().catch(() => undefined),
          new Promise((resolve) => setTimeout(resolve, 300)),
        ]),
      ),
  );
  await server?.stop();
  server = undefined;
});

/** Testin odalarını izler; otomatik yeniden bağlanma yalnız onu sınayan testte açılır. */
async function track(pending: Promise<Seat>): Promise<Seat> {
  const seat = await pending;
  seat.reconnection.enabled = false;
  // Olay yayını için kayıtlı işleyici yoksa SDK her iletide uyarı yazar; toplayan testler ekler.
  seat.onMessage(EVENT_MESSAGE, () => undefined);
  seats.push(seat);
  await joined(seat);
  return seat;
}

const boot = async (world?: TestWorld) => (server = await startServer(undefined, world));
const join = (params: JoinParams = {}) => track(joinWorld(server!, params));

/** Katılım hatasının oyunun göreceği nedeni. */
async function failure(pending: Promise<unknown>): Promise<JoinFailure> {
  try {
    await pending;
  } catch (error) {
    return classifyJoinError(error);
  }
  throw new Error('Katılım reddedilmedi.');
}

/** Sunucunun yayınladığı olayları sırayla toplar. */
function collect(seat: Seat): NetEvent[] {
  const events: NetEvent[] = [];
  seat.onMessage(EVENT_MESSAGE, (batch: EventBatch) => events.push(...batch.events));
  return events;
}

const self = (seat: Seat) => seat.state.players.get(seat.sessionId)!;
const vehicleOf = (seat: Seat) => serverRoom(seat).vehicleOf(seat.sessionId)!;

/** Doğma korumasını kaldırır: hasar testleri koruma süresini beklemesin. */
function exposed(...group: Seat[]): void {
  for (const seat of group) vehicleOf(seat).vitality.protectionRemainingMs = 0;
}

describe('WorldRoom katılım', () => {
  it('ağ seçenekleri işletim ayarlarını ve kalıcılığı ele geçiremez', async () => {
    await boot();
    const seat = await track(
      new Client(server!.endpoint).create<WorldSnapshot>(
        ROOM.world,
        {
          protocol: 2,
          primary: true,
          seed: 999,
          perFaction: 100000,
          climateStore: { load: 'bozuk' },
          logger: { child: 'bozuk' },
          internal: { primary: true },
        },
        WORLD_SCHEMA,
      ) as Promise<Seat>,
    );
    const local = serverRoom(seat);
    expect(local.autoDispose).toBe(true);
    expect(local.battle.combatants.size).toBe(1);
    await seat.leave();
    await until(() => !matchMaker.getLocalRoomById(seat.roomId), 'oda kapanışı');
  });

  it('geçersiz katılım oda kurulmadan reddedilir', async () => {
    const load = vi.fn(() => undefined);
    await boot({ perFaction: 0, climateStore: { load, save: () => true } });
    expect(await failure(join({ protocol: -1 }))).toBe('protocol');
    expect(load).not.toHaveBeenCalled();
  });

  it('oyuncu kaydı adı, aracı, cephesi ve sağlığıyla görünür; dünya durumu cephe ve bölge taşır', async () => {
    await boot();
    const seat = await join({ name: 'Ada' });
    const player = self(seat);
    expect(player.name).toBe('Ada');
    expect(player.vehicleId).toBeGreaterThan(0);
    expect(player.alive).toBe(true);
    expect(player.connected).toBe(true);
    expect(player.bot).toBe(false);
    expect(player.team).toBeGreaterThanOrEqual(0);
    expect(player.team).toBeLessThan(WAR.factions);
    expect(seat.state.factions.length).toBe(WAR.factions);
    expect(seat.state.zones.length).toBe(WAR.zones.length);
    await until(() => seat.state.tick > 5, 'sunucu adımları');
    expect(Number.isFinite(seat.state.timeMs)).toBe(true);
  });

  it('araç seçilmezse Striker, seçilirse o araç doğar: tanım, can ve model kaydı eşleşir', async () => {
    await boot();
    const plain = await join({ name: 'Ada' });
    expect(self(plain).model).toBe(modelOf(STRIKER));
    expect(vehicleOf(plain).spec).toBe(STRIKER);
    for (const spec of Object.values(VEHICLES)) {
      const seat = await join({ model: modelOf(spec) });
      expect(self(seat).model).toBe(modelOf(spec));
      expect(vehicleOf(seat).spec).toBe(spec);
      expect(self(seat).health).toBe(spec.health);
    }
  });

  it('tanımsız ya da tamsayı olmayan araç indeksi protokol ihlali olarak reddedilir', async () => {
    await boot();
    for (const model of [VEHICLE_IDS.length, -1, 1.5, '1', null, Number.NaN]) {
      expect(await failure(join({ model })), String(model)).toBe('protocol');
    }
    expect(serverRoomCount()).toBe(0);
  });

  it('tanımsız, aralık dışı ya da tamsayı olmayan cephe protokol ihlali olarak reddedilir', async () => {
    await boot();
    for (const faction of [WAR.factions, -1, 0.5, '0', null, Number.NaN]) {
      expect(await failure(join({ faction })), String(faction)).toBe('protocol');
    }
    expect(serverRoomCount()).toBe(0);
  });

  it('yeni gelen araç doğma korumasıyla başlar', async () => {
    await boot();
    const seat = await join();
    expect(vehicleOf(seat).vitality.protectionRemainingMs).toBeGreaterThan(0);
    expect(self(seat).protectionMs).toBeGreaterThan(0);
  });

  it('ad vermeyen oyuncuya araç numaralı ad atanır', async () => {
    await boot();
    const seat = await join();
    expect(self(seat).name).toBe(`${NETWORK.fallbackName} ${self(seat).vehicleId}`);
  });

  it('aynı ad çakışınca büyük küçük harf gözetmeden numara eklenir', async () => {
    await boot();
    const first = await join({ name: 'Ada' });
    const second = await join({ name: 'Ada' });
    const third = await join({ name: 'ada' });
    expect([self(first).name, self(second).name, self(third).name]).toEqual([
      'Ada',
      'Ada 2',
      'ada 3',
    ]);
  });

  it('görünmez ve yön değiştiren karakterler addan temizlenir', async () => {
    await boot();
    const seat = await join({ name: '  Ada‮​  Bey ' });
    expect(self(seat).name).toBe('Ada Bey');
  });

  it('protokol sürümü uyuşmayan ya da yollanmayan katılım reddedilir', async () => {
    await boot();
    const client = new Client(server!.endpoint);
    expect(await failure(client.joinOrCreate(ROOM.world, { protocol: 1 }))).toBe('protocol');
    expect(await failure(client.joinOrCreate(ROOM.world, {}))).toBe('protocol');
    expect(serverRoomCount()).toBe(0);
  });

  it('oyuncular aynı dünyaya düşer ve birbirini görür', async () => {
    await boot();
    const a = await join({ name: 'Bir' });
    const b = await join({ name: 'İki' });
    expect(b.roomId).toBe(a.roomId);
    await until(() => a.state.players.size === 2, 'iki oyuncunun görünmesi');
  });

  it('dünya dolunca bir sonraki oyuncu taşma dünyasına düşer', async () => {
    await boot();
    const first: Seat[] = [];
    for (let index = 0; index < NETWORK.maxPlayers; index++) first.push(await join());
    expect(new Set(first.map((seat) => seat.roomId)).size).toBe(1);
    const overflow = await join();
    expect(overflow.roomId).not.toBe(first[0].roomId);
    expect(serverRoom(first[0]).playerCount).toBe(NETWORK.maxPlayers);
    expect(overflow.state.players.size).toBe(1);
  });
});

describe('WorldRoom cepheler', () => {
  it('istenen cepheyi dengeyi bozmuyorsa verir ve araç cepheyi taşır', async () => {
    await boot();
    const blue = await join({ faction: 1 });
    expect(self(blue).team).toBe(1);
    expect(vehicleOf(blue).team).toBe(1);
    const amber = await join({ faction: 0 });
    expect(self(amber).team).toBe(0);
  });

  it('cephe istemeyen oyuncuları dengeler ve çıkan yerine dengeyi korur', async () => {
    await boot();
    const group: Seat[] = [];
    for (let index = 0; index < 4; index++) group.push(await join());
    const teams = group.map((seat) => self(seat).team);
    expect(teams.filter((team) => team === 0)).toHaveLength(2);
    expect(teams.filter((team) => team === 1)).toHaveLength(2);
    for (const seat of group) expect(vehicleOf(seat).team).toBe(self(seat).team);

    const left = self(group[1]).team;
    await group[1].leave();
    await until(() => group[0].state.players.size === 3, 'oyuncu çıkışı');
    const next = await join();
    expect(self(next).team).toBe(left);
  });

  it('kalabalık cepheyi isteyen oyuncu dengesiz cepheye alınmaz', async () => {
    await boot();
    for (let index = 0; index < 3; index++) await join({ faction: 0 });
    const late = await join({ faction: 0 });
    expect(self(late).team).toBe(1);
  });
});

describe('WorldRoom botlar ve kalıcılık', () => {
  it('başlatılamayan odalar süreçte kapasite sızdırmaz', async () => {
    const load = vi.fn<() => undefined>(() => {
      throw new Error('depo açılamadı');
    });
    await boot({ perFaction: 0, climateStore: { load, save: () => true } });
    const client = new Client(server!.endpoint);
    for (let index = 0; index <= NETWORK.maxRooms; index++)
      expect(
        await failure(client.create<WorldSnapshot>(ROOM.world, { protocol: 2 }, WORLD_SCHEMA)),
      ).not.toBe('busy');
    load.mockReturnValue(undefined);
    const admitted = await track(
      client.create<WorldSnapshot>(ROOM.world, { protocol: 2 }, WORLD_SCHEMA) as Promise<Seat>,
    );
    expect(admitted.state.players.size).toBe(1);
  });

  it('HTTP oda kurma istekleri birincil dahil süreç kapasitesini aşamaz, kapanış yer açar', async () => {
    await boot();
    await createPrimaryWorld({ perFaction: 0 });
    const client = new Client(server!.endpoint);
    for (let index = 1; index < NETWORK.maxRooms; index++)
      await track(
        client.create<WorldSnapshot>(ROOM.world, { protocol: 2 }, WORLD_SCHEMA) as Promise<Seat>,
      );
    expect(
      await failure(client.create<WorldSnapshot>(ROOM.world, { protocol: 2 }, WORLD_SCHEMA)),
    ).toBe('busy');
    expect(serverRoomCount()).toBe(NETWORK.maxRooms);
    const freed = seats.at(-1)!;
    await freed.leave();
    await until(() => !matchMaker.getLocalRoomById(freed.roomId), 'boşalan oda');
    const admitted = await track(
      client.create<WorldSnapshot>(ROOM.world, { protocol: 2 }, WORLD_SCHEMA) as Promise<Seat>,
    );
    expect(admitted.roomId).not.toBe(freed.roomId);
  });

  it('her cephe hedef sayıya botla tamamlanır; insan girince fazla bot çıkar', async () => {
    await boot({ perFaction: 3 });
    const seat = await join({ name: 'Ada', faction: 0 });
    await until(() => seat.state.players.size === 2 * 3, 'cephe başına üç araç', 8000);
    const players = [...seat.state.players.values()];
    expect(players.filter((player) => player.bot)).toHaveLength(5);
    expect(players.filter((player) => player.team === 0)).toHaveLength(3);
    expect(players.filter((player) => player.team === 1)).toHaveLength(3);
    const front = seat.state.factions;
    await until(() => front[0].vehicles === 3 && front[1].vehicles === 3, 'cephe sayaçları');
    expect(front[0].humans).toBe(1);
    expect(front[1].humans).toBe(0);
  });

  it('botlar kendi başına sürer: insan yokken de dünya akar ve botlar hareket eder', async () => {
    await boot({ perFaction: 2 });
    const seat = await join({ name: 'Gözcü' });
    await until(() => seat.state.players.size === 4, 'botların kaydı', 8000);
    const bot = [...seat.state.players.values()].find((player) => player.bot)!;
    const start = { x: bot.x, y: bot.y };
    await until(() => Math.hypot(bot.x - start.x, bot.y - start.y) > 40, 'botun yürüyüşü', 15000);
  }, 20000);

  it('birincil dünya son insan ayrılsa da kapanmaz ve adım atmaya devam eder', async () => {
    await boot();
    const room = await createPrimaryWorld({ perFaction: 0 });
    const seat = await join({ name: 'Geçici' });
    expect(seat.roomId).toBe(room.roomId);
    const id = seat.roomId;
    await seat.leave();
    await until(() => serverRoom(seat).playerCount === 0, 'oyuncu çıkışı');
    const local = matchMaker.getLocalRoomById(id);
    const before = (local.state as { tick: number }).tick;
    await until(() => (local.state as { tick: number }).tick > before + 10, 'dünyanın akması');
    expect(matchMaker.getLocalRoomById(id)).toBeDefined();
  });

  it('taşma dünyası son insan ayrılınca kapanır', async () => {
    await boot();
    const seat = await join();
    const id = seat.roomId;
    await seat.leave();
    await until(() => matchMaker.getLocalRoomById(id) === undefined, 'oda kapanışı');
  });
});

describe('WorldRoom girdi yetkisi', () => {
  it('kopuk oyuncunun tampon girdisi tüketilmez ve tutulan niyet sıfırlanır', async () => {
    await boot();
    const seat = await join();
    const local = serverRoom(seat);
    const client = local.clients.find((entry) => entry.sessionId === seat.sessionId)!;
    const input = seat.input<TankInputData>();
    for (let index = 0; index < 8; index++) {
      input.data.fire = true;
      input.data.moveY = -1;
      input.send();
    }
    await until(() => local.inputs.get(seat.sessionId).size > 0, 'tampon girdi');
    // Kopma geri çağrısı ile bir sonraki adım arasındaki aralığı deterministik kurar.
    vi.spyOn(local, 'allowReconnection').mockReturnValue(Promise.resolve(client) as never);
    local.onDrop(client);
    const tick = local.state.tick;
    await until(() => local.state.tick > tick + 3, 'kopuk adımlar');
    expect(local.inputStats(seat.sessionId)?.consumed).toBe(0);
    expect(local.state.players.get(seat.sessionId)?.connected).toBe(false);
  });

  it('girdiye göre ilerler: sunucu aracı sürer, durum istemciye yansır', async () => {
    await boot();
    const seat = await join();
    const start = { x: self(seat).x, y: self(seat).y };
    const input = seat.input<TankInputData>();
    const timer = setInterval(() => {
      input.data.moveY = -1;
      input.send();
    }, 16);
    try {
      await until(() => Math.hypot(self(seat).x - start.x, self(seat).y - start.y) > 20, 'hareket');
    } finally {
      clearInterval(timer);
    }
    const vehicle = vehicleOf(seat);
    expect(vehicle.chassis.x).toBeCloseTo(self(seat).x, -1);
  });

  it('bozuk ve aşırı girdi aracı hızlandırmaz ve durumu bozmaz', async () => {
    await boot();
    const seat = await join();
    const input = seat.input<TankInputData>();
    const hostile = [Number.NaN, Number.POSITIVE_INFINITY, 1e30, -1e30];
    let turn = 0;
    const timer = setInterval(() => {
      const value = hostile[turn++ % hostile.length];
      input.data.moveX = value;
      input.data.moveY = value;
      input.data.aimX = value;
      input.data.aimY = value;
      input.send();
    }, 8);
    let top = 0;
    const watch = setInterval(() => {
      const vehicle = vehicleOf(seat);
      top = Math.max(top, Math.hypot(vehicle.chassis.vx, vehicle.chassis.vy));
    }, 8);
    try {
      await until(
        () => serverRoom(seat).inputStats(seat.sessionId)!.consumed > 90,
        'girdi tüketimi',
      );
    } finally {
      clearInterval(timer);
      clearInterval(watch);
    }
    const state = self(seat);
    for (const value of [state.x, state.y, state.vx, state.vy, state.hull, state.turret]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(top).toBeLessThanOrEqual(TANK.maxSpeed * 1.01);
    expect(state.x).toBeGreaterThanOrEqual(0);
    expect(state.x).toBeLessThanOrEqual(WORLD.width);
    expect(state.y).toBeGreaterThanOrEqual(0);
    expect(state.y).toBeLessThanOrEqual(WORLD.height);
  });

  it('ateş girdisi sunucuda mermi doğurur ve olayı dünyaya yayar', async () => {
    await boot();
    const shooter = await join({ name: 'Nişancı' });
    const watcher = await join({ name: 'Gözcü' });
    const seen = collect(watcher);
    const input = shooter.input<TankInputData>();
    const timer = setInterval(() => {
      input.data.aimY = -1;
      input.data.fire = true;
      input.send();
    }, 16);
    try {
      await until(() => seen.some((event) => event.kind === 'fired'), 'ateş olayı');
    } finally {
      clearInterval(timer);
    }
    const fired = seen.find((event) => event.kind === 'fired');
    expect(fired).toMatchObject({ kind: 'fired', source: self(shooter).vehicleId });
    expect(serverRoom(shooter).simulation.projectiles.count).toBeGreaterThan(0);
  });

  it('mesaj sınırını aşan istemci düşürülür', async () => {
    await boot();
    const seat = await join();
    const left = new Promise<number>((resolve) => seat.onLeave((code) => resolve(code)));
    for (let index = 0; index < NETWORK.maxMessagesPerSecond * 3; index++)
      seat.send('flood', index);
    expect(await left).toBeGreaterThan(0);
  });
});

describe('WorldRoom trafik ve yavaş tüketici', () => {
  afterEach(() => vi.restoreAllMocks());

  it('trafik özeti istemci sayısını ve gönderilen baytı verir', async () => {
    await boot();
    const seat = await join();
    await until(() => serverRoom(seat).trafficSummary().sentBytes > 0, 'gönderilen bayt');
    const traffic = serverRoom(seat).trafficSummary();
    expect(traffic).toMatchObject({ clients: 1, evictions: 0 });
    expect(traffic.receivedBytes).toBeGreaterThan(0);
    expect(traffic.bufferedBytes).toBeGreaterThanOrEqual(0);
  });

  it('yazma kuyruğu sınırı tolerans boyunca aşan istemci 1013 koduyla atılır, sağlıklı kalır', async () => {
    await boot();
    const slow = await join({ name: 'Yavas' });
    const fine = await join({ name: 'Saglam' });
    const room = serverRoom(slow);
    const wire = [...room.clients].find((client) => client.sessionId === slow.sessionId)!;
    Object.defineProperty(wire.ref, 'bufferedAmount', {
      value: NETWORK.slowConsumer.limitBytes * 4,
    });
    const left = new Promise<number>((resolve) => slow.onLeave((code) => resolve(code)));
    // İlk tarama sayacı başlatır; saat tolerans kadar ileri alınınca sonraki tarama atar.
    await new Promise((resolve) => setTimeout(resolve, NETWORK.slowConsumer.sweepMs + 200));
    expect(room.trafficSummary().evictions).toBe(0);
    const now = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(now + NETWORK.slowConsumer.graceMs + 1000);
    expect(await left).toBe(1013);
    expect(room.trafficSummary().evictions).toBe(1);
    expect(fine.connection.isOpen).toBe(true);
  });
});

describe('WorldRoom skor ve savaş', () => {
  async function pair() {
    await boot();
    const killer = await join({ name: 'Av', faction: 0 });
    const victim = await join({ name: 'Kurban', faction: 1 });
    exposed(killer, victim);
    return { killer, victim, sim: serverRoom(killer).simulation };
  }

  it('öldürme öldürene, ölüm ölene yazılır ve olay yayılır', async () => {
    const { killer, victim, sim } = await pair();
    const seen = collect(killer);
    sim.applyDamage(self(victim).vehicleId, 1e6, self(killer).vehicleId);
    await until(() => self(killer).kills === 1 && self(victim).deaths === 1, 'skor');
    expect(self(victim).alive).toBe(false);
    expect(self(killer).deaths).toBe(0);
    await until(() => seen.some((event) => event.kind === 'died'), 'ölüm olayı');
    expect(seen.find((event) => event.kind === 'died')).toMatchObject({
      target: self(victim).vehicleId,
      source: self(killer).vehicleId,
    });
    await until(() => killer.state.factions[0].score === WAR.score.perKill, 'cephe puanı');
  });

  it('kaynaksız ölüm yalnız ölüm yazar; aynı cephenin ateşi hasar vermez', async () => {
    const { killer, victim, sim } = await pair();
    // Aynı cepheden kaynak dost ateştir (kendi kendine dahil): araç hasar almaz.
    expect(sim.applyDamage(self(killer).vehicleId, 1e6, self(killer).vehicleId)).toBe(0);
    sim.applyDamage(self(victim).vehicleId, 1e6);
    await until(() => self(victim).deaths === 1, 'ölüm');
    expect(self(killer).deaths).toBe(0);
    expect(self(killer).kills).toBe(0);
    expect(self(victim).kills).toBe(0);
  });

  it('ölen araç doğma süresi dolunca korumayla, kendi üssünde yeniden doğar', async () => {
    const { killer, victim, sim } = await pair();
    const base = serverRoom(victim).battle.base(self(victim).team);
    sim.applyDamage(self(victim).vehicleId, 1e6, self(killer).vehicleId);
    await until(() => !self(victim).alive, 'ölüm');
    vehicleOf(victim).vitality.respawnRemainingMs = 5;
    await until(() => self(victim).alive, 'yeniden doğma');
    const reborn = self(victim);
    expect(reborn.health).toBeGreaterThan(0);
    expect(reborn.protectionMs).toBeGreaterThan(0);
    expect(Math.hypot(reborn.x - base.x, reborn.y - base.y)).toBeLessThan(1200);
    expect(Math.hypot(reborn.x - self(killer).x, reborn.y - self(killer).y)).toBeGreaterThan(200);
  });

  it('çemberdeki araç bölgeyi ele geçirir: durum ve olay yayılır', async () => {
    const { killer } = await pair();
    const seen = collect(killer);
    const battle = serverRoom(killer).battle;
    const zone = battle.zones.zones[0];
    // Tam ele geçirmeye bir adım kala: araç çembere ışınlanır, kalan süre beklenmez.
    zone.progress = 0.999;
    const vehicle = vehicleOf(killer);
    vehicle.chassis.x = zone.x;
    vehicle.chassis.y = zone.y;
    await until(() => killer.state.zones[0].owner === 0, 'bölgenin el değiştirmesi');
    await until(
      () => seen.some((event) => event.kind === 'zone' && event.zone === 0 && event.owner === 0),
      'bölge olayı',
    );
    expect(killer.state.factions[0].zones).toBe(1);
    expect(killer.state.zones[0].presentFirst).toBeGreaterThanOrEqual(1);
  });

  it('hâkimiyet puanına ulaşan cephe savaşı kazanır; savaş aynı dünyada yeniden başlar', async () => {
    const { killer, victim, sim } = await pair();
    const seen = collect(victim);
    const battle = serverRoom(killer).battle;
    battle.scores[0] = WAR.score.dominance - 1;
    sim.applyDamage(self(victim).vehicleId, 1e6, self(killer).vehicleId);
    await until(() => killer.state.factions[0].wins === 1, 'zafer sayacı');
    expect(killer.state.factions[0].score).toBe(0);
    await until(
      () => seen.some((event) => event.kind === 'warWon' && event.faction === 0),
      'zafer olayı',
    );
    // Savaş sürer: oyuncular çıkarılmaz, kayıtlar kalır.
    expect(killer.state.players.get(killer.sessionId)).toBeDefined();
    expect(self(killer).connected).toBe(true);
  });
});

describe('WorldRoom ayrılma ve bağlantı kopması', () => {
  it('çıkan oyuncunun kaydı ve aracı kalkar, diğerleri görür', async () => {
    await boot();
    const stays = await join({ name: 'Kalan' });
    const goes = await join({ name: 'Giden' });
    const seen = collect(stays);
    const goneId = self(goes).vehicleId;
    await goes.leave();
    await until(() => stays.state.players.size === 1, 'kayıt temizliği');
    expect(serverRoom(stays).vehicleOf(goes.sessionId)).toBeUndefined();
    expect(serverRoom(stays).simulation.vehicle(goneId)).toBeUndefined();
    await until(
      () => seen.some((event) => event.kind === 'left' && event.vehicleId === goneId),
      'çıkış olayı',
    );
  });

  it('sunucu bağlı oyuncuyla durdurulunca işlenmemiş söz reddi sızmaz', async () => {
    await boot();
    await join({ name: 'Son' });
    const leaked: unknown[] = [];
    const watch = (reason: unknown): void => {
      leaked.push(reason);
    };
    process.on('unhandledRejection', watch);
    try {
      await server!.stop();
      server = undefined;
      // Reddedilen söz ancak mikro görev ve zamanlayıcı turundan sonra işlenmemiş sayılır.
      await new Promise((resolve) => setTimeout(resolve, 50));
    } finally {
      process.off('unhandledRejection', watch);
    }
    expect(leaked).toEqual([]);
  });

  it('kopan bağlantı bekletilir; geri gelince aynı kayıtla öngörü ve tüketim sürer', async () => {
    await boot();
    const seat = await join({ name: 'Yolcu' });
    const sessionId = seat.sessionId;
    const record = self(seat);
    const vehicleId = record.vehicleId;
    const local = serverRoom(seat);
    const run = drive(seat);
    const settled = (): boolean => {
      const tail = run.corrections.slice(-6);
      return tail.length === 6 && tail.every((magnitude) => magnitude < 1e-3);
    };
    try {
      await until(() => local.inputStats(sessionId)!.consumed > 20, 'kopma öncesi girdi');
      seat.reconnection.enabled = true;
      seat.reconnection.minUptime = 0;
      const dropped = new Promise<void>((resolve) => seat.onDrop(() => resolve()));
      // 4010: istemcinin "ağ gitti, yeniden dene" kapanış kodu.
      seat.connection.close(4010);
      await dropped;
      await until(() => local.state.players.get(sessionId)?.connected === false, 'kopma işareti');
      expect(local.playerCount).toBe(1);
      await until(() => local.state.players.get(sessionId)?.connected === true, 'yeniden bağlanma');
      // Yeni pacer sıfırdan sayar: tüketim yeniden artmalı.
      await until(() => local.inputStats(sessionId)!.consumed > 25, 'kopma sonrası girdi');
      // Kopmanın yarattığı sıçrama ve yük altındaki aç kalma düzeltmeleri söner: öngörü yeniden
      // sunucuyla bit bit uyuşan altı ardışık uzlaştırmaya oturur. Süre, yüklü makinede aç kalma
      // aralarındaki sakin pencereyi bulmaya yeter.
      run.corrections.length = 0;
      await until(settled, 'kopma sonrası uzlaştırmanın oturması', 12000);
    } finally {
      run.stop();
    }
    expect(local.state.players.get(sessionId)?.vehicleId).toBe(vehicleId);
    expect(seat.sessionId).toBe(sessionId);
    // İstemci aynı kayıt nesnesini izlemeye devam eder: öngörü ölü bir nesneye bağlanmadı.
    expect(seat.state.players.get(sessionId)).toBe(record);
    run.pilot.dispose();
  }, 20000);
});

describe('WorldRoom öngörü', () => {
  it('sunucu girdisi geç kalmadıkça istemci öngörüsü sunucuyla bit bit uyuşur', async () => {
    await boot();
    const seat = await join({ name: 'Pilot' });
    const run = drive(seat);
    const serverFired: NetEvent[] = [];
    seat.onMessage(EVENT_MESSAGE, (batch: EventBatch) =>
      serverFired.push(...batch.events.filter((event) => event.kind === 'fired')),
    );
    let starved = 0;
    let corrections: number[] = [];
    try {
      // Tüketim başlamadan önceki adımlar hep boştadır (pacer hazırlığı) ve ilk düzeltmeleri doğurur;
      // yüklü makinede bu hazırlık uzar. Bit eşitliği yalnız tüketim oturduktan sonra sınanır.
      await until(
        () => serverRoom(seat).inputStats(seat.sessionId)!.consumed > 20,
        'girdi tüketiminin başlaması',
        8000,
      );
      run.corrections.length = 0;
      await until(() => run.corrections.length > 15, 'uzlaştırmalar', 4000);
      corrections = run.corrections.slice();
    } finally {
      run.stop();
    }
    // Aç kalma sayısı düzeltmeler kopyalandıktan SONRA okunur: aradaki aç kalma düzeltmeyi gevşek
    // sayar; önce okunsa araya giren aç kalma sıfır sanılır ve gerçek bir sapma hata görünürdü.
    starved = serverRoom(seat).inputStats(seat.sessionId)!.starved;

    // Öngörü ile sunucu arasındaki tek sapma kaynağı, sunucunun istemcinin yollamadığı bir adım
    // atmasıdır (girdi geç kalınca boşta adım). Geç kalma yoksa tek bir düzeltme bile olamaz;
    // yük altında geç kalma ya da istemci zamanlayıcısının takılıp girdileri toplu göndermesi
    // varsa düzeltmeler sınırlı kalır.
    const stalled = run.stall() > STALL_MS;
    const ceiling = starved === 0 && !stalled ? 1e-6 : NETWORK.snapDistance / 2;
    expect(Math.max(...corrections)).toBeLessThan(ceiling);
    // Sürüklenme ortalaması da aynı yük toleransını izler: aç kalma ya da takılma varken tek birim aşabilir.
    expect(run.pilot.drift.ema).toBeLessThan(
      starved === 0 && !stalled ? 1 : NETWORK.snapDistance / 2,
    );
    expect(run.fired()).toBeGreaterThan(0);
    await until(() => serverFired.length > 0, 'sunucunun kendi atışı');
    const pose = run.pilot.pose();
    expect(Number.isFinite(pose.x) && Number.isFinite(pose.y) && Number.isFinite(pose.hull)).toBe(
      true,
    );
    run.pilot.dispose();
  }, 30000);
});

/** Odaya öngörülü bir pilot bağlar ve çeşitli girdi akışıyla sürer; düzeltme büyüklüklerini toplar. */
/** Bu süreyi aşan zamanlayıcı kesintisi yük sayılır (4 ms vuruşun çok üstü). */
const STALL_MS = 60;

function drive(seat: Seat) {
  const predict = Predict.get(seat);
  let fired = 0;
  const pilot = new PredictedPilot({
    room: seat,
    predict,
    self: self(seat),
    space: new World(WORLD.width, WORLD.height, WORLD.gridStep),
    divergenceTolerance: 1e9,
    onFired: () => fired++,
  });
  const corrections: number[] = [];
  let step = 0;
  let seen = 0;
  let lastAt = performance.now();
  let stall = 0;
  const timer = setInterval(() => {
    const at = performance.now();
    stall = Math.max(stall, at - lastAt);
    lastAt = at;
    const due = predict.tick(at);
    for (let index = 0; index < due; index++) pilot.send(commandAt(step++));
    if (pilot.reconciler.reconcileSeq !== seen) {
      seen = pilot.reconciler.reconcileSeq;
      corrections.push(pilot.reconciler.lastCorrectionMag);
    }
  }, 4);
  return {
    pilot,
    corrections,
    /** Zamanlayıcının iki vuruşu arasındaki en uzun süre (ms): yüklü makinede istemci kesintisi. */
    stall: () => stall,
    fired: () => fired,
    stop: () => clearInterval(timer),
  };
}

function serverRoomCount(): number {
  return matchMaker.stats.local.roomCount;
}
