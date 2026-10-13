import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { BULWARK, DART, STRIKER } from '@/config/vehicles';
import { WEATHER_VIEW } from '@/config/weatherView';
import { TEXTURE, tankTexture, treadBandTexture } from '@/view/textures';
import { VehicleReflectionPool } from '@/view/weather/VehicleReflectionPool';
import { fakeScene, lastCall } from '../../support/fakeScene';
import { sample, vehicle, weather } from '../../support/weatherFixtures';

const rect = { x: 0, y: 0, width: 256, height: 256 };

describe('VehicleReflectionPool', () => {
  it('yuvaları tembel kurar: ilk su birikintisinde aracın gerçek gövde, taret ve palet dokularıyla', () => {
    const scene = fakeScene();
    const pool = new VehicleReflectionPool(scene as unknown as Phaser.Scene);
    expect(scene.created).toHaveLength(0);
    pool.update(weather(), rect, [vehicle(1, { spec: BULWARK })]);
    const textures = scene.created
      .filter((object) => object.kind === 'image')
      .map((object) => object.args[2]);
    expect(textures).toContain(tankTexture('bulwark', 'hull'));
    expect(textures).toContain(tankTexture('bulwark', 'turret'));
    expect(textures).toContain(TEXTURE.treadEnd);
    expect(textures).toContain(treadBandTexture('bulwark'));
    expect(textures).not.toContain(tankTexture('striker', 'hull'));
  });

  it('kapasiteyi aşmaz ve ikinci karede yeni nesne kurmaz', () => {
    const scene = fakeScene();
    const pool = new VehicleReflectionPool(scene as unknown as Phaser.Scene);
    const specs = [STRIKER, BULWARK, DART];
    const fleet = Array.from({ length: 30 }, (_, id) => vehicle(id, { spec: specs[id % 3] }));
    expect(pool.update(weather(), rect, fleet)).toBe(WEATHER_VIEW.vehicleCapacity);
    const built = scene.created.length;
    expect(pool.update(weather(), rect, fleet)).toBe(WEATHER_VIEW.vehicleCapacity);
    expect(scene.created.length).toBe(built);
    const roots = scene.created.filter((object) => object.kind === 'container');
    expect(roots.filter((root) => root.visible).length).toBe(WEATHER_VIEW.vehicleCapacity);
  });

  it('her tür yalnız kendi yuvalarını kullanır; kaybolan türün yuvası gizlenir', () => {
    const scene = fakeScene();
    const pool = new VehicleReflectionPool(scene as unknown as Phaser.Scene);
    const roots = () => scene.created.filter((object) => object.kind === 'container');
    pool.update(weather(), rect, [vehicle(1, { spec: STRIKER }), vehicle(2, { spec: DART })]);
    expect(roots()).toHaveLength(2);
    expect(roots().every((root) => root.visible)).toBe(true);
    pool.update(weather(), rect, [vehicle(2, { spec: DART })]);
    expect(roots().filter((root) => root.visible)).toHaveLength(1);
  });

  it('yerel su miktarı yansımanın alpha değeridir; kuru/uzak tanklar gizlenir ve kaynaklar sökülür', () => {
    const scene = fakeScene();
    const pool = new VehicleReflectionPool(scene as unknown as Phaser.Scene);
    pool.update(weather(sample({ puddleDepth: 0.0175 })), rect, [vehicle()]);
    const roots = scene.created.filter((object) => object.kind === 'container');
    expect(lastCall(roots[0], 'setAlpha')).toEqual([0.1]);
    expect(pool.update(weather(sample({ puddleDepth: 0 })), rect, [vehicle()])).toBe(0);
    expect(roots.every((root) => root.visible === false)).toBe(true);
    expect(pool.update(weather(), rect, [vehicle(1, { x: 800 })])).toBe(0);
    pool.destroy();
    expect(roots.every((root) => lastCall(root, 'destroy') !== undefined)).toBe(true);
  });
});
