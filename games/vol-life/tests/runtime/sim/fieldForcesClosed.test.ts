import { describe, expect, it } from 'vitest';
import { substrateConfig, type SubstrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { createSimRandom } from '@/runtime/sim/rng';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';

/*
 * C11: alan ve ekoloji kuvvetleri morphology kanıtlanana kadar KAPALIDIR
 * (DESIGN §14 ders 14). İddia "kod alanları okumuyor" değil, ölçülebilir
 * olanıdır: alanlar tamamen bozulsa bile parçacık yörüngeleri bayt düzeyinde
 * değişmez. Adım 5'te bu kapı bilinçli olarak yeniden açılacak ve o zaman bu
 * test kırmızıya dönecek — kırmızıya dönmesi beklenen davranıştır.
 */
const TICKS = 240;

function smallConfig(): SubstrateConfig {
  return {
    ...substrateConfig,
    world: { ...substrateConfig.world, fieldResolution: 32 },
    particles: { ...substrateConfig.particles, capacity: 128 },
  };
}

function particleBytes(world: LifeWorld): Uint8Array[] {
  const { x, y, vx, vy, type, active } = world.particles;
  return [x, y, vx, vy]
    .map((array) => new Uint8Array(array.buffer.slice(0)))
    .concat([new Uint8Array(type.buffer.slice(0)), new Uint8Array(active.buffer.slice(0))]);
}

describe('alan kuvvetleri kapalı', () => {
  // 2x128 parçacıklı 240 adım simülasyon ve alan bozma v8 kapsam enstrümantasyonu altında açık süre gerektirir.
  it('alanlar her tick bozulsa da parçacık dizileri bayt düzeyinde aynı kalır', () => {
    const config = smallConfig();
    const control = new LifeWorld(config, createExplicitWorldMetadata(31));
    const corrupted = new LifeWorld(config, createExplicitWorldMetadata(31));
    const random = createSimRandom(0xc0ffee);

    for (let tick = 0; tick < TICKS; tick++) {
      for (const name of corrupted.fields.names()) {
        const field = corrupted.fields.get(name);
        for (let index = 0; index < field.length; index++) field[index] = random.next();
      }
      control.step();
      corrupted.step();
    }

    // Bozma gerçekten oldu: alanlar ayrıştı.
    expect(new Uint8Array(corrupted.fields.nutrient.buffer.slice(0))).not.toEqual(
      new Uint8Array(control.fields.nutrient.buffer.slice(0)),
    );
    // Ama parçacıklar aynı: alanlar fiziğe girmiyor.
    const controlBytes = particleBytes(control);
    const corruptedBytes = particleBytes(corrupted);
    for (let index = 0; index < controlBytes.length; index++) {
      expect(corruptedBytes[index]).toEqual(controlBytes[index]);
    }
    expect(corrupted.particles.activeCount).toBe(control.particles.activeCount);
    expect(corrupted.reservoir.voidLossTotal).toBe(control.reservoir.voidLossTotal);
  }, 20_000);

  it('bozulmuş alanlar kuvvet ve hız zarfını da etkilemez', () => {
    const config = smallConfig();
    const control = new LifeWorld(config, createExplicitWorldMetadata(77));
    const corrupted = new LifeWorld(config, createExplicitWorldMetadata(77));

    for (let tick = 0; tick < 60; tick++) {
      for (const name of corrupted.fields.names()) corrupted.fields.get(name).fill(1);
      control.step();
      corrupted.step();
    }

    expect(new Uint8Array(corrupted.particles.forceX.buffer.slice(0))).toEqual(
      new Uint8Array(control.particles.forceX.buffer.slice(0)),
    );
    expect(new Uint8Array(corrupted.particles.forceY.buffer.slice(0))).toEqual(
      new Uint8Array(control.particles.forceY.buffer.slice(0)),
    );
  });
});
