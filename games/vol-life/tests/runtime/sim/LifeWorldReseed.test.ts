import { describe, expect, it } from 'vitest';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { substrateConfig } from '@/config/substrate';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';

describe('LifeWorld rezervuar yeniden ekim (reseed) döngüsü', () => {
  it('rezervuarda madde varken reseedInterval periyodunda parçacıkları habitata geri eker', () => {
    const config = {
      ...substrateConfig,
      particles: {
        ...substrateConfig.particles,
        capacity: 32,
        reseedIntervalSeconds: 1, // 60 tick
        reseedFraction: 0.5,
        referenceHz: 60,
      },
    };

    const world = new LifeWorld(config, createExplicitWorldMetadata(101));

    // Başlangıç durumunu doğrula
    const initialActive = world.particles.activeCount;
    expect(initialActive).toBeGreaterThan(0);
    expect(initialActive).toBeLessThanOrEqual(config.particles.capacity);

    // Dışarıya madde kaybı simüle et: slot boşalt ve rezervuara ekle
    const toRemove = 10;
    for (let index = 0; index < toRemove; index++) {
      world.particles.deactivateSlot(index);
    }
    world.reservoir.recordVoidLoss(toRemove);

    expect(world.particles.activeCount).toBe(initialActive - toRemove);
    expect(world.reservoir.external).toBe(toRemove);

    // Reseed aralığına kadar ilerle (61 tick: tick 0 -> 60'a ulaşıp reseed tetikler)
    for (let tick = 0; tick < 61; tick++) {
      world.step();
    }

    // Reseed gerçekleşmiş olmalı: reseedFraction = 0.5 olduğundan 10 * 0.5 = 5 parçacık ekilmiş olmalı
    expect(world.reservoir.external).toBeLessThan(toRemove);
    expect(world.particles.activeCount).toBeGreaterThan(initialActive - toRemove);

    // Ekilen parçacıkların geçerli pozisyon ve hız taşıdığını doğrula
    let activeFound = 0;
    for (let slot = 0; slot < world.particles.capacity; slot++) {
      if (world.particles.active[slot] === 1) {
        activeFound++;
        expect(Number.isFinite(world.particles.x[slot])).toBe(true);
        expect(Number.isFinite(world.particles.y[slot])).toBe(true);
        expect(Number.isFinite(world.particles.vx[slot])).toBe(true);
        expect(Number.isFinite(world.particles.vy[slot])).toBe(true);
      }
    }
    expect(activeFound).toBe(world.particles.activeCount);
  });

  it('kapasite tamamen doluyken reseed tetiklense bile taşma yapmaz', () => {
    const config = {
      ...substrateConfig,
      particles: {
        ...substrateConfig.particles,
        capacity: 16,
        reseedIntervalSeconds: 1,
        reseedFraction: 1.0,
        referenceHz: 60,
      },
    };

    const world = new LifeWorld(config, createExplicitWorldMetadata(102));

    // Tüm slotları manuel doldur
    while (world.particles.activeCount < world.particles.capacity) {
      world.particles.activateSlot(0, 0, 0, 0, 0);
    }

    world.reservoir.recordVoidLoss(5);
    expect(world.particles.activeCount).toBe(world.particles.capacity);

    // 60 tick ilerle
    for (let tick = 0; tick < 60; tick++) {
      world.step();
    }

    // Kapasite aşılmamalı
    expect(world.particles.activeCount).toBe(world.particles.capacity);
    // Rezervuardan harcanmamalı çünkü boş slot yok
    expect(world.reservoir.external).toBe(5);
  });
});
