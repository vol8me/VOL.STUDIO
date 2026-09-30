import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { createRuntimeTextures, queueTankTextures, TEXTURE, TEXTURE_SCALE } from '@/view/textures';
import { fakeScene } from '../support/fakeScene';

describe('textures', () => {
  it('tank parçalarını ölçekli SVG olarak kuyruğa ekler', () => {
    const scene = fakeScene();
    queueTankTextures(scene.load as unknown as Phaser.Loader.LoaderPlugin);
    expect(scene.load.svg).toHaveBeenCalledTimes(7);
    expect(scene.load.svg).toHaveBeenCalledWith(TEXTURE.treadEnd, expect.any(String), {
      scale: TEXTURE_SCALE,
    });
  });

  it('çalışma anı dokularını bir kez üretir', () => {
    const scene = fakeScene();
    createRuntimeTextures(scene as unknown as Phaser.Scene);
    createRuntimeTextures(scene as unknown as Phaser.Scene);
    const keys = scene.textures.addCanvas.mock.calls.map((call) => String(call[0]));
    expect(keys.sort()).toEqual(
      [TEXTURE.mark, TEXTURE.skid, TEXTURE.spark, TEXTURE.treadBase].sort(),
    );
  });
});
