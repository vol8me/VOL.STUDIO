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
    expect([...restored.snapshot().randomStreamStates]).toEqual([
      ...continuous.snapshot().randomStreamStates,
    ]);
  });

  /*
   * Akış yalıtımı (DESIGN.md §7): bir alt sistemin parametresi değişince BAŞKA
   * bir alt sistemin dizisi kaymaz. Tek akışlı kurulumda ışık kaynağı sayısını
   * bir artırmak bütün parçacık başlangıcını değiştiriyordu.
   */
  it('ışık kaynağı sayısı değişse de parçacık başlangıcı bayt düzeyinde aynı kalır', () => {
    const base = smallConfig();
    const extraLight = {
      ...base,
      world: { ...base.world, lightSourceCount: base.world.lightSourceCount + 1 },
    };
    const left = createWorld(77, base);
    const right = createWorld(77, extraLight);

    expect(bytes(right.particles.x)).toEqual(bytes(left.particles.x));
    expect(bytes(right.particles.y)).toEqual(bytes(left.particles.y));
    expect(bytes(right.particles.vx)).toEqual(bytes(left.particles.vx));
    expect(bytes(right.particles.vy)).toEqual(bytes(left.particles.vy));
    expect([...right.particles.type]).toEqual([...left.particles.type]);
    expect(bytes(right.fields.light)).not.toEqual(bytes(left.fields.light));
  });

  it('seeding parametresi değişse de ışık alanı ve habitat bayt düzeyinde aynı kalır', () => {
    const base = smallConfig();
    const extraPatch = {
      ...base,
      candidate: {
        ...base.candidate,
        seeding: { ...base.candidate.seeding, patchCount: base.candidate.seeding.patchCount + 1 },
      },
    };
    const left = createWorld(77, base);
    const right = createWorld(77, extraPatch);

    expect(bytes(right.fields.light)).toEqual(bytes(left.fields.light));
    expect(bytes(right.fields.nutrient)).toEqual(bytes(left.fields.nutrient));
    expect(right.domain.digest).toBe(left.domain.digest);
    expect(bytes(right.particles.x)).not.toEqual(bytes(left.particles.x));
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

  /*
   * Void dünyasında "aktif sayı korunur" GEÇERLİ BİR DEĞİŞMEZ DEĞİLDİR: kıyıyı
   * geçen parçacık düşer. Korunan şey muhasebedir — aktif madde + dış rezervuar.
   * Kapasite 32 değil 128: ölçüldü, 600 tickte 64'te bir seed hiç kaybetmiyor,
   * 128'de sınanan her seed kaybediyor — daha küçüğünde iddia boşa düşerdi.
   * Üretim kapasiteli (512) sürüm `tests/long/matterAccounting.long.ts`tedir;
   * kapsam altında birim kapısının süresini aşıyordu.
   */
  it('600 tick boyunca aktif bayrak sayısı, activeCount ve madde muhasebesi tutar', () => {
    const config = {
      ...smallConfig(),
      particles: { ...substrateConfig.particles, capacity: 128 },
    };
    const world = createWorld(19, config);
    const initial = world.particles.activeCount;
    const initialX = world.particles.x.slice();
    const initialY = world.particles.y.slice();
    const flagMismatches: string[] = [];
    const accountingBreaks: string[] = [];

    for (let tick = 1; tick <= 600; tick++) {
      world.step();
      const { active, capacity, activeCount } = world.particles;
      let flagged = 0;
      for (let slot = 0; slot < capacity; slot++) flagged += active[slot];
      if (flagged !== activeCount) flagMismatches.push(`tick ${tick}: ${flagged} ≠ ${activeCount}`);
      if (activeCount + world.reservoir.external !== initial) {
        accountingBreaks.push(`tick ${tick}: ${activeCount} + ${world.reservoir.external}`);
      }
    }

    expect(initial).toBe(128);
    expect(flagMismatches).toEqual([]);
    expect(accountingBreaks).toEqual([]);
    // Kayıp hiç oluşmazsa muhasebe iddiası aktif sayının sabitliğine indirgenir.
    expect(world.reservoir.voidLossTotal).toBeGreaterThan(0);
    expect(world.particles.activeCount).toBe(initial - world.reservoir.voidLossTotal);

    let movedActive = 0;
    for (let slot = 0; slot < world.particles.capacity; slot++) {
      if (world.particles.active[slot] === 0) continue;
      if (
        world.particles.x[slot] !== initialX[slot] ||
        world.particles.y[slot] !== initialY[slot]
      ) {
        movedActive++;
      }
    }
    expect(movedActive).toBeGreaterThan(0);
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
