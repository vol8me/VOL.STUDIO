import { afterEach, describe, expect, it } from 'vitest';
import { NETWORK } from '@/config/network';
import { WORLD } from '@/config/world';
import type { OnlineSession } from '@/network/OnlineSession';
import { applyVitals, RemoteTanks } from '@/network/RemoteTanks';
import { PlayerState } from '@/network/schema';
import { Simulation } from '@/sim/Simulation';
import { World } from '@/sim/world/World';
import {
  openSession,
  serverRoom,
  startServer,
  until,
  type TestServer,
} from '../support/netHarness';
import { STRIKER } from '@/config/vehicles';

let server: TestServer | undefined;
const sessions: OnlineSession[] = [];
const timers: ReturnType<typeof setInterval>[] = [];

afterEach(async () => {
  for (const timer of timers.splice(0)) clearInterval(timer);
  for (const session of sessions.splice(0)) session.dispose();
  await server?.stop();
  server = undefined;
});

async function join(name = 'Pilot'): Promise<OnlineSession> {
  server ??= await startServer();
  const session = await openSession(server, name);
  sessions.push(session);
  return session;
}

function viewSim(): Simulation {
  return new Simulation({
    world: new World(WORLD.width, WORLD.height, WORLD.gridStep),
    vehicle: STRIKER,
    spawnPlayer: false,
  });
}

/** İzleyicinin gözünden ikinci oyuncuyu görünür kılar: yama gelene dek bekler. */
async function observe(watcher: OnlineSession, sim = viewSim()): Promise<RemoteTanks> {
  const remotes = new RemoteTanks(watcher.room, watcher.predict, sim);
  await until(() => remotes.count >= 1, 'uzak araç');
  return remotes;
}

/** Kare döngüsünü taklit eder: SDK saatini ilerletir ve uzak araçları tazeler. */
function frames(session: OnlineSession, remotes: RemoteTanks): void {
  timers.push(
    setInterval(() => {
      session.predict.tick(performance.now());
      remotes.update(0);
    }, 8),
  );
}

/** Aracı ileri sürer: girdi kesintisiz yollanır. */
function cruise(session: OnlineSession): void {
  const input = session.room.input();
  timers.push(
    setInterval(() => {
      const data = input.data as { moveY: number };
      data.moveY = 1;
      input.send();
    }, 16),
  );
}

describe('RemoteTanks kurulum', () => {
  it('yalnız diğer oyuncuları ekler ve kimliği sunucununkiyle eşler', async () => {
    const first = await join('Bir');
    const sim = viewSim();
    const remotes = new RemoteTanks(first.room, first.predict, sim);
    expect(remotes.count).toBe(0);
    const second = await join('İki');
    await until(() => remotes.count === 1, 'uzak araç');
    const vehicle = remotes.vehicle(second.self!.vehicleId)!;
    expect(vehicle).toBeDefined();
    expect(sim.vehicle(second.self!.vehicleId)).toBe(vehicle);
    expect(sim.vehicle(first.self!.vehicleId)).toBeUndefined();
    expect(vehicle.team).toBe(second.self!.team);
    expect(remotes.vehicle(first.self!.vehicleId)).toBeUndefined();
    remotes.dispose();
  });

  it('odaya sonradan katılan, mevcut oyuncuları ilk durumdan alır', async () => {
    const first = await join();
    const second = await join();
    const remotes = new RemoteTanks(second.room, second.predict, viewSim());
    expect(remotes.count).toBe(1);
    expect(remotes.vehicle(first.self!.vehicleId)).toBeDefined();
    remotes.dispose();
  });

  it('cephe numarasını taşır', async () => {
    const first = await join('Bir');
    const second = await join('İki');
    const remotes = await observe(first);
    const vehicle = remotes.vehicle(second.self!.vehicleId)!;
    expect(vehicle.team).toBe(second.self!.team);
    expect(vehicle.team).not.toBeNull();
    remotes.dispose();
  });

  it('çıkan oyuncunun aracı benzetimden kalkar', async () => {
    const first = await join();
    const second = await join();
    const sim = viewSim();
    const remotes = await observe(first, sim);
    const id = second.self!.vehicleId;
    expect(sim.vehicle(id)).toBeDefined();
    await second.leave();
    await until(() => remotes.count === 0, 'araç kalkışı');
    expect(sim.vehicle(id)).toBeUndefined();
    remotes.dispose();
  });

  it('dispose araçları söker ve sonraki yamalar hata üretmez', async () => {
    const first = await join();
    const second = await join();
    const sim = viewSim();
    const remotes = await observe(first, sim);
    remotes.dispose();
    expect(remotes.count).toBe(0);
    expect(sim.vehicles).toHaveLength(0);
    cruise(second);
    await until(() => second.room.state.timeMs > 300, 'yama akışı');
    remotes.update(0);
  });
});

describe('RemoteTanks ara değer', () => {
  it('uzak araç sunucudaki konuma doğru, onu aşmadan ilerler', async () => {
    const watcher = await join('İzleyici');
    const driver = await join('Sürücü');
    const remotes = await observe(watcher);
    frames(watcher, remotes);
    const vehicle = remotes.vehicle(driver.self!.vehicleId)!;
    const record = driver.self!;
    const start = { x: record.x, y: record.y };
    cruise(driver);
    await until(
      () => Math.hypot(vehicle.chassis.x - start.x, vehicle.chassis.y - start.y) > 25,
      'hareket',
    );
    const shown = Math.hypot(vehicle.chassis.x - start.x, vehicle.chassis.y - start.y);
    const authoritative = Math.hypot(record.x - start.x, record.y - start.y);
    // Görüntü geriye dönük süre kadar gecikir: sunucudaki gerçek konumu geçemez.
    expect(shown).toBeLessThanOrEqual(authoritative + 1);
    expect(shown).toBeGreaterThan(0);
    // Hız gerçekten ara değerden gelir: tankın sürüş sinyalleri de taşınır.
    expect(vehicle.chassis.speed).toBeGreaterThan(0);
    expect(vehicle.chassis.treadLeft).not.toBe(0);
    remotes.dispose();
  });

  it('yeniden doğma sıçraması süzülmez, ışınlanır', async () => {
    const watcher = await join('İzleyici');
    const target = await join('Hedef');
    const remotes = await observe(watcher);
    frames(watcher, remotes);
    const vehicle = remotes.vehicle(target.self!.vehicleId)!;
    await until(() => watcher.room.state.timeMs > 400, 'yama akışı');
    const local = serverRoom(target.room).vehicleOf(target.room.sessionId)!;
    const far = { x: local.chassis.x + NETWORK.snapDistance * 2, y: local.chassis.y };
    local.chassis.place(far.x, far.y, 0);
    const samples: number[] = [];
    const watch = setInterval(() => samples.push(vehicle.chassis.x), 4);
    timers.push(watch);
    await until(() => Math.abs(vehicle.chassis.x - far.x) < 1, 'ışınlanma');
    clearInterval(watch);
    // Ara değerli kayma olsaydı aradaki konumlar (yarı yol) görülürdü.
    const midway = samples.filter(
      (x) => Math.abs(x - far.x) > 40 && Math.abs(x - (far.x - NETWORK.snapDistance * 2)) > 40,
    );
    expect(midway).toEqual([]);
    remotes.dispose();
  });
});

describe('RemoteTanks can sayaçları', () => {
  it('sunucudaki can ve ölüm sayacı araca yansır', async () => {
    const watcher = await join();
    const target = await join();
    const remotes = await observe(watcher);
    frames(watcher, remotes);
    const vehicle = remotes.vehicle(target.self!.vehicleId)!;
    const local = serverRoom(target.room).vehicleOf(target.room.sessionId)!;
    local.vitality.health = 35;
    await until(() => vehicle.vitality.health === 35, 'can');
    expect(vehicle.vitality.alive).toBe(true);
    local.vitality.health = 0;
    local.vitality.respawnRemainingMs = 4000;
    await until(() => !vehicle.vitality.alive, 'ölüm');
    expect(vehicle.vitality.respawnRemainingMs).toBeGreaterThan(0);
    expect(vehicle.vitality.respawnRemainingMs).toBeLessThanOrEqual(4000);
    remotes.dispose();
  });
});

describe('applyVitals', () => {
  it('sayaçları yama yaşı kadar ilerletir ve sıfırın altına düşürmez', () => {
    const record = new PlayerState();
    record.health = 0;
    record.respawnMs = 1000;
    record.protectionMs = 300;
    const sim = viewSim();
    const vehicle = sim.spawn(0, 0, 0, null, 7);
    applyVitals(vehicle, record, 250);
    expect(vehicle.vitality.respawnRemainingMs).toBe(750);
    expect(vehicle.vitality.protectionRemainingMs).toBe(50);
    applyVitals(vehicle, record, 5000);
    expect(vehicle.vitality.respawnRemainingMs).toBe(0);
    expect(vehicle.vitality.protectionRemainingMs).toBe(0);
    expect(vehicle.vitality.alive).toBe(false);
  });
});
