import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as CoreModule from '@volstudio/core';
import type { GameServices } from '@/app/GameServices';
import { BACKDROP } from '@/config/backdrop';
import { BackdropScene, paradeUnits } from '@/scenes/BackdropScene';
import { MENU_AREA_KEY, MENU_DIM_KEY } from '@/view/menuLayout';
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
    events: {
      once: (_name: string, handler: () => void) => (shutdown = handler),
      on: () => undefined,
      off: () => undefined,
    },
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

describe('BackdropScene', { timeout: 30_000 }, () => {
  it('kurulur kurulmaz görünmezdir ama alay hazırdır; sonra yavaşça belirir', () => {
    const harness = mount();
    expect(lastCall(harness.camera, 'setAlpha')).toEqual([0]);
    // Ön ısınma yoktur: araç görünümleri kurulurken (ilk güncellemeden önce) vardır.
    expect(harness.created.some((object) => object.kind === 'image')).toBe(true);
    harness.update();
    harness.update(BACKDROP.fadeInMs / 4);
    const alpha = lastCall(harness.camera, 'setAlpha')![0] as number;
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
    harness.update(BACKDROP.fadeInMs * 2);
    expect(lastCall(harness.camera, 'setAlpha')).toEqual([1]);
  });

  it('karartma menü ekranının istediği seviyeye süzülür: garajda koyulaşır, çıkınca açılır', () => {
    const harness = mount();
    const scrim = harness.created.find(
      (object) => object.kind === 'rectangle' && object.args[4] === 0x000000,
    )!;
    const level = (): number => lastCall(scrim, 'setFillStyle')![1] as number;
    harness.update();
    expect(level()).toBeCloseTo(BACKDROP.dim.alpha);
    harness.registry.set(MENU_DIM_KEY, BACKDROP.dim.showcase);
    harness.update(BACKDROP.dim.easeMs / 4);
    expect(level()).toBeGreaterThan(BACKDROP.dim.alpha);
    expect(level()).toBeLessThan(BACKDROP.dim.showcase);
    harness.update(BACKDROP.dim.easeMs * 2);
    expect(level()).toBeCloseTo(BACKDROP.dim.showcase);
    harness.registry.set(MENU_DIM_KEY, BACKDROP.dim.alpha);
    harness.update(BACKDROP.dim.easeMs * 2);
    expect(level()).toBeCloseTo(BACKDROP.dim.alpha);
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

  it('düşük kalite alay sayısını çalışma anında sınırlar; eski kayıtlı yoğunluk da hafif kalır', () => {
    expect(paradeUnits('high', BACKDROP.density.default)).toBe(BACKDROP.density.default);
    expect(paradeUnits('low', BACKDROP.density.default)).toBe(BACKDROP.density.low);
    expect(paradeUnits('low', BACKDROP.density.min)).toBe(BACKDROP.density.min);
    const harness = mount({ backdropDensity: BACKDROP.density.default });
    harness.update();
    // Yüksekten düşüğe geçmek alayı seyreltir (baştan kurulur); sınırın üstündeki ayar bir şey değiştirmez.
    harness.push({ quality: 'low' });
    expect(harness.restart).toHaveBeenCalledTimes(1);
    harness.push({ backdropDensity: BACKDROP.density.max });
    expect(harness.restart).toHaveBeenCalledTimes(1);
  });

  it('mevsim ayarıyla açılır ve savaş sürerken kareler hatasız ilerler', () => {
    const harness = mount({ season: 'winter', weather: 'snow' });
    for (let frame = 0; frame < 120; frame++) harness.update();
    expect(harness.created.some((object) => object.kind === 'graphics')).toBe(true);
  });
});
