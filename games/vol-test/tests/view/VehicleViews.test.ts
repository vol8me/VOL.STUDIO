import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { ARACHNID, BULWARK, DART, STRIKER, WIDOW } from '@/config/vehicles';
import { tankTexture } from '@/view/textures';
import { VehicleViews } from '@/view/VehicleViews';
import { SpiderView } from '@/view/SpiderView';
import { TankView } from '@/view/TankView';
import { fakeScene, lastCall, frameKey } from '../support/fakeScene';

const striker = (id: number) => ({ id, spec: STRIKER });

describe('VehicleViews', () => {
  it('araç ışıkları tek ortak katmana ait olur, araç kaldırılınca ışığı da sökülür', () => {
    const scene = fakeScene();
    const views = new VehicleViews(scene as unknown as Phaser.Scene);
    views.sync([striker(1), striker(2), striker(3)]);
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
    expect(views.sync([striker(1), striker(2)])).toEqual([]);
    expect(views.size).toBe(2);
    const first = views.get(1);
    expect(views.sync([striker(1), striker(2)])).toEqual([]);
    expect(views.get(1)).toBe(first);
    const roots = scene.created.filter((object) => object.kind === 'container');
    expect(views.sync([striker(1)])).toEqual([2]);
    expect(views.get(2)).toBeUndefined();
    expect(roots.some((root) => lastCall(root, 'destroy'))).toBe(true);
    views.destroy();
    expect(views.size).toBe(0);
  });
  it('her kayıt kendi tanımının sanatıyla kurulur', () => {
    const scene = fakeScene();
    const views = new VehicleViews(scene as unknown as Phaser.Scene);
    views.sync([
      { id: 1, spec: STRIKER },
      { id: 2, spec: BULWARK },
      { id: 3, spec: DART },
    ]);
    const used = (key: string) => scene.created.filter((object) => frameKey(object) === key).length;
    expect(used(tankTexture('striker', 'hull'))).toBe(1);
    expect(used(tankTexture('bulwark', 'hull'))).toBe(1);
    expect(used(tankTexture('dart', 'hull'))).toBe(1);
    views.destroy();
  });
  it('bacaklı araç için `SpiderView`, paletli araç için `TankView` kurar', () => {
    const scene = fakeScene();
    const views = new VehicleViews(scene as unknown as Phaser.Scene);
    views.sync([
      { id: 1, spec: ARACHNID },
      { id: 2, spec: WIDOW },
      { id: 3, spec: STRIKER },
    ]);
    expect(views.get(1)).toBeInstanceOf(SpiderView);
    expect(views.get(2)).toBeInstanceOf(SpiderView);
    expect(views.get(3)).toBeInstanceOf(TankView);
    expect(views.get(1)?.impact).toBeTypeOf('function');
    expect(views.sync([])).toEqual([1, 2, 3]);
    views.destroy();
  });
});
