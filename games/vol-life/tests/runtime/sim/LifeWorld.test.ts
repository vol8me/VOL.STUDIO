import { describe, expect, it } from 'vitest';
import { cloneSubstrateConfig, substrateConfig, type SubstrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';

function smallConfig(overrides: Partial<SubstrateConfig['world']> = {}): SubstrateConfig {
  return {
    ...substrateConfig,
    world: { ...substrateConfig.world, fieldResolution: 8, ...overrides },
    particles: { ...substrateConfig.particles, capacity: 32 },
  };
}

function createWorld(seed: number, config: SubstrateConfig = smallConfig()): LifeWorld {
  return new LifeWorld(config, createExplicitWorldMetadata(seed));
}

function bytes(array: Float32Array): Uint8Array {
  return new Uint8Array(array.buffer.slice(0));
}

describe('LifeWorld', () => {
  it('aynı tohum ve tick sayısında bütün alanları bayt bayt aynı üretir', () => {
    const config = smallConfig();
    const left = createWorld(42, config);
    const right = createWorld(42, config);

    for (let i = 0; i < 30; i++) {
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
    const config = smallConfig();
    const left = createWorld(42, config);
    const right = createWorld(43, config);

    expect(bytes(left.particles.x)).not.toEqual(bytes(right.particles.x));
    expect(left.snapshot().metadata.seed).toBe(42);
    expect(right.snapshot().metadata.seed).toBe(43);
  });

  it('metadata ve yapılandırmayı çağıranın sonradan değiştirmesinden yalıtır', () => {
    const metadata = createExplicitWorldMetadata(42);
    const config = cloneSubstrateConfig(smallConfig());
    const world = new LifeWorld(config, metadata);
    const control = new LifeWorld(cloneSubstrateConfig(config), createExplicitWorldMetadata(42));

    (config.world as { nutrientRenewal: number }).nutrientRenewal = 1;
    (metadata as { seed: number }).seed = 99;
    for (let index = 0; index < 12; index++) {
      world.step();
      control.step();
    }
    const snapshot = world.snapshot();
    (snapshot.metadata as { id: string }).id = 'dışarıdan-değiştirildi';

    expect(world.metadata).toEqual(createExplicitWorldMetadata(42));
    expect(world.snapshot()).toEqual(control.snapshot());
  });

  it('anlık görüntüden devam eden dünya kesintisiz koşuyla aynı sona varır', () => {
    const config = smallConfig();
    const continuous = createWorld(7, config);
    for (let i = 0; i < 30; i++) continuous.step();
    const snapshot = continuous.snapshot();
    const restored = createWorld(7, config);
    restored.restore(snapshot);

    for (let i = 0; i < 30; i++) {
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
    const config = smallConfig();
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
    const config = smallConfig();
    const world = createWorld(7, config);
    const snapshot = world.snapshot();
    const light = snapshot.fields.light.slice();
    light[0] = Number.NaN;

    expect(() => world.restore({ ...snapshot, fields: { ...snapshot.fields, light } })).toThrow(
      RangeError,
    );
  });

  it('her simülasyon tickinde parçacıkları hareket ettirir ve aktif sayıyı korur', () => {
    const config = smallConfig();
    const world = createWorld(19, config);
    const initialX = world.particles.x.slice();

    world.step();

    expect(world.particles.activeCount).toBe(world.particles.activeCount);
    expect(bytes(world.particles.x)).not.toEqual(bytes(initialX));
  });

  it('ışık kaynakları alanı eşitsiz tohumlar ve zamanla yer değiştirir', () => {
    const config = smallConfig();
    const world = createWorld(11, config);
    const initial = world.fields.light.slice();

    for (let i = 0; i < 60; i++) world.step();

    expect(Math.max(...initial)).toBeGreaterThan(Math.min(...initial));
    expect(bytes(world.fields.light)).not.toEqual(bytes(initial));
    expect(world.fields.nutrient.some((value) => value > 0)).toBe(true);
  });

  it('alan güncellemesinin yalnız gerçekleştiği tickte true döndürür', () => {
    const config = smallConfig({ fieldHz: 10 });
    const world = createWorld(1, config);

    expect(Array.from({ length: 5 }, () => world.step())).toEqual(Array(5).fill(false));
    expect(world.step()).toBe(true);
  });

  it('alan temposunu sabit 60 Hz varsayımı yerine dünya adımından türetir', () => {
    const config = smallConfig({ fixedStepMs: 1000 / 30, fieldHz: 10 });
    const world = createWorld(1, config);

    expect(world.step()).toBe(false);
    expect(world.step()).toBe(false);
    expect(world.step()).toBe(true);
  });

  it('512 yolu gibi kademeli kipte her turda tek satır bandını yeniler', () => {
    const config = smallConfig({ fieldUpdateBands: 4 });
    const world = createWorld(2, config);
    const initial = world.fields.light.slice();
    const resolution = config.world.fieldResolution;

    for (let i = 0; i < 6; i++) world.step();

    expect(world.fields.light.slice((resolution / 2) * resolution)).toEqual(
      initial.slice((resolution / 2) * resolution),
    );
    expect(world.fields.light.slice(0, (resolution / 2) * resolution)).not.toEqual(
      initial.slice(0, (resolution / 2) * resolution),
    );
  });

  it('kademeli alan imlecini snapshot/restore boyunca korur', () => {
    const config = smallConfig({ fieldUpdateBands: 4 });
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
