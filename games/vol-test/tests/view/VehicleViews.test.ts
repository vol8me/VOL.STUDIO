import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { VehicleViews } from '@/view/VehicleViews';
import { fakeScene, lastCall } from '../support/fakeScene';

describe('VehicleViews', () => {
  it('araç ışıkları tek ortak katmana ait olur, araç kaldırılınca ışığı da sökülür', () => {
    const scene = fakeScene();
    const views = new VehicleViews(scene as unknown as Phaser.Scene);
    views.sync([1, 2, 3]);
    const lighting = scene.created.filter(
      (object) => object.kind === 'container' && object.blendMode === 1,
    );
    expect(lighting).toHaveLength(1);
    views.destroy();
    expect(lastCall(lighting[0], 'destroy')).toBeDefined();
  });
  it('kimlikleri eşitler: yeniye görünüm kurar, kaybolanı söker', () => {
    const scene = fakeScene();
    const views = new VehicleViews(scene as unknown as Phaser.Scene);
    expect(views.sync([1, 2])).toEqual([]);
    expect(views.size).toBe(2);
    const first = views.get(1);
    expect(views.sync([1, 2])).toEqual([]);
    expect(views.get(1)).toBe(first);
    const roots = scene.created.filter((object) => object.kind === 'container');
    expect(views.sync([1])).toEqual([2]);
    expect(views.get(2)).toBeUndefined();
    expect(roots.some((root) => lastCall(root, 'destroy'))).toBe(true);
    views.destroy();
    expect(views.size).toBe(0);
  });
});
