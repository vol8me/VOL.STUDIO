import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { TreadRig } from '@/view/TreadRig';
import { fakeScene } from '../support/fakeScene';

describe('TreadRig', () => {
  it('ortak görüntü kareleriyle akar, yön ve pabuç periyodu korunur', () => {
    const scene = fakeScene();
    const rig = new TreadRig(scene as unknown as Phaser.Scene);
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
});
