import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as CoreModule from '@volstudio/core';
import type { GameServices } from '@/app/GameServices';
import { BACKDROP } from '@/config/backdrop';
import { BackdropScene } from '@/scenes/BackdropScene';
import { MENU_AREA_KEY } from '@/view/menuLayout';
import { fakeObject, fakeScene, lastCall } from '../support/fakeScene';

vi.mock('@volstudio/core', async (importOriginal) => ({
  ...(await importOriginal<typeof CoreModule>()),
  applyVolViewport: vi.fn(),
}));

interface Harness {
  scene: BackdropScene;
  camera: ReturnType<typeof fakeObject>;
  registry: Map<string, unknown>;
  active: Set<string>;
  stop: ReturnType<typeof vi.fn>;
  restart: ReturnType<typeof vi.fn>;
  update: (deltaMs?: number) => void;
  push: (patch: Record<string, unknown>) => void;
  shutdown: () => void;
  created: ReturnType<typeof fakeScene>['created'];
}

let active: Harness | undefined;

function mount(preferences: Record<string, unknown> = {}): Harness {
  const fake = fakeScene();
  const camera = fakeObject('camera');
  Object.assign(camera, { width: 1280, height: 800 });
  const registry = new Map<string, unknown>();
  const running = new Set<string>();
  const stop = vi.fn();
  const restart = vi.fn();
  let shutdown = (): void => undefined;
  let state = {
    quality: 'high',
    season: 'auto',
    weather: 'auto',
    backdrop: true,
    backdropDensity: 2,
    ...preferences,
  };
  const listeners = new Set<(value: typeof state) => void>();
  const services = {
    settings: {
      get: () => state,
      subscribe: (listener: (value: typeof state) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    overrides: undefined,
  } as unknown as GameServices;
  const scene = new BackdropScene(services);
  Object.assign(scene, {
    add: fake.add,
    make: fake.make,
    textures: { ...fake.textures, exists: () => true },
    cameras: { main: camera },
    scale: { on: vi.fn(), off: vi.fn() },
    game: {
      registry: {
        get: (key: string) => registry.get(key),
      },
    },
    events: { once: (_name: string, handler: () => void) => (shutdown = handler) },
    scene: { isActive: (key: string) => running.has(key), stop, restart },
  });
  scene.create();
  let time = 0;
  const harness: Harness = {
    scene,
    camera,
    registry,
    active: running,
    stop,
    restart,
    created: fake.created,
    update(deltaMs = 1000 / 60) {
      time += deltaMs;
      scene.update(time, deltaMs);
    },
    push(patch) {
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state);
    },
    shutdown: () => shutdown(),
  };
  active = harness;
  return harness;
}

afterEach(() => {
  active?.shutdown();
  active = undefined;
});

const preroll = (harness: Harness): void => {
  const frames = Math.ceil(BACKDROP.prerollMs / BACKDROP.prerollPerFrameMs) + 1;
  for (let frame = 0; frame < frames; frame++) harness.update();
};

describe('BackdropScene', { timeout: 30_000 }, () => {
  it('kurulur kurulmaz görünmezdir; ileri sarım bitince savaş görünümleri kurulur ve belirir', () => {
    const harness = mount();
    expect(lastCall(harness.camera, 'setAlpha')).toEqual([0]);
    const before = harness.created.length;
    harness.update();
    // İleri sarım süresince görünüm kurulmaz.
    expect(harness.created.length).toBe(before);
    preroll(harness);
    expect(harness.created.length).toBeGreaterThan(before);
    harness.update(BACKDROP.fadeInMs / 4);
    const alpha = lastCall(harness.camera, 'setAlpha')![0] as number;
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
    harness.update(BACKDROP.fadeInMs * 2);
    expect(lastCall(harness.camera, 'setAlpha')).toEqual([1]);
  });

  it('dünya sahnesi açılınca kendini durdurur', () => {
    const harness = mount();
    harness.update();
    expect(harness.stop).not.toHaveBeenCalled();
    harness.active.add('World');
    harness.update();
    expect(harness.stop).toHaveBeenCalledTimes(1);
  });

  it('menü boş alanını okuyup odağı oraya kurar; alan yoksa tüm ekranı kullanır', () => {
    const harness = mount();
    preroll(harness);
    harness.update();
    const full = lastCall(harness.camera, 'centerOn');
    expect(full).toBeDefined();
    harness.registry.set(MENU_AREA_KEY, { x: 0, y: 0, width: 640, height: 800 });
    harness.update();
    // Boş alan ekranın sol yarısında: kamera hedefi odaktan sağa kayar (odak solda görünür).
    const shifted = lastCall(harness.camera, 'centerOn');
    expect(shifted).toBeDefined();
    expect(shifted![0] as number).not.toBe(full![0] as number);
  });

  it('ayar değişimi yalnız ilgili parçayı yeniler; yoğunluk değişince savaş baştan kurulur', () => {
    const harness = mount();
    preroll(harness);
    harness.update();
    harness.push({ volume: 0.3 });
    expect(harness.restart).not.toHaveBeenCalled();
    harness.push({ season: 'winter', weather: 'snow' });
    harness.update();
    expect(harness.restart).not.toHaveBeenCalled();
    harness.push({ quality: 'low' });
    harness.update();
    expect(harness.restart).not.toHaveBeenCalled();
    harness.push({ backdropDensity: 6 });
    expect(harness.restart).toHaveBeenCalledTimes(1);
  });

  it('mevsim ayarıyla açılır ve savaş sürerken kareler hatasız ilerler', () => {
    const harness = mount({ season: 'winter', weather: 'snow' });
    preroll(harness);
    for (let frame = 0; frame < 120; frame++) harness.update();
    expect(harness.created.some((object) => object.kind === 'graphics')).toBe(true);
  });
});
