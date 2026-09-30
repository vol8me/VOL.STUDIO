import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as CoreModule from '@volstudio/core';
import { triggerBack, Vector2, type InputState } from '@volstudio/core';
import { TANK } from '@/config/tank';
import { TEST_ACTIONS, type TestAction } from '@/input/bindings';
import type { Simulation } from '@/sim/Simulation';
import { WorldScene } from '@/scenes/WorldScene';
import { BootScene } from '@/scenes/BootScene';
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
  camera: ReturnType<typeof fakeObject>;
  parent: HTMLElement;
  wheel: (dy: number) => void;
  shutdown: () => void;
  frame: (patch?: Partial<InputState<TestAction>> & { press?: TestAction[] }) => void;
  created: ReturnType<typeof fakeScene>['created'];
}

let active: Harness | null = null;

function mount(): Harness {
  controls.state = idle();
  controls.vibrate = [];
  controls.cancelled = 0;
  const fake = fakeScene();
  const scene = new WorldScene();
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
      time += 1000 / 60;
      scene.update(time, 1000 / 60);
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
  it('boş dünyayı kurar, kamerayı tankta açar ve HUD bağlar', () => {
    const { sim, camera, parent, frame } = mount();
    frame();
    const [x, y] = lastCall(camera, 'centerOn') as [number, number];
    expect(x).toBeCloseTo(sim.tank.x, 0);
    expect(y).toBeCloseTo(sim.tank.y, 0);
    expect(parent.querySelector('[data-testid="hud"]')).not.toBeNull();
  });

  it('hareket girdisi tankı sürer, kamera ve telemetri izler', () => {
    const { sim, frame, parent, camera } = mount();
    const start = sim.tank.x;
    for (let step = 0; step < 120; step++) frame({ move: new Vector2(1, 0) });
    expect(sim.tank.x).toBeGreaterThan(start + 100);
    const [x] = lastCall(camera, 'centerOn') as [number, number];
    expect(Math.abs(x - sim.tank.x)).toBeLessThan(40);
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
    sim.tank.place(sim.world.width - 90, sim.world.height / 2, 0);
    for (let step = 0; step < 90; step++) frame({ move: new Vector2(1, 0), press: ['boost'] });
    expect(controls.vibrate.some((pattern) => pattern === 'tap' || pattern === 'warning')).toBe(
      true,
    );
    expect(sim.tank.x + TANK.halfLength).toBeLessThanOrEqual(sim.world.width + 1e-6);
  });

  it('duraklatma simülasyonu dondurur, titreşimi keser; ikinci basış sürdürür', () => {
    const { sim, frame, parent } = mount();
    frame({ press: ['pause'] });
    expect(pauseOpen(parent)).not.toBeNull();
    expect(controls.cancelled).toBe(1);
    const x = sim.tank.x;
    for (let step = 0; step < 10; step++) frame({ move: new Vector2(1, 0) });
    expect(sim.tank.x).toBe(x);
    frame();
    frame({ press: ['pause'] });
    expect(pauseOpen(parent)).toBeNull();
    for (let step = 0; step < 30; step++) frame({ move: new Vector2(1, 0) });
    expect(sim.tank.x).toBeGreaterThan(x);
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
    Object.assign(scene, { load: fake.load, textures: fake.textures, scene: { start } });
    scene.preload();
    scene.create();
    expect(fake.load.svg).toHaveBeenCalled();
    expect(fake.textures.addCanvas).toHaveBeenCalled();
    expect(start).toHaveBeenCalledWith('World');
  });
});
