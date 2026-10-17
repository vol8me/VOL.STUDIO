import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { WEATHER_VIEW } from '@/config/weatherView';
import { VehicleWakePool } from '@/view/weather/VehicleWakePool';
import { fakeObject } from '../../support/fakeScene';
import { frame, sample, vehicle, weather } from '../../support/weatherFixtures';

const rect = { x: 0, y: 0, width: 256, height: 256 };

describe('VehicleWakePool', () => {
  it('suya giriş kısa sıçrama yaratır; sabit sim saati aynı izi tekrar üretmez', () => {
    const graphics = fakeObject('graphics');
    const pool = new VehicleWakePool(graphics as unknown as Phaser.GameObjects.Graphics);
    const source = weather();
    expect(pool.update(source, rect, [vehicle()])).toBe(1);
    expect(pool.update(source, rect, [vehicle(1, { x: 100 })])).toBe(1);
    expect(
      pool.update({ ...source, frame: frame({ elapsedMs: 1001 }) }, rect, [vehicle(1, { x: 100 })]),
    ).toBe(2);
    expect(
      pool.update({ ...source, frame: frame({ elapsedMs: 2000 }) }, rect, [vehicle(1, { x: 100 })]),
    ).toBe(0);
  });

  it('kuru veya durgun tank sıçramaz, görünmeyen iz çizilmez ve uzun sürüş havuzu aşmaz', () => {
    const graphics = fakeObject('graphics');
    const pool = new VehicleWakePool(graphics as unknown as Phaser.GameObjects.Graphics);
    expect(pool.update(weather(sample({ puddleDepth: 0 })), rect, [vehicle()])).toBe(0);
    expect(
      pool.update({ ...weather(), frame: frame({ elapsedMs: 1001 }) }, rect, [
        vehicle(1, { speed: 0 }),
      ]),
    ).toBe(0);
    for (let step = 0; step < 100; step++) {
      const count = pool.update({ ...weather(), frame: frame({ elapsedMs: 1100 + step }) }, rect, [
        vehicle(1, { x: 1000 + step * 20 }),
      ]);
      expect(count).toBeLessThanOrEqual(WEATHER_VIEW.wakeCapacity);
    }
    expect(graphics.calls.filter(([name]) => name === 'strokeEllipse')).toHaveLength(0);
  });
  it('kaldırılan araç yerini yenisine bırakır; kuru zeminden yeniden suya giriş yeniden sıçrar', () => {
    const graphics = fakeObject('graphics');
    const pool = new VehicleWakePool(graphics as unknown as Phaser.GameObjects.Graphics);
    const vehicles = Array.from({ length: 20 }, (_, id) => vehicle(id));
    expect(pool.update(weather(), rect, vehicles)).toBe(16);
    expect(
      pool.update({ ...weather(), frame: frame({ elapsedMs: 1500 }) }, rect, [vehicle(50)]),
    ).toBe(1);
    pool.update(
      { ...weather(sample({ puddleDepth: 0 })), frame: frame({ elapsedMs: 1510 }) },
      rect,
      [vehicle(50)],
    );
    expect(
      pool.update({ ...weather(), frame: frame({ elapsedMs: 1520 }) }, rect, [vehicle(50)]),
    ).toBe(2);
    expect(pool.update({ ...weather(), frame: frame({ elapsedMs: 0 }) }, rect, [])).toBe(0);
  });
});
