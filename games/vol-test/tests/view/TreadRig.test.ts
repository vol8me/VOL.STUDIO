import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { tankSpecs, treadView } from '@/config/tankView';
import { STRIKER } from '@/config/vehicles';
import { TreadRig } from '@/view/TreadRig';
import { treadBandTexture } from '@/view/textures';
import { fakeScene, lastCall } from '../support/fakeScene';

describe('TreadRig', () => {
  it('ortak görüntü kareleriyle akar, yön ve pabuç periyodu korunur', () => {
    const scene = fakeScene();
    const rig = new TreadRig(scene as unknown as Phaser.Scene, STRIKER);
    const bands = rig.parts.slice(-2) as unknown as typeof scene.created;
    expect(bands.map((band) => band.kind)).toEqual(['image', 'image']);
    rig.update(0, 0);
    const rest = bands[0].frame;
    rig.update(1, -1);
    expect(bands[0].frame).not.toEqual(rest);
    expect(bands[0].frame).not.toEqual(bands[1].frame);
    const moving = bands.map((band) => band.frame);
    rig.update(9, 7);
    expect(bands.map((band) => band.frame)).toEqual(moving);
    expect(scene.created).toHaveLength(8);
  });

  it('her araç kendi bant dokusunu ve fizik ayak izine uyan ölçüyü kullanır', () => {
    for (const spec of tankSpecs()) {
      const scene = fakeScene();
      const rig = new TreadRig(scene as unknown as Phaser.Scene, spec);
      const bands = rig.parts.slice(-2) as unknown as typeof scene.created;
      const view = treadView(spec);
      expect(bands.map((band) => band.args[2])).toEqual([
        treadBandTexture(spec.id),
        treadBandTexture(spec.id),
      ]);
      expect(bands.map((band) => band.args[1])).toEqual([-view.offset, view.offset]);
      for (const band of bands)
        expect(lastCall(band, 'setDisplaySize')).toEqual([view.width, view.height]);
    }
  });

  it('kırık palet kararır, yerinden oynar ve arka çarkını düşürür; öteki yan etkilenmez; onarım geri alır', () => {
    const scene = fakeScene();
    const rig = new TreadRig(scene as unknown as Phaser.Scene, STRIKER);
    const bands = rig.parts.slice(-2) as unknown as typeof scene.created;
    const ends = rig.parts.slice(2, 6) as unknown as typeof scene.created;
    const tintOf = (band: (typeof bands)[number]): unknown => lastCall(band, 'setTint')?.[0];
    const intact = tintOf(bands[0]);
    rig.setBroken(1);
    expect(tintOf(bands[0])).not.toBe(intact);
    expect(bands[0].rotation).not.toBe(0);
    expect(bands[0].alpha).toBeLessThan(1);
    expect(ends[0].visible).toBe(false);
    expect(ends[1].visible).not.toBe(false);
    expect(tintOf(bands[1])).toBe(intact);
    expect(bands[1].rotation).toBe(0);
    expect(ends[2].visible).not.toBe(false);
    rig.setBroken(2);
    expect(tintOf(bands[0])).toBe(intact);
    expect(ends[0].visible).toBe(true);
    expect(bands[1].rotation).not.toBe(0);
    expect(bands[1].rotation).toBeGreaterThan(0);
    expect(bands[0].rotation).toBe(0);
    rig.setBroken(0);
    expect(tintOf(bands[1])).toBe(intact);
    expect(ends[2].visible).toBe(true);
  });

  it('araçların palet ölçüleri birbirinden ayrışır', () => {
    const sizes = tankSpecs().map((spec) => {
      const view = treadView(spec);
      return `${view.width}x${view.height}@${view.offset}`;
    });
    expect(new Set(sizes).size).toBe(sizes.length);
  });
});
