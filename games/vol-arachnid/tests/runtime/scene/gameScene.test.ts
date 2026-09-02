import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { fullscreenControllers, inputManagers } = vi.hoisted(() => ({
  fullscreenControllers: [] as Array<{ destroyed: boolean; toggle: () => void }>,
  inputManagers: [] as Array<{ destroyed: boolean }>,
}));

vi.mock('@volstudio/core', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@volstudio/core');
  const Vector2 = actual.Vector2 as new (x: number, y: number) => unknown;

  class FakeInputManager {
    destroyed = false;

    constructor() {
      inputManagers.push(this);
    }

    update(): void {}

    getState(): unknown {
      return { move: new Vector2(0, 0), actions: { dash: false } };
    }

    destroy(): void {
      this.destroyed = true;
    }
  }

  class FakeFullscreenController {
    destroyed = false;
    readonly toggle = vi.fn();

    constructor() {
      fullscreenControllers.push(this);
    }

    destroy(): void {
      this.destroyed = true;
    }
  }

  return {
    ...actual,
    // Gerçek girdi yığını Phaser'ın klavye/pointer eklentilerini ister; ölçülen
    // şey sahnenin YAŞAM DÖNGÜSÜ, girdi motoru değil.
    InputManager: FakeInputManager,
    FullscreenController: FakeFullscreenController,
    applyVolViewport: () => {},
  };
});

import { i18n, i18next } from '@volstudio/core';
import { arenaConfig } from '@/config/arena';
import tr from '@/i18n/tr.json';
import en from '@/i18n/en.json';
import '@/i18next-augment';
import { GameScene } from '@/runtime/scene/GameScene';
import { createFakeScene, type FakeScene } from '../../support/phaserFakes';

interface SceneHarness {
  scene: GameScene;
  fake: FakeScene;
  shutdown: () => void;
}

function attach(scene: GameScene, fake: FakeScene): void {
  for (const [key, value] of Object.entries({
    textures: fake.textures,
    load: fake.load,
    add: fake.add,
    cameras: fake.cameras,
    scale: fake.scale,
    events: fake.events,
    game: fake.game,
  })) {
    Object.defineProperty(scene, key, { value, configurable: true, writable: true });
  }
}

function boot(): SceneHarness {
  const scene = new GameScene();
  const fake = createFakeScene();
  attach(scene, fake);
  scene.preload();
  scene.create();

  const shutdownCall = fake.events.once.mock.calls[0];
  const shutdown = () => (shutdownCall[1] as () => void).call(shutdownCall[2]);
  return { scene, fake, shutdown };
}

describe('GameScene yaşam döngüsü', () => {
  beforeAll(async () => {
    i18n.addResources('tr', 'arachnid', tr);
    i18n.addResources('en', 'arachnid', en);
    await i18n.init();
    await i18next.changeLanguage('tr');
  });

  beforeEach(() => {
    fullscreenControllers.length = 0;
    inputManagers.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('create tüm çalışma zamanını kurar, shutdown hepsini toplar', () => {
    const { fake, shutdown } = boot();

    expect(fake.graphics.length).toBeGreaterThanOrEqual(2);
    expect(fake.emitters).toHaveLength(1);
    expect(document.querySelector('.vol-arachnid-hud')).not.toBeNull();
    expect(fake.scale.on).toHaveBeenCalledTimes(1);

    shutdown();

    expect(inputManagers[0].destroyed).toBe(true);
    expect(fullscreenControllers[0].destroyed).toBe(true);
    expect(fake.emitters[0].destroyed).toBe(true);
    expect(fake.graphics[0].destroyed).toBe(true);
    expect(fake.scale.off).toHaveBeenCalledTimes(1);
    expect(fake.events.off).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.vol-arachnid-hud')).toBeNull();
  });

  it('kamerayı arenayı boşlukların İÇİNE alacak şekilde kurar', () => {
    const { fake } = boot();

    const camera = fake.cameras.main;
    const gutter = arenaConfig.viewportGutterPx;
    const availableWidth = 1280 - gutter.left - gutter.right;
    const availableHeight = 720 - gutter.top - gutter.bottom;
    const expectedFit =
      Math.min(availableWidth / arenaConfig.widthPx, availableHeight / arenaConfig.heightPx) *
      arenaConfig.fitMargin;

    expect(camera.zoom).toBeCloseTo(expectedFit, 9);
    // Arena, sol boşluk sağdakinden geniş olduğu için sağa kaydırılır: kamera
    // merkezi ters yönde, yani sola gider.
    expect(camera.centeredOn?.x).toBeLessThan(arenaConfig.widthPx / 2);
    expect(camera.centeredOn?.y).toBeGreaterThan(arenaConfig.heightPx / 2);
    // Arena sığdırılmış hâliyle boşlukların içinde kalır.
    expect(arenaConfig.widthPx * expectedFit).toBeLessThanOrEqual(availableWidth);
    expect(arenaConfig.heightPx * expectedFit).toBeLessThanOrEqual(availableHeight);
  });

  it('her resize önceki bekleyen kamera karesini İPTAL eder', () => {
    let nextHandle = 1;
    const pending = new Set<number>();
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => {
      const handle = nextHandle++;
      pending.add(handle);
      return handle;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((handle) => {
      pending.delete(handle);
    });

    const { fake, shutdown } = boot();
    const resize = fake.scale.on.mock.calls[0];
    const handler = () => (resize[1] as () => void).call(resize[2]);

    handler();
    handler();
    handler();

    // Üç resize, tek bekleyen kare: eskiler iptal edilmiş olmalı.
    expect(pending.size).toBe(1);

    shutdown();
    expect(pending.size).toBe(0);
  });

  it('kurulum patladıktan sonra update sessizce hiçbir şey yapmaz', () => {
    const scene = new GameScene();
    const fake = createFakeScene();
    attach(scene, fake);
    scene.preload();
    const original = fake.add.particles;
    fake.add.particles = () => {
      throw new Error('emitter kurulamadı');
    };
    expect(() => scene.create()).toThrow();
    fake.add.particles = original;

    // Phaser sahneyi durdurmaz; korumasız bir kare akışı her karede aynı
    // hatayı fırlatırdı.
    expect(() => scene.update(0, 16)).not.toThrow();
  });

  it('shutdown sonrası update de sessizdir', () => {
    const { scene, shutdown } = boot();
    shutdown();

    expect(() => scene.update(0, 16)).not.toThrow();
  });

  it('kurulum yarıda patlarsa açılan kaynakları geride bırakmaz', () => {
    const scene = new GameScene();
    const fake = createFakeScene();
    const failure = new Error('emitter kurulamadı');
    attach(scene, fake);
    scene.preload();

    const original = fake.add.particles;
    fake.add.particles = () => {
      throw failure;
    };

    expect(() => scene.create()).toThrow(failure);
    fake.add.particles = original;

    // Arena çizim katmanları emitter'dan ÖNCE kurulur; hepsi toplanmalı.
    expect(fake.graphics.every((item) => item.destroyed)).toBe(true);
    expect(fake.events.off).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.vol-arachnid-hud')).toBeNull();
  });

  it('update gövdeyi sürer, rigi taşır ve HUD değerlerini tazeler', () => {
    const { scene, fake, shutdown } = boot();

    for (let i = 0; i < 10; i++) scene.update(i * 16, 16);

    const speed = document.querySelector('.vol-arachnid-hud__speed')?.textContent;
    expect(speed).toBe('0 px/sn');
    // Gölge her karede pozu örnekler: rig parçaları kadar sprite üretilir.
    expect(fake.images.length).toBeGreaterThan(60);

    shutdown();
  });
});
