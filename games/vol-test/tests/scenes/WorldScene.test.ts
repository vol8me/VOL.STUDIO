import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameServices } from '@/app/GameServices';
import * as Platform from '@volstudio/tauri-v2';
import type * as CoreModule from '@volstudio/core';
import { triggerBack, Vector2, type InputState } from '@volstudio/core';
import { TANK } from '@/config/tank';
import { TEST_ACTIONS, type TestAction } from '@/input/bindings';
import type { Simulation } from '@/sim/Simulation';
import { WorldScene } from '@/scenes/WorldScene';
import { BootScene } from '@/scenes/BootScene';
import * as SceneAudio from '@/audio/sceneAudio';
import { GameAudio } from '@/audio/GameAudio';
import { FakeAudioContext } from '../support/fakeAudio';
import { fakeObject, fakeScene, lastCall } from '../support/fakeScene';

const controls = vi.hoisted(() => ({
  state: null as unknown as InputState<TestAction>,
  reset: 0,
  vibrate: [] as string[],
  cancelled: 0,
}));

vi.mock('@volstudio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();
  class FakeInputManager {
    readonly inputMode = undefined;
    getDebugSnapshot() {
      return { activeProvider: 'none' };
    }
    update(): void {}
    getState(): InputState<TestAction> {
      return controls.state;
    }
    reset(): void {
      controls.reset++;
    }
    destroy(): void {}
  }
  return {
    ...actual,
    InputManager: FakeInputManager,
    applyVolViewport: vi.fn(),
    shouldUseTouchControls: () => false,
    vibrate: (pattern: string) => controls.vibrate.push(pattern),
    cancelHaptics: () => controls.cancelled++,
  };
});

function idle(): InputState<TestAction> & { actions: Record<TestAction, boolean> } {
  const actions = Object.fromEntries(TEST_ACTIONS.map((a) => [a, false])) as Record<
    TestAction,
    boolean
  >;
  return { move: Vector2.zero(), aim: Vector2.zero(), actions };
}

interface Harness {
  sim: Simulation;
  scene: WorldScene;
  camera: ReturnType<typeof fakeObject>;
  parent: HTMLElement;
  wheel: (dy: number) => void;
  shutdown: () => void;
  frame: (
    patch?: Partial<InputState<TestAction>> & { press?: TestAction[]; deltaMs?: number },
  ) => void;
  created: ReturnType<typeof fakeScene>['created'];
}

let active: Harness | null = null;

function mount(services?: GameServices): Harness {
  controls.state = idle();
  controls.vibrate = [];
  controls.cancelled = 0;
  const fake = fakeScene();
  const scene = new WorldScene(services);
  const parent = document.createElement('div');
  document.body.append(parent);
  const camera = fakeObject('camera');
  Object.assign(camera, { width: 1280, height: 800 });
  const handlers = new Map<string, (...args: unknown[]) => void>();
  let shutdown = (): void => undefined;
  Object.assign(scene, {
    add: fake.add,
    cameras: { main: camera },
    scale: { on: vi.fn(), off: vi.fn() },
    game: { canvas: { parentElement: parent }, registry: { get: () => undefined } },
    input: {
      on: (name: string, handler: (...args: unknown[]) => void) => handlers.set(name, handler),
      off: vi.fn(),
    },
    events: { once: (_name: string, handler: () => void) => (shutdown = handler) },
  });
  scene.create();
  let time = 0;
  const harness: Harness = {
    scene,
    sim: (scene as unknown as { sim: Simulation }).sim,
    camera,
    parent,
    created: fake.created,
    wheel: (dy) => handlers.get('wheel')?.({}, [], 0, dy),
    shutdown: () => shutdown(),
    frame(patch = {}) {
      const state = idle();
      if (patch.move) state.move = patch.move;
      if (patch.aim) state.aim = patch.aim;
      for (const action of patch.press ?? []) state.actions[action] = true;
      controls.state = state;
      const delta = patch.deltaMs ?? 1000 / 60;
      time += delta;
      scene.update(time, delta);
    },
  };
  active = harness;
  return harness;
}

const pauseOpen = (parent: HTMLElement) => parent.querySelector('.vt-pause.vol-modal--visible');

afterEach(() => {
  active?.shutdown();
  active?.parent.remove();
  active = null;
});

describe('WorldScene', { timeout: 20_000 }, () => {
  it('ham, kabul edilen ve düşen süreyi gerçek saat raporundan ölçüme taşır', async () => {
    const frame = vi.fn();
    const services = await GameServices.create();
    Object.defineProperty(services, 'measurements', {
      value: { beginFrame: vi.fn(), mark: vi.fn(), frame },
    });
    const harness = mount(services);
    harness.frame({ deltaMs: 5000 });
    expect(frame).toHaveBeenLastCalledWith(
      expect.any(Number),
      false,
      expect.any(String),
      expect.any(Number),
      expect.any(Object),
      expect.objectContaining({
        'simulation.rawDeltaMs': 5000,
        'simulation.droppedMs': harness.scene.lastClockFrame?.droppedMs,
        'simulation.tickEnd': harness.scene.lastClockFrame?.tickEnd,
        vehicles: harness.sim.vehicles.length,
      }),
    );
    services.dispose();
  });
  it('sayfa terk edilince sesi söker; geri dönüş önbelleği ve kapanmış sahne etkilenmez', () => {
    const context = new FakeAudioContext();
    const audio = new GameAudio(
      context as unknown as AudioContext,
      context.destination as unknown as AudioNode,
    );
    const create = vi.spyOn(SceneAudio, 'createSceneAudio').mockReturnValue(audio);
    const load = vi.spyOn(audio, 'load').mockResolvedValue(undefined);
    const dispose = vi.spyOn(audio, 'dispose');
    try {
      const { shutdown } = mount();
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      expect(dispose).not.toHaveBeenCalled();
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
      expect(dispose).toHaveBeenCalledOnce();
      expect(context.gains.every((gain) => gain.disconnected)).toBe(true);
      shutdown();
      dispose.mockClear();
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      expect(dispose).not.toHaveBeenCalled();
      expect(load).toHaveBeenCalledOnce();
    } finally {
      create.mockRestore();
      load.mockRestore();
      dispose.mockRestore();
    }
  });

  it('ölçüm oturumunu istenen dünya ve kaliteyle açar, kalıcı tercihleri değiştirmez', async () => {
    localStorage.clear();
    const environment = vi.spyOn(Platform, 'getDiagnosticsEnv').mockResolvedValue({
      VOL_DECK_MEASURE: '1',
      VOL_DECK_SCENARIO: '40',
      VOL_DECK_SEED: '817',
      VOL_DECK_WEATHER: 'snow',
      VOL_DECK_SEASON: 'winter',
      VOL_DECK_QUALITY: 'low',
    });
    const services = await GameServices.create();
    environment.mockRestore();
    const { sim, parent, frame } = mount(services);
    frame();
    expect(sim.weather?.frame).toMatchObject({ kind: 'snow', season: 'winter' });
    expect(sim.vehicles.length).toBeGreaterThan(1);
    expect(parent.querySelector('.vt-hud__climate')?.textContent).toContain('Kış');
    expect(services.settings.get()).toMatchObject({
      quality: 'high',
      scenario: 'empty',
      seed: 731,
    });
    const vehicles = sim.vehicles.map((vehicle) => vehicle.id);
    await services.settings.update({ volume: 0.4, haptics: false });
    frame();
    expect(sim.vehicles.map((vehicle) => vehicle.id)).toEqual(vehicles);
    expect(services.settings.get().quality).toBe('high');
    expect(
      parent.querySelector('[data-testid="pause-quality"] button[aria-checked="true"]')
        ?.textContent,
    ).toContain('Düşük');
    active?.shutdown();
    active = null;
    await services.flush();
    services.dispose();
    parent.remove();
    expect(JSON.parse(localStorage.getItem('device.voltest.preferences')!)).toMatchObject({
      quality: 'high',
      scenario: 'empty',
      seed: 731,
      volume: 0.4,
      haptics: false,
    });
  });
  it('kalite tercihini, ilerlemeyi ve kabuktan gelen duraklatmayı servislerle yürütür', async () => {
    localStorage.clear();
    const services = await GameServices.create();
    let pauseFromShell: () => void = () => undefined;
    vi.spyOn(services, 'onPause').mockImplementation((listener) => {
      pauseFromShell = listener;
      return () => undefined;
    });
    const { sim, frame, parent } = mount(services);
    await services.settings.update({ quality: 'low', volume: 0.25 });
    for (let i = 0; i < 30; i++) frame({ move: new Vector2(1, 0), press: ['fire'] });
    expect(services.progress.get().distance).toBeGreaterThan(0);
    expect(services.progress.get().shots).toBeGreaterThan(0);
    pauseFromShell();
    const pausedAt = sim.timeMs;
    frame({ move: new Vector2(1, 0) });
    expect(sim.timeMs).toBe(pausedAt);
    const buttons = parent.querySelectorAll<HTMLButtonElement>(
      '[data-testid="pause-quality"] button',
    );
    buttons[0].click();
    await services.settings.flush();
    expect(services.settings.get().quality).toBe('high');
    parent.querySelector<HTMLButtonElement>('[data-testid="pause-resume"]')!.click();
    frame();
    expect(sim.timeMs).toBeGreaterThan(pausedAt);
    await services.flush();
    active?.shutdown();
    active = null;
    services.dispose();
    parent.remove();
  });

  it('pause ilk/son render ve sıfır tick resume tankın son çizilen pozunu korur', () => {
    const { frame, parent, created, sim } = mount();
    for (let step = 0; step < 30; step++) frame({ move: new Vector2(1, 0) });
    const root = created.find(
      (object) => object.kind === 'container' && lastCall(object, 'setPosition'),
    )!;
    const position = () => lastCall(root, 'setPosition');
    const before = position();
    const time = sim.timeMs;
    frame({ press: ['pause'], deltaMs: 0 });
    expect(position()).toEqual(before);
    frame({ deltaMs: 5000 });
    expect(position()).toEqual(before);
    parent.querySelector<HTMLButtonElement>('[data-testid="pause-resume"]')!.click();
    frame({ deltaMs: 0 });
    expect(position()).toEqual(before);
    expect(sim.timeMs).toBe(time);
  });

  it('ham uyku süresi ve pause clock raporunda görünür, dönüş saati biriktirmez', () => {
    const { scene, frame, parent } = mount();
    frame({ deltaMs: 5000 });
    expect(scene.lastClockFrame).toMatchObject({ rawDeltaMs: 5000, acceptedDeltaMs: 100 });
    expect(scene.lastClockFrame!.droppedMs).toBeGreaterThanOrEqual(4900);
    frame({ press: ['pause'], deltaMs: 5000 });
    expect(scene.lastClockFrame).toMatchObject({
      acceptedDeltaMs: 0,
      simulatedMs: 0,
      droppedMs: 5000,
    });
    const tick = scene.lastClockFrame!.tickEnd;
    parent.querySelector<HTMLButtonElement>('[data-testid="pause-resume"]')!.click();
    frame({ deltaMs: 0 });
    expect(scene.lastClockFrame).toMatchObject({ tickStart: tick, tickEnd: tick });
  });

  it('boş dünyayı kurar, kamerayı tankta açar ve HUD bağlar', () => {
    const { sim, camera, parent, frame } = mount();
    frame();
    const [x, y] = lastCall(camera, 'centerOn') as [number, number];
    expect(x).toBeCloseTo(sim.player.tank.x, 0);
    expect(y).toBeCloseTo(sim.player.tank.y, 0);
    expect(parent.querySelector('[data-testid="hud"]')).not.toBeNull();
  });

  it('hareket girdisi tankı sürer, kamera ve telemetri izler', () => {
    const { sim, frame, parent, camera } = mount();
    const start = sim.player.tank.x;
    for (let step = 0; step < 120; step++) frame({ move: new Vector2(1, 0) });
    expect(sim.player.tank.x).toBeGreaterThan(start + 100);
    const [x] = lastCall(camera, 'centerOn') as [number, number];
    expect(Math.abs(x - sim.player.tank.x)).toBeLessThan(40);
    expect(parent.querySelector('[data-testid="telemetry"]')!.textContent).toMatch(/m\/s/);
  });

  it('ateş mermi üretir, kamerayı atışın tersine iter ve titreşim çalar', () => {
    const { sim, frame, camera } = mount();
    frame();
    const [, before] = lastCall(camera, 'centerOn') as [number, number];
    frame({ press: ['fire'], aim: new Vector2(0, -1) });
    frame();
    frame();
    const [, after] = lastCall(camera, 'centerOn') as [number, number];
    expect(sim.projectiles.count).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(before);
    expect(controls.vibrate).toContain('tap');
  });

  it('duvar çarpması sarsıntı ve şiddete göre titreşim üretir', () => {
    const { sim, frame } = mount();
    sim.player.tank.place(sim.world.width - 90, sim.world.height / 2, 0);
    for (let step = 0; step < 90; step++) frame({ move: new Vector2(1, 0), press: ['boost'] });
    expect(controls.vibrate.some((pattern) => pattern === 'tap' || pattern === 'warning')).toBe(
      true,
    );
    expect(sim.player.tank.x + TANK.halfLength).toBeLessThanOrEqual(sim.world.width + 1e-6);
  });

  it('duraklatma simülasyonu dondurur, titreşimi keser; ikinci basış sürdürür', () => {
    const { sim, frame, parent } = mount();
    frame({ press: ['pause'] });
    expect(pauseOpen(parent)).not.toBeNull();
    expect(controls.cancelled).toBe(1);
    const x = sim.player.tank.x;
    for (let step = 0; step < 10; step++) frame({ move: new Vector2(1, 0) });
    expect(sim.player.tank.x).toBe(x);
    frame();
    frame({ press: ['pause'] });
    expect(pauseOpen(parent)).toBeNull();
    for (let step = 0; step < 30; step++) frame({ move: new Vector2(1, 0) });
    expect(sim.player.tank.x).toBeGreaterThan(x);
  });

  it('hava ve mevsim saati simülasyonla ilerler, duraklatmada durur', () => {
    const { sim, frame, parent } = mount();
    for (let step = 0; step < 60; step++) frame();
    expect(sim.weather?.frame.elapsedMs).toBeCloseTo(sim.timeMs);
    expect(parent.querySelector('.vt-hud__climate')?.textContent).toContain('İlkbahar');
    frame({ press: ['pause'] });
    const elapsed = sim.weather!.frame.elapsedMs;
    for (let step = 0; step < 60; step++) frame();
    expect(sim.weather!.frame.elapsedMs).toBe(elapsed);
  });

  it('modal düğmesiyle sürdürme aynı basışı yeniden duraklatmaz', () => {
    const { frame, parent } = mount();
    frame({ press: ['pause'] });
    parent.querySelector<HTMLButtonElement>('[data-testid="pause-resume"]')!.click();
    frame({ press: ['pause'] });
    expect(pauseOpen(parent)).toBeNull();
  });

  it('Android geri hareketi duraklatır ve sürdürür', () => {
    const { frame, parent } = mount();
    frame();
    triggerBack();
    expect(pauseOpen(parent)).not.toBeNull();
    triggerBack();
    expect(pauseOpen(parent)).toBeNull();
  });

  it('zoom kenarları ve tekerlek kamera zoom hedefini değiştirir', () => {
    const { frame, camera, wheel } = mount();
    frame();
    const base = camera.zoom as number;
    frame({ press: ['zoomIn'] });
    for (let step = 0; step < 30; step++) frame();
    expect(camera.zoom as number).toBeGreaterThan(base);
    wheel(120);
    wheel(120);
    for (let step = 0; step < 60; step++) frame();
    expect(camera.zoom as number).toBeLessThan(base);
    frame({ press: ['zoomOut'] });
  });

  it('ızgara kenarı ızgarayı aç/kapa yapar, sınır kalır', () => {
    const { frame, created } = mount();
    const [, grid, border] = created.filter((object) => object.kind === 'graphics');
    frame({ press: ['grid'] });
    expect(grid.visible).toBe(false);
    expect(border.visible).toBe(true);
    frame();
    frame({ press: ['grid'] });
    expect(grid.visible).toBe(true);
  });

  it('simülasyona eklenen araç görünüm kazanır, kaldırılınca sökülür', () => {
    const { sim, frame, created } = mount();
    frame();
    const containers = () => created.filter((object) => object.kind === 'container').length;
    const before = containers();
    const other = sim.spawn(sim.player.tank.x + 300, sim.player.tank.y, 0);
    frame();
    expect(containers()).toBeGreaterThan(before);
    sim.despawn(other.id);
    frame();
    const roots = created.filter((object) => object.kind === 'container');
    expect(roots.some((root) => lastCall(root, 'destroy'))).toBe(true);
  });

  it('kapanışta HUD ve dinleyiciler kaldırılır', () => {
    const { shutdown, parent } = mount();
    shutdown();
    expect(parent.querySelector('[data-testid="hud"]')).toBeNull();
    active = null;
  });
});

describe('BootScene', () => {
  it('parçaları yükler, dokuları üretir ve dünyayı başlatır', () => {
    const fake = fakeScene();
    const scene = new BootScene();
    const start = vi.fn();
    const emit = vi.fn();
    Object.assign(scene, {
      load: fake.load,
      textures: fake.textures,
      scene: { start },
      game: { events: { emit } },
    });
    scene.preload();
    const onProgress = fake.load.on.mock.calls[0][1] as (value: number) => void;
    onProgress(0.4);
    expect(emit).toHaveBeenCalledWith('vol-test:boot-progress', 0.4);
    scene.create();
    expect(emit).toHaveBeenCalledWith('vol-test:boot-ready');
    expect(fake.load.svg).toHaveBeenCalled();
    expect(fake.textures.addCanvas).toHaveBeenCalled();
    expect(start).toHaveBeenCalledWith('World');
  });
});
