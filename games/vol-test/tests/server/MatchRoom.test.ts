import { Client } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { Predict, classifyJoinError, type JoinFailure, type Room } from '@volstudio/network/client';
import { afterEach, describe, expect, it } from 'vitest';
import { MATCH, NETWORK } from '@/config/network';
import { TANK } from '@/config/tank';
import { STRIKER, VEHICLE_IDS, VEHICLES, modelOf } from '@/config/vehicles';
import { WORLD } from '@/config/world';
import { EVENT_MESSAGE, type EventBatch, type NetEvent } from '@/network/events';
import { PredictedPilot } from '@/network/PredictedPilot';
import { ROOM } from '@/network/rooms';
import type { MatchSnapshot, TankInputData } from '@/network/schema';
import { World } from '@/sim/world/World';
import { commandAt } from '../support/commands';
import {
  joined,
  joinPublic,
  privateRoom,
  serverRoom,
  startQuickServer,
  startServer,
  until,
  type JoinParams,
  type TestServer,
} from '../support/netHarness';

type Seat = Room<MatchSnapshot>;

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

const boot = async () => (server = await startServer());
const bootQuick = async () => (server = await startQuickServer());
const join = (params: JoinParams = {}) => track(joinPublic(server!, params));
const create = (params: JoinParams = {}) => track(privateRoom(server!, 'create', params));
const enter = (params: JoinParams = {}) => track(privateRoom(server!, 'join', params));

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

describe('MatchRoom katılım', () => {
  it('oyuncu kaydı adı, aracı, sağlığı ve maç kurallarıyla görünür', async () => {
    await boot();
    const seat = await join({ name: 'Ada' });
    const player = self(seat);
    expect(player.name).toBe('Ada');
    expect(player.vehicleId).toBeGreaterThan(0);
    expect(player.alive).toBe(true);
    expect(player.connected).toBe(true);
    expect(player.team).toBe(-1);
    expect(seat.state.mode).toBe('ffa');
    expect(seat.state.phase).toBe('live');
    expect(seat.state.scoreLimit).toBe(MATCH.scoreLimit.ffa);
    expect(seat.state.code).toBe('');
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
    expect(await failure(client.joinOrCreate(ROOM.match, { protocol: 1 }))).toBe('protocol');
    expect(await failure(client.joinOrCreate(ROOM.match, {}))).toBe('protocol');
    expect(serverRoomCount()).toBe(0);
  });

  it('aynı moddaki oyuncular aynı odaya, farklı mod ayrı odaya düşer', async () => {
    await boot();
    const a = await join({ mode: 'ffa' });
    const b = await join({ mode: 'ffa' });
    const c = await join({ mode: 'teams' });
    expect(b.roomId).toBe(a.roomId);
    expect(c.roomId).not.toBe(a.roomId);
    expect(c.state.mode).toBe('teams');
    expect(c.state.scoreLimit).toBe(MATCH.scoreLimit.teams);
  });

  it('geçersiz mod takımsız maça düşer', async () => {
    await boot();
    const seat = await join({ mode: 'ctf' });
    expect(seat.state.mode).toBe('ffa');
  });

  it('oda dolunca bir sonraki oyuncu ikinci odaya düşer', async () => {
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

describe('MatchRoom takımlar', () => {
  it('oyuncuları küçük takıma dağıtır ve çıkan yerine dengeyi korur', async () => {
    await boot();
    const group: Seat[] = [];
    for (let index = 0; index < 4; index++) group.push(await join({ mode: 'teams' }));
    expect(group.map((seat) => self(seat).team)).toEqual([0, 1, 0, 1]);
    for (const seat of group) expect(vehicleOf(seat).team).toBe(self(seat).team);

    await group[1].leave();
    await until(() => group[0].state.players.size === 3, 'oyuncu çıkışı');
    const next = await join({ mode: 'teams' });
    expect(self(next).team).toBe(1);
  });

  it('takımsız maçta araçlar takım taşımaz', async () => {
    await boot();
    const seat = await join({ mode: 'ffa' });
    expect(vehicleOf(seat).team).toBeNull();
  });
});

describe('MatchRoom özel odalar', () => {
  it('kodla kurulur, kodla katılınır ve kod odada görünür', async () => {
    await boot();
    const host = await create({ code: 'ABCDE', name: 'Ev' });
    expect(host.state.code).toBe('ABCDE');
    const guest = await enter({ code: 'ABCDE', name: 'Konuk' });
    expect(guest.roomId).toBe(host.roomId);
    expect(guest.state.players.size).toBe(2);
  });

  it('aynı kodla ikinci oda kurulamaz, kod boşalınca yeniden kullanılır', async () => {
    await boot();
    const host = await create({ code: 'KDE23' });
    expect(await failure(privateRoom(server!, 'create', { code: 'KDE23' }))).toBe('code');
    const id = host.roomId;
    await host.leave();
    await until(() => matchMaker.getLocalRoomById(id) === undefined, 'oda kapanışı');
    const again = await create({ code: 'KDE23' });
    expect(again.roomId).not.toBe(id);
  });

  it('reddedilen kuruluş yetim oda bırakmaz ve kodun gerçek sahibini bozmaz', async () => {
    await boot();
    const host = await create({ code: 'KDE23' });
    await failure(privateRoom(server!, 'create', { code: 'KDE23' }));
    await failure(privateRoom(server!, 'create', { code: 'kde23' }));
    await until(() => serverRoomCount() === 1, 'yetim odaların kapanışı');
    const guest = await enter({ code: 'KDE23' });
    expect(guest.roomId).toBe(host.roomId);
  });

  it('aynı kodla eşzamanlı iki kuruluştan yalnız biri başarılır', async () => {
    await boot();
    const results = await Promise.allSettled(
      [0, 1, 2].map(() => track(privateRoom(server!, 'create', { code: 'KDE23' }))),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const reasons = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => classifyJoinError(result.reason));
    expect(reasons).toEqual(['code', 'code']);
  });

  it('kodsuz ya da kurala uymayan kodla oda kurulamaz', async () => {
    await boot();
    for (const code of [undefined, 'abcde', 'ABCD', 'ABCDEF', 'ABCD0', 'ABC-E']) {
      expect(await failure(privateRoom(server!, 'create', { code }))).toBe('code');
    }
  });

  it('olmayan kod bulunamaz, kodsuz katılım var olan odaya da giremez', async () => {
    await boot();
    expect(await failure(privateRoom(server!, 'join', { code: 'ZZZZZ' }))).toBe('not-found');
    await create({ code: 'ABCDE' });
    expect(await failure(privateRoom(server!, 'join', { code: 'ZZZZZ' }))).toBe('not-found');
    expect(await failure(privateRoom(server!, 'join', {}))).toBe('code');
  });

  it('istemcinin normalleştirmediği kod eşleşmez', async () => {
    await boot();
    await create({ code: 'ABCDE' });
    expect(await failure(privateRoom(server!, 'join', { code: 'abcde' }))).toBe('not-found');
  });

  it('sekiz oyuncuda dolar ve dokuzuncu girmez', async () => {
    await boot();
    await create({ code: 'ABCDE' });
    for (let index = 1; index < MATCH.privateMaxPlayers; index++) await enter({ code: 'ABCDE' });
    expect(await failure(privateRoom(server!, 'join', { code: 'ABCDE' }))).toBe('not-found');
  });

  it('herkese açık odanın kodu boştur ve özel oda herkese açık eşleşmeye girmez', async () => {
    await boot();
    await create({ code: 'ABCDE' });
    const open = await join();
    expect(open.state.code).toBe('');
    expect(open.name).toBe(ROOM.match);
  });
});

describe('MatchRoom girdi yetkisi', () => {
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

  it('ateş girdisi sunucuda mermi doğurur ve olayı odaya yayar', async () => {
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

describe('MatchRoom skor', () => {
  async function pair() {
    await boot();
    const killer = await join({ name: 'Av' });
    const victim = await join({ name: 'Kurban' });
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
  });

  it('kendi kendini yok eden ve kaynaksız ölen yalnız ölüm yazar', async () => {
    const { killer, victim, sim } = await pair();
    sim.applyDamage(self(killer).vehicleId, 1e6, self(killer).vehicleId);
    sim.applyDamage(self(victim).vehicleId, 1e6);
    await until(() => self(killer).deaths === 1 && self(victim).deaths === 1, 'ölümler');
    expect(self(killer).kills).toBe(0);
    expect(self(victim).kills).toBe(0);
  });

  it('ölen araç doğma süresi dolunca korumayla, düşmandan uzakta yeniden doğar', async () => {
    const { killer, victim, sim } = await pair();
    sim.applyDamage(self(victim).vehicleId, 1e6, self(killer).vehicleId);
    await until(() => !self(victim).alive, 'ölüm');
    vehicleOf(victim).vitality.respawnRemainingMs = 5;
    await until(() => self(victim).alive, 'yeniden doğma');
    const reborn = self(victim);
    expect(reborn.health).toBeGreaterThan(0);
    expect(reborn.protectionMs).toBeGreaterThan(0);
    expect(Math.hypot(reborn.x - self(killer).x, reborn.y - self(killer).y)).toBeGreaterThan(200);
  });
});

describe('MatchRoom maç döngüsü', () => {
  it('skor sınırı maçı bitirir, ara verme sonunda skorlar sıfırlanıp yeni maç başlar', async () => {
    await bootQuick();
    const winner = await join({ name: 'Galip' });
    const loser = await join({ name: 'Mağlup' });
    const seen = collect(loser);
    exposed(winner, loser);
    const sim = serverRoom(winner).simulation;

    for (let kill = 1; kill <= 2; kill++) {
      sim.applyDamage(self(loser).vehicleId, 1e6, self(winner).vehicleId);
      await until(() => self(winner).kills === kill, `${kill}. öldürme`);
      if (kill < 2) {
        vehicleOf(loser).vitality.respawnRemainingMs = 5;
        await until(() => self(loser).alive, 'karşı tarafın dirilmesi');
        exposed(loser);
      }
    }

    await until(() => winner.state.phase === 'intermission', 'ara verme');
    expect(winner.state.winner).toBe(`p:${self(winner).vehicleId}`);
    await until(() => seen.some((event) => event.kind === 'matchEnd'), 'maç sonu olayı');

    await until(() => winner.state.phase === 'live', 'yeni maç');
    expect(winner.state.winner).toBe('');
    expect(winner.state.intermissionMs).toBe(0);
    expect(self(winner).kills).toBe(0);
    expect(self(loser).deaths).toBe(0);
    expect(self(loser).alive).toBe(true);
    expect(self(loser).protectionMs).toBeGreaterThan(0);
    await until(() => seen.some((event) => event.kind === 'matchStart'), 'maç başlangıcı olayı');
  });

  it('ara vermede öldürme sayılmaz', async () => {
    await bootQuick();
    const winner = await join();
    const loser = await join();
    exposed(winner, loser);
    const sim = serverRoom(winner).simulation;
    const id = (seat: Seat) => self(seat).vehicleId;
    for (let kill = 1; kill <= 2; kill++) {
      sim.applyDamage(id(loser), 1e6, id(winner));
      await until(() => self(winner).kills === kill, `${kill}. öldürme`);
      if (kill < 2) {
        vehicleOf(loser).vitality.respawnRemainingMs = 5;
        await until(() => self(loser).alive, 'diriliş');
        exposed(loser);
      }
    }
    await until(() => winner.state.phase === 'intermission', 'ara verme');
    // Ara vermede ölen oyuncu yine ölür ama skor değişmez.
    exposed(winner);
    sim.applyDamage(id(winner), 1e6, id(loser));
    await until(() => !self(winner).alive || winner.state.phase === 'live', 'ara verme ölümü');
    expect(self(loser).kills).toBe(0);
  });
});

describe('MatchRoom ayrılma ve bağlantı kopması', () => {
  it('çıkan oyuncunun kaydı ve aracı kalkar, diğerleri görür, boş oda kapanır', async () => {
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

    const id = stays.roomId;
    await stays.leave();
    await until(() => matchMaker.getLocalRoomById(id) === undefined, 'oda kapanışı');
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

describe('MatchRoom öngörü', () => {
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
      await until(() => run.corrections.length > 15, 'uzlaştırmalar', 4000);
      starved = serverRoom(seat).inputStats(seat.sessionId)!.starved;
      corrections = run.corrections.slice();
    } finally {
      run.stop();
    }

    // Öngörü ile sunucu arasındaki tek sapma kaynağı, sunucunun istemcinin yollamadığı bir adım
    // atmasıdır (girdi geç kalınca boşta adım). Geç kalma yoksa tek bir düzeltme bile olamaz;
    // yük altında geç kalma varsa düzeltmeler sınırlı kalır.
    const ceiling = starved === 0 ? 1e-6 : NETWORK.seatRadius / 2;
    expect(Math.max(...corrections)).toBeLessThan(ceiling);
    expect(run.pilot.drift.ema).toBeLessThan(1);
    expect(run.fired()).toBeGreaterThan(0);
    await until(() => serverFired.length > 0, 'sunucunun kendi atışı');
    const pose = run.pilot.pose();
    expect(Number.isFinite(pose.x) && Number.isFinite(pose.y) && Number.isFinite(pose.hull)).toBe(
      true,
    );
    run.pilot.dispose();
  });
});

/** Odaya öngörülü bir pilot bağlar ve çeşitli girdi akışıyla sürer; düzeltme büyüklüklerini toplar. */
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
  const timer = setInterval(() => {
    const due = predict.tick(performance.now());
    for (let index = 0; index < due; index++) pilot.send(commandAt(step++));
    if (pilot.reconciler.reconcileSeq !== seen) {
      seen = pilot.reconciler.reconcileSeq;
      corrections.push(pilot.reconciler.lastCorrectionMag);
    }
  }, 4);
  return { pilot, corrections, fired: () => fired, stop: () => clearInterval(timer) };
}

function serverRoomCount(): number {
  return matchMaker.stats.local.roomCount;
}
