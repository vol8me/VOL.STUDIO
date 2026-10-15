import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { DEBRIS } from '@/config/debris';
import { tankSpecs } from '@/config/tankView';
import {
  createRuntimeTextures,
  queueHoverTextures,
  queueTankTextures,
  hoverTexture,
  TEXTURE,
  TEXTURE_SCALE,
  shardTexture,
  tankTexture,
  treadBandTexture,
} from '@/view/textures';
import { fakeScene } from '../support/fakeScene';

describe('textures', () => {
  it('ortak ve araca özgü tank parçalarını ölçekli SVG olarak kuyruğa ekler', () => {
    const scene = fakeScene();
    queueTankTextures(scene.load as unknown as Phaser.Loader.LoaderPlugin);
    const shared = [TEXTURE.tread, TEXTURE.treadEnd, TEXTURE.core, TEXTURE.flash];
    const own = tankSpecs().flatMap((spec) =>
      (['hull', 'turret', 'feeler'] as const).map((part) => tankTexture(spec.id, part)),
    );
    const keys = scene.load.svg.mock.calls.map((call) => String(call[0]));
    expect(keys.sort()).toEqual([...shared, ...own].sort());
    expect(new Set(keys).size).toBe(keys.length);
    expect(scene.load.svg).toHaveBeenCalledWith(TEXTURE.treadEnd, expect.any(String), {
      scale: TEXTURE_SCALE,
    });
  });

  it('süzülen araç parçalarını ölçekli SVG olarak kuyruğa ekler; dosyaları ayrıdır', () => {
    const scene = fakeScene();
    queueHoverTextures(scene.load as unknown as Phaser.Loader.LoaderPlugin);
    const keys = scene.load.svg.mock.calls.map((call) => String(call[0]));
    expect(keys.sort()).toEqual(
      (['fan', 'hull', 'pod', 'turret'] as const).map((part) => hoverTexture('manta', part)).sort(),
    );
    const urls = scene.load.svg.mock.calls.map((call) => String(call[1]));
    expect(new Set(urls).size).toBe(urls.length);
    // Çözülmeyen desen `undefined` adresini kuyruğa sokardı.
    expect(urls.every((url) => url !== 'undefined' && url.length > 0)).toBe(true);
    expect(scene.load.svg).toHaveBeenCalledWith(keys[0], expect.any(String), {
      scale: TEXTURE_SCALE,
    });
  });

  it('araç parçalarının dosyaları ayrıdır', () => {
    const scene = fakeScene();
    queueTankTextures(scene.load as unknown as Phaser.Loader.LoaderPlugin);
    const urls = scene.load.svg.mock.calls.map((call) => String(call[1]));
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('çalışma anı dokularını bir kez üretir; her araç kendi palet bandını alır', () => {
    const scene = fakeScene();
    createRuntimeTextures(scene as unknown as Phaser.Scene);
    createRuntimeTextures(scene as unknown as Phaser.Scene);
    const bands = tankSpecs().map((spec) => treadBandTexture(spec.id));
    expect(scene.textures.addSpriteSheet).toHaveBeenCalledTimes(bands.length);
    expect(scene.textures.addSpriteSheet.mock.calls.map((call) => String(call[0])).sort()).toEqual(
      [...bands].sort(),
    );
    const keys = scene.textures.addCanvas.mock.calls.map((call) => String(call[0]));
    expect(keys.sort()).toEqual(
      [
        TEXTURE.antenna,
        TEXTURE.blast,
        TEXTURE.footPrint,
        TEXTURE.ring,
        TEXTURE.scorch,
        ...Array.from({ length: DEBRIS.shardVariants }, (_, variant) => shardTexture(variant)),
        TEXTURE.skid,
        TEXTURE.spark,
        TEXTURE.treadBase,
        TEXTURE.treadPrint,
        ...bands,
      ].sort(),
    );
  });
});
