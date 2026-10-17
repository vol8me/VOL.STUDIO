import Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import type * as Textures from '@/view/textures';
import { SPIDER_PARTS } from '@/config/spiders';
import { WALKER_IDS } from '@/config/vehicles';
import { BootScene } from '@/scenes/BootScene';

vi.mock('@/view/textures', async (importOriginal) => ({
  ...(await importOriginal<typeof Textures>()),
  createRuntimeTextures: vi.fn(),
}));

function created(services?: { measurements?: object }, search = '') {
  history.replaceState(null, '', `/${search}`);
  const scene = new BootScene(services as never);
  const start = vi.fn();
  const emit = vi.fn();
  Object.assign(scene, { scene: { start }, game: { events: { emit } } });
  scene.create();
  history.replaceState(null, '', '/');
  return { start, emit };
}

describe('BootScene', () => {
  it('dokular hazır olunca hazır olayını yayar ve oyuncuyu ana menüye açar', () => {
    const { start, emit } = created({});
    expect(emit).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith('Menu');
  });

  it('start=world bağlantısı ve ölçüm koşusu menüyü atlar', () => {
    expect(created({}, '?start=world').start).toHaveBeenCalledWith('World');
    expect(created({ measurements: {} }).start).toHaveBeenCalledWith('World');
  });

  it('gölgelendirici ısınması bitene dek hazır olayı ve ilk sahne beklenir', () => {
    history.replaceState(null, '', '/');
    const scene = new BootScene({} as never);
    const start = vi.fn();
    const emit = vi.fn();
    const frames: Array<() => void> = [];
    const keys = new Set<string>();
    const image = () => {
      const chain = {
        setOrigin: () => chain,
        setScrollFactor: () => chain,
        setAlpha: () => chain,
        setVisible: () => chain,
        destroy: () => undefined,
      };
      return chain;
    };
    Object.assign(scene, {
      scene: { start },
      game: { events: { emit } },
      sys: { game: { renderer: { type: Phaser.WEBGL, maxTextures: 2 } } },
      textures: {
        exists: (key: string) => keys.has(key),
        addCanvas: (key: string) => keys.add(key),
        remove: (key: string) => keys.delete(key),
      },
      add: { image },
      events: {
        on: (_name: string, listener: () => void) => frames.push(listener),
        off: () => undefined,
      },
    });
    scene.create();
    expect(start).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    for (let frame = 0; frame < 3; frame++) [...frames].forEach((listener) => listener());
    expect(emit).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith('Menu');
  });

  it('tank SVG parçalarının yanında iki örümceğin her parçasını SVG olarak yükler', () => {
    const scene = new BootScene();
    const load = { on: vi.fn(), svg: vi.fn(), image: vi.fn() };
    Object.assign(scene, {
      load,
      textures: { exists: () => false },
      game: { events: { emit: vi.fn() } },
    });
    scene.preload();

    const keys = load.svg.mock.calls.map(([key]) => key as string);
    for (const look of WALKER_IDS)
      for (const part of SPIDER_PARTS) expect(keys).toContain(`spider-${look}-${part}`);
    expect(load.image).not.toHaveBeenCalled();
  });
});
