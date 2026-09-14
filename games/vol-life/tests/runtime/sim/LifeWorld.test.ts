import { describe, expect, it } from 'vitest';
import { worldConfig } from '@/config/world';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';

function createWorld(seed: number, config = worldConfig): LifeWorld {
  return new LifeWorld(config, createExplicitWorldMetadata(seed));
}

function bytes(array: Float32Array): Uint8Array {
  return new Uint8Array(array.buffer.slice(0));
}

describe('LifeWorld', () => {
  it('aynı tohum ve tick sayısında bütün alanları bayt bayt aynı üretir', () => {
    const config = { ...worldConfig, fieldResolution: 32 };
    const left = createWorld(42, config);
    const right = createWorld(42, config);

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

  it('farklı world-instance seedleri farklı başlangıç üretir', () => {
    const config = { ...worldConfig, fieldResolution: 32 };
    const left = createWorld(42, config);
    const right = createWorld(43, config);

    expect(bytes(left.particles.x)).not.toEqual(bytes(right.particles.x));
    expect(left.snapshot().metadata.seed).toBe(42);
    expect(right.snapshot().metadata.seed).toBe(43);
  });

  it('anlık görüntüden devam eden dünya kesintisiz koşuyla aynı sona varır', () => {
    const config = { ...worldConfig, fieldResolution: 32 };
    const continuous = createWorld(7, config);
    for (let i = 0; i < 90; i++) continuous.step();
    const snapshot = continuous.snapshot();
    const restored = createWorld(7, config);
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

  it('bozuk snapshotı dünyayı kısmen değiştirmeden atomik olarak reddeder', () => {
    const config = { ...worldConfig, fieldResolution: 32 };
    const world = createWorld(7, config);
    for (let index = 0; index < 12; index++) world.step();
    const before = world.snapshot();
    const nutrientDiffusionSource = before.nutrientDiffusionSource.slice();
    nutrientDiffusionSource[0] = 0.987;
    const invalid = {
      ...before,
      tick: before.tick + 10,
      nutrientDiffusionSource,
      particles: { ...before.particles, type: before.particles.type.slice(1) },
    };

    expect(() => world.restore(invalid)).toThrow(RangeError);
    expect(world.snapshot()).toEqual(before);
  });

  it('doğrudan restore yolunda sonlu olmayan alan değerini reddeder', () => {
    const world = createWorld(7, { ...worldConfig, fieldResolution: 32 });
    const snapshot = world.snapshot();
    const light = snapshot.fields.light.slice();
    light[0] = Number.NaN;

    expect(() => world.restore({ ...snapshot, fields: { ...snapshot.fields, light } })).toThrow(
      RangeError,
    );
  });

  it('her simülasyon tickinde parçacıkları hareket ettirir ve sabit sayıyı korur', () => {
    const world = createWorld(19, { ...worldConfig, fieldResolution: 32 });
    const initialX = world.particles.x.slice();

    world.step();

    expect(world.particles.count).toBe(100);
    expect(bytes(world.particles.x)).not.toEqual(bytes(initialX));
  });

  it('ışık kaynakları alanı eşitsiz tohumlar ve zamanla yer değiştirir', () => {
    const world = createWorld(11, { ...worldConfig, fieldResolution: 32 });
    const initial = world.fields.light.slice();

    for (let i = 0; i < 60; i++) world.step();

    expect(Math.max(...initial)).toBeGreaterThan(Math.min(...initial));
    expect(bytes(world.fields.light)).not.toEqual(bytes(initial));
    expect(world.fields.nutrient.some((value) => value > 0)).toBe(true);
  });

  it('alan güncellemesinin yalnız gerçekleştiği tickte true döndürür', () => {
    const world = createWorld(1, { ...worldConfig, fieldResolution: 32 });

    expect(Array.from({ length: 5 }, () => world.step())).toEqual(Array(5).fill(false));
    expect(world.step()).toBe(true);
  });

  it('alan temposunu sabit 60 Hz varsayımı yerine dünya adımından türetir', () => {
    const world = createWorld(1, {
      ...worldConfig,
      fixedStepMs: 1000 / 30,
      fieldHz: 10,
      fieldResolution: 32,
    });

    expect(world.step()).toBe(false);
    expect(world.step()).toBe(false);
    expect(world.step()).toBe(true);
  });

  it('512 yolu gibi kademeli kipte her turda tek satır bandını yeniler', () => {
    const world = createWorld(2, {
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
    const config = { ...worldConfig, fieldResolution: 32, fieldUpdateBands: 4 };
    const continuous = createWorld(91, config);
    for (let i = 0; i < 18; i++) continuous.step();
    const restored = createWorld(91, config);
    restored.restore(continuous.snapshot());

    for (let i = 0; i < 30; i++) {
      continuous.step();
      restored.step();
    }

    expect(bytes(restored.fields.light)).toEqual(bytes(continuous.fields.light));
    expect(bytes(restored.fields.nutrient)).toEqual(bytes(continuous.fields.nutrient));
  });
});
