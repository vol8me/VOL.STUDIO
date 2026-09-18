import { describe, expect, it } from 'vitest';
import { substrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';

describe('EcologicalVentCadence: ekolojik vent zamanlaması ve ritmik kadans', () => {
  it('parçacıklar asla aynı anda toplu patlamaz; ventCadenceTicks ile tek tek doğar ve dinlenir', () => {
    // Testin hızlı koşması için kadansı 10 tick, dinlenmeyi 30 tick olan config ile test edelim
    const customConfig = {
      ...substrateConfig,
      particles: {
        ...substrateConfig.particles,
        reseedIntervalSeconds: 0.05,
        ventCadenceTicks: 4,
        ventBurstMin: 3,
        ventBurstMax: 3,
        ventCooldownTicks: 15,
      },
    };

    const world = new LifeWorld(customConfig);
    // Dünyadaki mevcut aktif parçacıklardan birkaçını boşaltmak için pasifleştir veya rezervuara ekle
    world.reservoir.recordVoidLoss(10);
    // Rezervuardan doğabilmesi için parçacık deposunda boş slot olmalı
    for (let slot = 0; slot < 10; slot++) {
      world.particles.deactivateSlot(slot);
    }

    const spawnTicks: number[] = [];

    // 40 tick simüle et (3 parçacık * 4 tick = 12 tick + dinlenme)
    for (let t = 0; t < 40; t++) {
      world.step();
      const events = world.drainTransientPresentationEvents();
      const spawns = events.filter((e) => e.kind === 'particle-spawn');

      // Kural 1: Hiçbir tick'te 1'den fazla parçacık doğamaz (asla toplu patlama yok)
      expect(spawns.length).toBeLessThanOrEqual(1);

      if (spawns.length === 1) {
        spawnTicks.push(world.tick);
      }
    }

    // Doğumlar kaydedildi mi?
    expect(spawnTicks.length).toBeGreaterThanOrEqual(3);

    // İlk grubun (3 parçacık) çıkış aralığı tam ventCadenceTicks (10) olmalı
    const delta1 = spawnTicks[1] - spawnTicks[0];
    const delta2 = spawnTicks[2] - spawnTicks[1];
    expect(delta1).toBe(customConfig.particles.ventCadenceTicks);
    expect(delta2).toBe(customConfig.particles.ventCadenceTicks);

    // 3. parçacıktan sonraki doğuş için en az ventCooldownTicks (40) kadar dinlenme olmalı
    if (spawnTicks.length > 3) {
      const cooldownDelta = spawnTicks[3] - spawnTicks[2];
      expect(cooldownDelta).toBeGreaterThanOrEqual(customConfig.particles.ventCooldownTicks);
    }
  });
});
