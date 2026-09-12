import { describe, expect, it } from 'vitest';
import { worldConfig } from '@/config/world';
import { LifeWorld } from '@/runtime/sim/LifeWorld';

function bytes(array: Float32Array): Uint8Array {
  return new Uint8Array(array.buffer.slice(0));
}

describe('LifeWorld', () => {
  it('aynı tohum ve tick sayısında bütün alanları bayt bayt aynı üretir', () => {
    const left = new LifeWorld({ ...worldConfig, fieldResolution: 32, seed: 42 });
    const right = new LifeWorld({ ...worldConfig, fieldResolution: 32, seed: 42 });

    for (let i = 0; i < 120; i++) {
      left.step();
      right.step();
    }

    for (const name of left.fields.names()) {
      expect(bytes(left.fields.get(name))).toEqual(bytes(right.fields.get(name)));
    }
    expect(bytes(left.particles.x)).toEqual(bytes(right.particles.x));
    expect(bytes(left.particles.y)).toEqual(bytes(right.particles.y));
    expect(bytes(left.particles.vx)).toEqual(bytes(right.particles.vx));
    expect(bytes(left.particles.vy)).toEqual(bytes(right.particles.vy));
    expect([...left.particles.type]).toEqual([...right.particles.type]);
  });

  it('anlık görüntüden devam eden dünya kesintisiz koşuyla aynı sona varır', () => {
    const continuous = new LifeWorld({ ...worldConfig, fieldResolution: 32, seed: 7 });
    for (let i = 0; i < 90; i++) continuous.step();
    const snapshot = continuous.snapshot();
    const restored = new LifeWorld({ ...worldConfig, fieldResolution: 32, seed: 7 });
    restored.restore(snapshot);

    for (let i = 0; i < 90; i++) {
      continuous.step();
      restored.step();
    }

    expect(restored.tick).toBe(continuous.tick);
    for (const name of continuous.fields.names()) {
      expect(bytes(restored.fields.get(name))).toEqual(bytes(continuous.fields.get(name)));
    }
    expect(restored.particles.snapshot()).toEqual(continuous.particles.snapshot());
  });

  it('her simülasyon tickinde parçacıkları hareket ettirir ve sabit sayıyı korur', () => {
    const world = new LifeWorld({ ...worldConfig, fieldResolution: 32, seed: 19 });
    const initialX = world.particles.x.slice();

    world.step();

    expect(world.particles.count).toBe(100);
    expect(bytes(world.particles.x)).not.toEqual(bytes(initialX));
  });

  it('ışık kaynakları alanı eşitsiz tohumlar ve zamanla yer değiştirir', () => {
    const world = new LifeWorld({ ...worldConfig, fieldResolution: 32, seed: 11 });
    const initial = world.fields.light.slice();

    for (let i = 0; i < 60; i++) world.step();

    expect(Math.max(...initial)).toBeGreaterThan(Math.min(...initial));
    expect(bytes(world.fields.light)).not.toEqual(bytes(initial));
    expect(world.fields.nutrient.some((value) => value > 0)).toBe(true);
  });

  it('alan güncellemesinin yalnız gerçekleştiği tickte true döndürür', () => {
    const world = new LifeWorld({ ...worldConfig, fieldResolution: 32 });

    expect(Array.from({ length: 5 }, () => world.step())).toEqual(Array(5).fill(false));
    expect(world.step()).toBe(true);
  });

  it('512 yolu gibi kademeli kipte her turda tek satır bandını yeniler', () => {
    const world = new LifeWorld({
      ...worldConfig,
      fieldResolution: 32,
      fieldUpdateBands: 4,
    });
    const initial = world.fields.light.slice();

    for (let i = 0; i < 6; i++) world.step();

    expect(world.fields.light.slice(8 * 32)).toEqual(initial.slice(8 * 32));
    expect(world.fields.light.slice(0, 8 * 32)).not.toEqual(initial.slice(0, 8 * 32));
  });

  it('kademeli alan imlecini snapshot/restore boyunca korur', () => {
    const config = { ...worldConfig, fieldResolution: 32, fieldUpdateBands: 4, seed: 91 };
    const continuous = new LifeWorld(config);
    for (let i = 0; i < 18; i++) continuous.step();
    const restored = new LifeWorld(config);
    restored.restore(continuous.snapshot());

    for (let i = 0; i < 30; i++) {
      continuous.step();
      restored.step();
    }

    expect(bytes(restored.fields.light)).toEqual(bytes(continuous.fields.light));
    expect(bytes(restored.fields.nutrient)).toEqual(bytes(continuous.fields.nutrient));
  });
});
