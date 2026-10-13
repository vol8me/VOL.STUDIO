import { afterEach, describe, expect, it } from 'vitest';
import { WORLD } from '@/config/world';
import type { NetEvent } from '@/network/events';
import { involvesPlayer, OnlineWorld } from '@/network/OnlineWorld';
import type { OnlineSession } from '@/network/OnlineSession';
import { idleCommand, type TankCommand } from '@/sim/command';
import { World } from '@/sim/world/World';
import { command } from '../support/sim';
import {
  openSession,
  serverRoom,
  startServer,
  until,
  type TestServer,
} from '../support/netHarness';

let server: TestServer | undefined;
const sessions: OnlineSession[] = [];
const worlds: OnlineWorld[] = [];
const timers: ReturnType<typeof setInterval>[] = [];

afterEach(async () => {
  for (const timer of timers.splice(0)) clearInterval(timer);
  for (const world of worlds.splice(0)) world.dispose();
  for (const session of sessions.splice(0)) session.dispose();
  await server?.stop();
  server = undefined;
});

async function join(name = 'Pilot'): Promise<OnlineSession> {
  server ??= await startServer();
  const session = await openSession(server, { kind: 'quick', mode: 'ffa' }, name);
  sessions.push(session);
  return session;
}

function build(session: OnlineSession): OnlineWorld {
  const world = new OnlineWorld(session, new World(WORLD.width, WORLD.height, WORLD.gridStep));
  worlds.push(world);
  return world;
}

/** Bırakılan olay, bırakıldığı an ve o andaki yerel mermi sayısı. */
interface Timed {
  at: number;
  event: NetEvent;
  shells: number;
}

/** Sahnenin kare döngüsünü taklit eder: SDK adımları kadar girdi yollar, sonra kareyi ilerletir. */
function run(
  session: OnlineSession,
  world: OnlineWorld,
  commandOf: (step: number) => TankCommand = () => idleCommand(),
): { events: NetEvent[]; timed: Timed[]; steps: () => number } {
  const events: NetEvent[] = [];
  const timed: Timed[] = [];
  const batch: NetEvent[] = [];
  let step = 0;
  let last = performance.now();
  timers.push(
    setInterval(() => {
      const now = performance.now();
      const due = session.predict.tick(now);
      for (let index = 0; index < due; index++) world.step(commandOf(step++));
      world.advance(now - last);
      last = now;
      batch.length = 0;
      for (const event of world.drainEvents(batch)) {
        events.push(event);
        timed.push({ at: now, event, shells: world.sim.projectiles.count });
      }
    }, 8),
  );
  return { events, timed, steps: () => step };
}

describe('OnlineWorld kurulum', () => {
  it('kendi aracını sunucunun kimliğiyle kurar, diğer oyuncuları ekler', async () => {
    const first = await join('Bir');
    const second = await join('İki');
    const world = build(second);
    const ids = world.sim.vehicles.map((vehicle) => vehicle.id).sort();
    expect(ids).toEqual([first.self!.vehicleId, second.self!.vehicleId].sort());
    expect(world.player.id).toBe(second.self!.vehicleId);
    expect(world.nameOf(first.self!.vehicleId)).toBe('Bir');
    expect(world.nameOf(9999)).toBeUndefined();
  });

  it('oturumda kayıt yoksa kurulum reddedilir', async () => {
    const session = await join();
    const empty = Object.create(session, { self: { get: () => undefined } }) as OnlineSession;
    expect(
      () => new OnlineWorld(empty, new World(WORLD.width, WORLD.height, WORLD.gridStep)),
    ).toThrow(/oyuncu kaydı/);
  });
});

describe('OnlineWorld öngörü', () => {
  it('girdi aracı sürer; çizim pozu previous içindedir ve sapma küçük kalır', async () => {
    const session = await join();
    const world = build(session);
    const start = { x: world.player.tank.x, y: world.player.tank.y };
    const loop = run(session, world, () => command({ moveY: -1 }));
    await until(() => loop.steps() > 40, 'girdi adımları');
    const tank = world.player.tank;
    expect(Math.hypot(tank.x - start.x, tank.y - start.y)).toBeGreaterThan(5);
    // Çizim pozu ara değerli öngörüdür; güncel durumdan en çok bir adımlık yol kadar geride olabilir.
    const lag = Math.hypot(tank.previous.x - tank.x, tank.previous.y - tank.y);
    expect(lag).toBeLessThan(40);
    expect(world.pilot.drift.peak).toBeLessThan(5);
  });

  it('sunucu aracı kaydırınca sapma ölçülür ve istemci yeni yetkiye yakınsar', async () => {
    // SDK, sapma eşiği verilmezse ölçümü hiç yapmaz; "sapma 0" bu testsiz boş bir iddia olurdu.
    const session = await join();
    const world = build(session);
    run(session, world);
    const record = serverRoom(session.room).vehicleOf(session.room.sessionId)!;
    await until(() => session.snapshotAgeMs > 0, 'ilk yama');
    record.tank.x += 40;
    await until(() => world.pilot.drift.peak > 1, 'ölçülen sapma');
    await until(() => Math.abs(world.player.tank.x - record.tank.x) < 1, 'yeni yetkiye yakınsama');
  });

  it('ölü araç sürülmez; sunucunun can ve sayaçları araca yansır', async () => {
    const session = await join();
    const world = build(session);
    run(session, world);
    const record = serverRoom(session.room).vehicleOf(session.room.sessionId)!;
    record.vitality.health = 0;
    record.vitality.respawnRemainingMs = 5000;
    await until(() => !world.player.vitality.alive, 'ölüm');
    expect(world.player.vitality.respawnRemainingMs).toBeGreaterThan(0);
    expect(world.player.vitality.respawnRemainingMs).toBeLessThanOrEqual(5000);
  });
});

describe('OnlineWorld olaylar', () => {
  it('kendi atışı hemen oynar, mermi yerelde uçar ve sunucunun yankısı tekrarlanmaz', async () => {
    const session = await join();
    const world = build(session);
    const echoed: NetEvent[] = [];
    session.onEvents((batch) => echoed.push(...batch.events));
    // Ateş tuşu ilk yerel atışa dek basılı kalır: tek adımlık bir girdi yüklü makinede tampon
    // taşmasıyla düşebilir. Silah aralığı (650 ms) ikinci atışı engeller.
    let firing = true;
    const loop = run(session, world, () => command({ fire: firing }));
    await until(() => loop.events.some((event) => event.kind === 'fired'), 'yerel atış');
    firing = false;
    // Atış yerelde oynadığı anda mermi de yerelde uçuyordur: sunucu yankısı beklenmedi.
    expect(world.sim.projectiles.count).toBe(1);
    await until(() => echoed.some((event) => event.kind === 'fired'), 'sunucu yankısı');
    // Yankı gelince tekrarlanan bir atış olsaydı olay kutusuna hemen düşerdi; birkaç kare tanı ver.
    await new Promise((resolve) => setTimeout(resolve, 60));
    const fired = loop.events.filter((event) => event.kind === 'fired');
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ source: world.player.id });
  });

  it('uzaktaki oyuncunun atışı geriye dönük süre kadar gecikmeyle oynar ve mermi uçar', async () => {
    const watcher = await join('İzleyici');
    const shooter = await join('Atıcı');
    const watching = build(watcher);
    const shooting = build(shooter);
    const arrivals: number[] = [];
    watcher.onEvents((batch) => {
      if (batch.events.some((event) => event.kind === 'fired')) arrivals.push(performance.now());
    });
    const watched = run(watcher, watching);
    const isShot = (entry: Timed): boolean => entry.event.kind === 'fired';
    run(shooter, shooting, () => command({ fire: !watched.timed.some(isShot) }));
    await until(() => watched.timed.some(isShot), 'uzak atış', 4000);
    const shot = watched.timed.find(isShot)!;
    expect(arrivals.length).toBeGreaterThan(0);
    // Paket anında gelir; görüntü gecikmesi kadar bekletilip bırakılır.
    expect(shot.at - arrivals[0]).toBeGreaterThan(50);
    expect(shot.event).toMatchObject({ source: shooting.player.id });
    // Bırakılan atış aynı karede yerelde bir mermi doğurmuştur.
    expect(shot.shells).toBeGreaterThanOrEqual(1);
  });

  it('başkalarının isabeti bekletilir, kendi isabetimiz hemen mermiyi söker', async () => {
    const watcher = await join('İzleyici');
    const other = await join('Diğer');
    const world = build(watcher);
    run(watcher, world);
    await until(() => world.remotes.count === 1, 'uzak araç');
    const otherId = other.self!.vehicleId;
    const mine = world.player.id;
    const batch = (owner: number) => ({
      t: watcher.room.state.timeMs,
      events: [
        { kind: 'impact', owner, surface: 'wall', x: 1010, y: 1000, angle: 0 } satisfies NetEvent,
      ],
    });

    world.sim.projectiles.spawn(mine, 1000, 1000, 0, 0);
    world.receive(batch(mine));
    expect(world.sim.projectiles.count).toBe(0);

    world.sim.projectiles.spawn(otherId, 1000, 1000, 0, 0);
    world.receive(batch(otherId));
    expect(world.sim.projectiles.count).toBe(1);
    await until(() => world.sim.projectiles.count === 0, 'bekletilen patlama');
  });

  it('zaman ekseni bilinmiyorsa olaylar beklemeden bırakılır', async () => {
    const session = await join();
    const world = build(session);
    const unknown = Object.create(session, {
      timeline: { value: { toServer: () => undefined } },
    }) as OnlineSession;
    const blind = new OnlineWorld(unknown, new World(WORLD.width, WORLD.height, WORLD.gridStep));
    worlds.push(blind);
    blind.sim.projectiles.spawn(77, 500, 500, 0, 0);
    blind.receive({
      t: 0,
      events: [{ kind: 'impact', owner: 77, surface: 'ground', x: 500, y: 500, angle: 0 }],
    });
    expect(blind.sim.projectiles.count).toBe(0);
    expect(blind.drainEvents([])).toHaveLength(1);
    expect(world.player.id).toBe(blind.player.id);
  });
});

describe('involvesPlayer', () => {
  const me = 3;
  const other = 4;
  const cases: [NetEvent, boolean][] = [
    [{ kind: 'fired', source: me, x: 0, y: 0, angle: 0, vx: 0, vy: 0 }, true],
    [{ kind: 'fired', source: other, x: 0, y: 0, angle: 0, vx: 0, vy: 0 }, false],
    [{ kind: 'impact', owner: me, surface: 'wall', x: 0, y: 0, angle: 0 }, true],
    [{ kind: 'impact', owner: other, surface: 'ground', x: 0, y: 0, angle: 0 }, false],
    [{ kind: 'hit', owner: other, target: me, x: 0, y: 0, angle: 0 }, true],
    [{ kind: 'hit', owner: me, target: other, x: 0, y: 0, angle: 0 }, true],
    [{ kind: 'hit', owner: other, target: 9, x: 0, y: 0, angle: 0 }, false],
    [{ kind: 'wallHit', source: me, x: 0, y: 0, normalX: 1, normalY: 0, speed: 1 }, true],
    [{ kind: 'wallHit', source: other, x: 0, y: 0, normalX: 1, normalY: 0, speed: 1 }, false],
    [{ kind: 'collision', a: other, b: me, x: 0, y: 0, normalX: 1, normalY: 0, speed: 1 }, true],
    [{ kind: 'collision', a: other, b: 9, x: 0, y: 0, normalX: 1, normalY: 0, speed: 1 }, false],
    [{ kind: 'damaged', target: me, cause: 'projectile', amount: 1, health: 1 }, true],
    [
      { kind: 'damaged', target: other, source: me, cause: 'projectile', amount: 1, health: 1 },
      true,
    ],
    [{ kind: 'damaged', target: other, source: 9, cause: 'wall', amount: 1, health: 1 }, false],
    [{ kind: 'healed', target: other, amount: 1, health: 1 }, false],
    [{ kind: 'died', target: me, cause: 'wall' }, true],
    [{ kind: 'died', target: other, cause: 'wall' }, false],
    [{ kind: 'respawned', target: me, x: 0, y: 0 }, true],
    [{ kind: 'respawned', target: other, x: 0, y: 0 }, false],
    [{ kind: 'joined', vehicleId: other, name: 'X' }, true],
    [{ kind: 'left', vehicleId: other, name: 'X' }, true],
    [{ kind: 'matchStart' }, true],
    [{ kind: 'matchEnd', winner: 'p:1' }, true],
  ];
  it.each(cases)('%j → %s', (event, expected) => {
    expect(involvesPlayer(event, me)).toBe(expected);
  });
});
