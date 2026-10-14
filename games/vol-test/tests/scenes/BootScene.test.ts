import { describe, expect, it, vi } from 'vitest';
import { ARACHNID_RIG, PLASMA_CANNON_RIG } from '@/config/rigAssets';
import { BootScene } from '@/scenes/BootScene';

describe('BootScene', () => {
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
