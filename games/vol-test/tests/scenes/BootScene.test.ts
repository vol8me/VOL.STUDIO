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
