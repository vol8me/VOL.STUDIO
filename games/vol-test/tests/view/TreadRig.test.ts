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

  it('araçların palet ölçüleri birbirinden ayrışır', () => {
    const sizes = tankSpecs().map((spec) => {
      const view = treadView(spec);
      return `${view.width}x${view.height}@${view.offset}`;
    });
    expect(new Set(sizes).size).toBe(sizes.length);
  });
});
