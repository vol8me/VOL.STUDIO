import type Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisposableScope, VirtualActionSource, VirtualStickSource } from '@volstudio/core';
import { GraphicsQuality } from '@volstudio/core/graphics';
import { i18next } from '@volstudio/core/i18n';
import { WORLD } from '@/config/world';
import { EFFECT_LEVELS, type EffectLevel, type EffectProfile } from '@/config/quality';
import { Hud } from '@/hud/Hud';
import type { TestAction } from '@/input/bindings';
import type { OnlineRequest, OnlineSession } from '@/network/OnlineSession';
import { OnlineDriver, ONLINE_SCENARIO } from '@/scenes/world/OnlineDriver';
import type { PlayerControls } from '@/scenes/world/PlayerControls';
import type { DriverContext, WorldStartData } from '@/scenes/world/WorldDriver';
import { idleCommand, type TankCommand } from '@/sim/command';
import type { SimEvent } from '@/sim/events';
import { World } from '@/sim/world/World';
import { command } from '../../support/sim';
import { fakeScene } from '../../support/fakeScene';
import {
  openSession,
  serverRoom,
  startServer,
  until,
  type TestServer,
} from '../../support/netHarness';

let server: TestServer | undefined;
const scopes: DisposableScope[] = [];
const timers: ReturnType<typeof setInterval>[] = [];
const parents: HTMLElement[] = [];

afterEach(async () => {
  for (const timer of timers.splice(0)) clearInterval(timer);
  for (const scope of scopes.splice(0)) scope.dispose();
  for (const parent of parents.splice(0)) parent.remove();
  await server?.stop();
  server = undefined;
});

interface Rig {
  driver: OnlineDriver;
  session: OnlineSession;
  restart: ReturnType<typeof vi.fn<(data?: WorldStartData) => void>>;
  steps: { count: number };
  fake: ReturnType<typeof fakeScene>;
  scope: DisposableScope;
  setCommand: (next: TankCommand) => void;
  events: SimEvent[];
  hud: Hud | undefined;
  parent: HTMLElement;
  run: (paused?: () => boolean) => void;
}

async function rig(
  request: OnlineRequest = { kind: 'quick', mode: 'ffa' },
  name = 'Pilot',
): Promise<Rig> {
  server ??= await startServer();
  const session = await openSession(server, request, name);
  const scope = new DisposableScope();
  scopes.push(scope);
  const fake = fakeScene();
  const steps = { count: 0 };
  let current: TankCommand = idleCommand();
  const controls = {
    step: () => {
      steps.count++;
      return current;
    },
  } as unknown as PlayerControls;
  const restart = vi.fn<(data?: WorldStartData) => void>();
  const context: DriverContext = {
    scene: { add: fake.add } as unknown as Phaser.Scene,
    world: new World(WORLD.width, WORLD.height, WORLD.gridStep),
    weather: undefined as never,
    controls,
    seed: 0,
    scope,
    restart,
  };
  const driver = new OnlineDriver(context, session);
  const parent = document.createElement('div');
  document.body.append(parent);
  parents.push(parent);
  const hud = new Hud({
    parent,
    metre: WORLD.metre,
    worldWidth: WORLD.width,
    worldHeight: WORLD.height,
    mapGridStep: WORLD.gridStep,
    mapGridMajorEvery: WORLD.gridMajorEvery,
    actionSource: new VirtualActionSource<TestAction>(),
    stickSource: new VirtualStickSource(),
    touch: false,
    fullscreen: false,
    onResume: vi.fn(),
    quality: new GraphicsQuality<EffectLevel, EffectProfile>({
      levels: EFFECT_LEVELS,
      initial: 'high',
    }),
  });
  scope.addDestroyable(hud);
  driver.attachHud(hud);
  const events: SimEvent[] = [];
  const result: Rig = {
    driver,
    session,
    restart,
    steps,
    fake,
    scope,
    setCommand: (next) => {
      current = next;
    },
    events,
    hud,
    parent,
    run: (paused = () => false) => {
      let last = performance.now();
      timers.push(
        setInterval(() => {
          const now = performance.now();
          driver.advance(now, now - last, paused());
          last = now;
          const out: SimEvent[] = [];
          events.push(...driver.drainEvents(out));
          driver.present(now);
        }, 8),
      );
    },
  };
  return result;
}

const byId = (parent: HTMLElement, id: string): HTMLElement =>
  parent.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

describe('OnlineDriver sürüş', () => {
  it('girdiyi öngörüyle sürer, ölçüm bağlamını ve ağ sayılarını verir', async () => {
    const { driver, run, setCommand, steps } = await rig();
    const start = { x: driver.player.tank.x, y: driver.player.tank.y };
    setCommand(command({ moveY: -1 }));
    run();
    await until(() => steps.count > 40, 'girdi adımları');
    expect(
      Math.hypot(driver.player.tank.x - start.x, driver.player.tank.y - start.y),
    ).toBeGreaterThan(5);
    expect(driver.sim).toBe(driver.world.sim);
    expect(driver.measurement).toEqual({ scenario: ONLINE_SCENARIO, seed: 0 });
    expect(driver.advance(performance.now(), 16, false)).toEqual({ alpha: 0 });
    const metrics = driver.metrics();
    expect(Object.keys(metrics).sort()).toEqual([
      'online.driftEma',
      'online.driftPeak',
      'online.jitterMs',
      'online.pingMs',
      'online.remotes',
    ]);
    expect(metrics['online.remotes']).toBe(0);
  });

  it('duraklatılınca girdi okunmaz ama boş niyet sunucuya akmaya devam eder', async () => {
    const { run, setCommand, steps, session, driver } = await rig();
    let sent = 0;
    session.room.input().onSend(() => sent++);
    setCommand(command({ moveY: -1 }));
    let paused = false;
    run(() => paused);
    await until(() => steps.count > 20, 'sürüş');
    paused = true;
    await new Promise((resolve) => setTimeout(resolve, 40));
    const read = steps.count;
    const before = sent;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(steps.count).toBe(read);
    // 200 ms ≈ 12 sabit adım: duraklatma dünyayı sunucuda dondurmaz, bağlantıyı da kesmez.
    expect(sent - before).toBeGreaterThanOrEqual(6);
    expect(session.status).toBe('live');
    expect(driver.player.vitality.alive).toBe(true);
  });

  it('kendi atışı yerel sim olayı olarak düşer; oda yaşamı olayları sim olayı sayılmaz', async () => {
    const { run, setCommand, events, driver } = await rig();
    setCommand(command({ fire: true }));
    run();
    await until(() => events.some((event) => event.kind === 'fired'), 'yerel atış');
    setCommand(command());
    const fired = events.find((event) => event.kind === 'fired');
    expect(fired).toMatchObject({ source: driver.player.id });
    const roomLife = new Set(['joined', 'left', 'matchStart', 'matchEnd']);
    expect(events.filter((event) => roomLife.has(event.kind))).toEqual([]);
  });
});

describe('OnlineDriver panel ve etiket', () => {
  it('HUD parçasını bağlar, skor tablosunu doldurur ve oyuncu katılımını akışa yazar', async () => {
    const first = await rig({ kind: 'quick', mode: 'ffa' }, 'Birinci');
    first.run();
    await until(
      () => byId(first.parent, 'online-board').textContent?.includes('Birinci') === true,
      'tablo',
    );
    expect(byId(first.parent, 'online-board').textContent).toContain(
      i18next.t('voltest:online.board.you', { name: 'Birinci' }),
    );
    expect(byId(first.parent, 'online-room').textContent).toBe(
      i18next.t('voltest:online.publicRoom'),
    );

    // İkinci oyuncu aynı odaya düşer: ilkinin akışında katılma, tablosunda iki satır olur.
    const room = serverRoom(first.session.room);
    const second = await openSession(server!, { kind: 'quick', mode: 'ffa' }, 'İkinci');
    try {
      await until(() => room.state.players.size === 2, 'iki oyuncu');
      await until(
        () => byId(first.parent, 'online-feed').textContent?.includes('İkinci') === true,
        'katılma satırı',
      );
      await until(
        () =>
          first.parent.querySelectorAll('[data-testid="online-board"] .vol-datatable__row')
            .length === 2,
        'iki satır',
      );
    } finally {
      second.dispose();
    }
  });

  it('her araca ad etiketi çizer: kendisi, rakipler ve takım renkleri', async () => {
    const mine = await rig({ kind: 'quick', mode: 'ffa' }, 'Ben');
    mine.run();
    const other = await openSession(server!, { kind: 'quick', mode: 'ffa' }, 'Rakip');
    try {
      await until(() => mine.driver.sim.vehicles.length === 2, 'iki araç');
      await until(
        () => mine.fake.created.filter((object) => object.kind === 'text').length === 2,
        'iki etiket',
      );
      const texts = mine.fake.created.filter((object) => object.kind === 'text');
      const colors = new Map(
        texts.map((text) => [text.args[2] as string, (text.args[3] as { color: string }).color]),
      );
      expect(colors.get('Ben')).toBe('#52f5cf');
      expect(colors.get('Rakip')).toBe('#e8644a');
    } finally {
      other.dispose();
    }
  });

  it('takımlı maçta etiket rengi takımdan gelir', async () => {
    const mine = await rig({ kind: 'quick', mode: 'teams' }, 'Takımcı');
    mine.run();
    await until(() => mine.fake.created.some((object) => object.kind === 'text'), 'etiket');
    const text = mine.fake.created.find((object) => object.kind === 'text')!;
    const team = mine.driver.player.team;
    expect(team).not.toBeNull();
    const expected = team === 0 ? '#e8964a' : '#4aa8e8';
    await until(() => (text.args[3] as { color: string }).color === expected, 'takım rengi');
  });
});

describe('OnlineDriver çıkış', () => {
  it('Maçtan ayrıl: sunucudan ayrılır, çevrimdışı dünyaya döner ve bağlantı koptu demez', async () => {
    const { driver, restart, session, parent, run } = await rig();
    run();
    await until(() => session.self !== undefined, 'oturum');
    const leave = byId(parent, 'pause-leave');
    expect(leave.textContent).toBe(i18next.t('voltest:online.leave'));
    leave.click();
    leave.click();
    await until(() => restart.mock.calls.length > 0, 'yeniden başlatma');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(restart).toHaveBeenCalledTimes(1);
    expect(restart).toHaveBeenCalledWith();
    expect(session.status).toBe('closed');
    await driver.leave();
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('bağlantı bilerek ayrılmadan kapanırsa uyarıyla çevrimdışı dünyaya döner', async () => {
    const { restart, session, run } = await rig();
    run();
    await until(() => session.self !== undefined, 'oturum');
    await session.room.leave(true);
    await until(() => restart.mock.calls.length > 0, 'yeniden başlatma');
    expect(restart).toHaveBeenCalledWith({ notice: 'voltest:online.lost' });
  });

  it('sahne kapanınca dünya ve bağlantı sökülür, panel kaldırılır', async () => {
    const { scope, session, parent, run, restart } = await rig();
    run();
    await until(() => session.self !== undefined, 'oturum');
    expect(byId(parent, 'online')).not.toBeNull();
    scope.dispose();
    expect(session.status).toBe('closed');
    expect(parent.querySelector('[data-testid="online"]')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(restart).not.toHaveBeenCalled();
  });
});
