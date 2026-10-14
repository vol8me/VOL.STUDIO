import { describe, expect, it, vi } from 'vitest';
import type * as Textures from '@/view/textures';
import { ARACHNID_RIG, PLASMA_CANNON_RIG } from '@/config/rigAssets';
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

  it('tank SVG parçalarının yanında arachnid ve plazma topu rig dokularını yükler', () => {
    const scene = new BootScene();
    const load = { on: vi.fn(), svg: vi.fn(), image: vi.fn() };
    Object.assign(scene, {
      load,
      textures: { exists: () => false },
      game: { events: { emit: vi.fn() } },
    });
    scene.preload();

    const keys = load.image.mock.calls.map(([key]) => key as string);
    const expected = [...ARACHNID_RIG.parts, ...PLASMA_CANNON_RIG.parts].map(
      (part) => part.textureKey,
    );
    expect(keys.sort()).toEqual(expected.sort());
    expect(load.svg).toHaveBeenCalled();
  });
});
