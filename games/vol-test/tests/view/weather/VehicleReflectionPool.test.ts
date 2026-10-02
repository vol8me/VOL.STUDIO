import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { WEATHER_VIEW } from '@/config/weatherView';
import { TEXTURE } from '@/view/textures';
import { VehicleReflectionPool } from '@/view/weather/VehicleReflectionPool';
import { fakeScene, lastCall } from '../../support/fakeScene';
import { sample, vehicle, weather } from '../../support/weatherFixtures';

const rect = { x: 0, y: 0, width: 256, height: 256 };

describe('VehicleReflectionPool', () => {
  it('gerçek gövde, taret ve palet dokularını önceden kurar; kapasiteyi aşmaz', () => {
    const scene = fakeScene();
    const pool = new VehicleReflectionPool(scene as unknown as Phaser.Scene);
    const originalCount = scene.created.length;
    const textures = scene.created
      .filter((object) => object.kind === 'image')
      .map((object) => object.args[2]);
    expect(textures).toContain(TEXTURE.hull);
    expect(textures).toContain(TEXTURE.turret);
    expect(textures).toContain(TEXTURE.treadEnd);
    expect(
      scene.created.filter((object) => object.kind === 'image').map((object) => object.args[2]),
    ).toContain(TEXTURE.treadBand);
    expect(
      pool.update(
        weather(),
        rect,
        Array.from({ length: 30 }, (_, id) => vehicle(id)),
      ),
    ).toBe(WEATHER_VIEW.vehicleCapacity);
    expect(scene.created.length).toBe(originalCount);
  });

  it('yerel su miktarı yansımanın alpha değeridir; kuru/uzak tanklar gizlenir ve kaynaklar sökülür', () => {
    const scene = fakeScene();
    const pool = new VehicleReflectionPool(scene as unknown as Phaser.Scene);
    const roots = scene.created.filter((object) => object.kind === 'container');
    pool.update(weather(sample({ puddleDepth: 0.0175 })), rect, [vehicle()]);
    expect(lastCall(roots[0], 'setAlpha')).toEqual([0.1]);
    expect(pool.update(weather(sample({ puddleDepth: 0 })), rect, [vehicle()])).toBe(0);
    expect(roots.every((root) => root.visible === false)).toBe(true);
    expect(pool.update(weather(), rect, [vehicle(1, { x: 800 })])).toBe(0);
    pool.destroy();
    expect(roots.every((root) => lastCall(root, 'destroy') !== undefined)).toBe(true);
  });
});
