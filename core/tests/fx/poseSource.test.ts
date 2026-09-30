import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { samplePose } from '../../src/fx/poseSample';
import { poseSourceOf } from '../../src/phaser/poseSource';

function leaf(key: string, x: number): Phaser.GameObjects.GameObject {
  return {
    texture: { key },
    originX: 0.5,
    originY: 0.5,
    getWorldTransformMatrix: () => ({
      decomposeMatrix: () => ({ translateX: x, translateY: 0, rotation: 0, scaleX: 1, scaleY: 1 }),
    }),
  } as unknown as Phaser.GameObjects.GameObject;
}

describe('poseSourceOf', () => {
  it('tek nesneyi olduğu gibi poz kaynağı yapar', () => {
    const node = leaf('a', 3);
    expect(samplePose(poseSourceOf(node)).map((sample) => sample.x)).toEqual([3]);
  });

  it('dizi sırasını koruyan bir kaynak kurar ve diziyi kopyalar', () => {
    const nodes = [leaf('a', 1), leaf('b', 2)];
    const source = poseSourceOf(nodes);
    nodes.push(leaf('c', 3));
    expect(samplePose(source).map((sample) => sample.textureKey)).toEqual(['a', 'b']);
  });
});
