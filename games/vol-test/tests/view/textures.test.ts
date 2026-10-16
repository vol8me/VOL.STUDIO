import type Phaser from 'phaser';
import { describe, expect, it, type vi } from 'vitest';
import { DEBRIS } from '@/config/debris';
import { FX } from '@/config/fx';
import { tankSpecs } from '@/config/tankView';
import { HOVER_IDS, LEAPER_IDS, MECH_IDS } from '@/config/vehicles';
import { SHIELD_TEXTURE } from '@/view/spider/shieldTextures';
import {
  createRuntimeTextures,
  queueHoverTextures,
  queueTankTextures,
  hoverTexture,
  mechTexture,
  TEXTURE,
  TEXTURE_SCALE,
  shardTexture,
  tankTexture,
  treadBandTexture,
  treadFrame,
  VEHICLE_ATLAS,
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

  it('süzülen araç, mech ve sıçrayıcı parçalarını ölçekli SVG olarak kuyruğa ekler; dosyaları ayrıdır', () => {
    const scene = fakeScene();
    queueHoverTextures(scene.load as unknown as Phaser.Loader.LoaderPlugin);
    const keys = scene.load.svg.mock.calls.map((call) => String(call[0]));
    const hovers = HOVER_IDS.flatMap((id) =>
      [
        ...(['fan', 'hull', 'pod', 'turret'] as const),
        ...(id === 'leviathan' ? (['gun'] as const) : []),
      ].map((part) => hoverTexture(id, part)),
    );
    const core = ['hull', 'thigh', 'shin', 'joint', 'foot', 'arm'] as const;
    // Sıçrayıcı hayvandır: kafa ve kuyruk ayrı parçadır, mech'te yoktur.
    const mechs = [
      ...MECH_IDS.flatMap((id) => core.map((part) => mechTexture(id, part))),
      ...LEAPER_IDS.flatMap((id) =>
        [...core, 'head' as const, 'tail' as const].map((part) => mechTexture(id, part)),
      ),
    ];
    expect(keys.sort()).toEqual([...hovers, ...mechs].sort());
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
        TEXTURE.bootPrint,
        TEXTURE.footPrint,
        TEXTURE.ring,
        TEXTURE.scorch,
        ...Array.from({ length: DEBRIS.shardVariants }, (_, variant) => shardTexture(variant)),
        ...Object.values(SHIELD_TEXTURE),
        TEXTURE.skid,
        TEXTURE.spark,
        TEXTURE.treadBase,
        TEXTURE.treadPrint,
        VEHICLE_ATLAS,
        ...bands,
      ].sort(),
    );
  });

  it('efekt dokuları ve tank parçaları araç atlasına taşınır: ayrı doku kalmaz, kare adı eski anahtardır', () => {
    const scene = fakeScene();
    createRuntimeTextures(scene as unknown as Phaser.Scene);
    const index = scene.textures.addCanvas.mock.calls.findIndex(
      (call) => call[0] === VEHICLE_ATLAS,
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const atlas = scene.textures.addCanvas.mock.results[index].value as {
      add: ReturnType<typeof vi.fn>;
    };
    const frames = atlas.add.mock.calls.map((call) => String(call[0]));
    const effects = [
      TEXTURE.antenna,
      TEXTURE.spark,
      TEXTURE.treadBase,
      TEXTURE.skid,
      TEXTURE.treadPrint,
      TEXTURE.footPrint,
      TEXTURE.bootPrint,
      TEXTURE.scorch,
      TEXTURE.ring,
      TEXTURE.blast,
      TEXTURE.core,
      TEXTURE.flash,
      TEXTURE.treadEnd,
      ...Array.from({ length: DEBRIS.shardVariants }, (_, variant) => shardTexture(variant)),
      ...Object.values(SHIELD_TEXTURE),
    ];
    const tanks = tankSpecs().flatMap((spec) =>
      (['hull', 'turret', 'feeler'] as const).map((part) => tankTexture(spec.id, part)),
    );
    for (const frame of [...effects, ...tanks]) {
      expect(frames).toContain(frame);
      expect(scene.textures.remove).toHaveBeenCalledWith(frame);
    }
    // Palet izi çerçeveleri aynı atlas karesinin alt dikdörtgenleridir.
    for (let steps = 1; steps <= FX.marks.maxGrousers; steps++)
      expect(frames).toContain(treadFrame(steps));
    expect(new Set(frames).size).toBe(frames.length);
    // Palet bandı kare sayfası ve TileSprite dokusu (`tank-tread`) atlasa girmez.
    expect(frames).not.toContain(TEXTURE.tread);
    for (const spec of tankSpecs()) expect(frames).not.toContain(treadBandTexture(spec.id));
  });
});
