import { describe, expect, it } from 'vitest';
import { defaultPhysicsGenome } from '@/config/genome';
import { substrateConfig } from '@/config/substrate';
import { seedInitialMatter } from '@/runtime/sim/InitialMatterSeeder';
import { ParticleStore } from '@/runtime/sim/ParticleStore';
import type { HabitatSDF } from '@/runtime/sim/WorldDomain';
import { createHabitatDomain } from '@/runtime/sim/WorldDomain';
import { createSimRandom } from '@/runtime/sim/rng';

const STORAGE = substrateConfig.world.boundsUnits;

function domain(seed = 11): HabitatSDF {
  return createHabitatDomain(STORAGE, substrateConfig.habitat, seed);
}

describe('seedInitialMatter', () => {
  it('belirtilen sayıda parçacığı aktif olarak ekler', () => {
    const particles = new ParticleStore(64);
    const sdf = domain();
    const summary = seedInitialMatter(
      particles,
      createSimRandom(42),
      sdf,
      defaultPhysicsGenome,
      32,
    );

    expect(particles.activeCount).toBe(32);
    expect(summary.patchCount + summary.cloudCount + summary.sparseCount).toBe(32);
  });

  it('varsayılan sayı parçacık kapasitesine eşittir', () => {
    const particles = new ParticleStore(16);
    const sdf = domain();
    seedInitialMatter(particles, createSimRandom(1), sdf, defaultPhysicsGenome);
    expect(particles.activeCount).toBe(16);
  });

  it('geçersiz sayı aralığını reddeder', () => {
    const particles = new ParticleStore(8);
    const sdf = domain();
    expect(() =>
      seedInitialMatter(particles, createSimRandom(1), sdf, defaultPhysicsGenome, 0),
    ).toThrow(RangeError);
    expect(() =>
      seedInitialMatter(particles, createSimRandom(1), sdf, defaultPhysicsGenome, 9),
    ).toThrow(RangeError);
    expect(() =>
      seedInitialMatter(particles, createSimRandom(1), sdf, defaultPhysicsGenome, 1.5),
    ).toThrow(RangeError);
  });

  it('dolu depoya ek yapmayı reddeder', () => {
    const particles = new ParticleStore(4);
    const sdf = domain();
    seedInitialMatter(particles, createSimRandom(1), sdf, defaultPhysicsGenome, 4);
    expect(() =>
      seedInitialMatter(particles, createSimRandom(2), sdf, defaultPhysicsGenome, 1),
    ).toThrow(RangeError);
  });

  it('tüm parçacıklar habitat içinde ve fringe gerisinde doğar', () => {
    const particles = new ParticleStore(64);
    const sdf = domain();
    seedInitialMatter(particles, createSimRandom(7), sdf, defaultPhysicsGenome);

    for (let slot = 0; slot < particles.capacity; slot++) {
      if (particles.active[slot] === 0) continue;
      const { distance } = sdf.sampleDistanceAndNormal(particles.x[slot], particles.y[slot]);
      expect(distance).toBeGreaterThanOrEqual(defaultPhysicsGenome.fringe.widthUnits);
    }
  });

  it('aynı tohumla aynı başlangıç dizilerini üretir', () => {
    const left = new ParticleStore(32);
    const right = new ParticleStore(32);
    const sdf = domain();
    seedInitialMatter(left, createSimRandom(99), sdf, defaultPhysicsGenome);
    seedInitialMatter(right, createSimRandom(99), sdf, defaultPhysicsGenome);
    expect(left.snapshot()).toEqual(right.snapshot());
  });

  it('farklı tohumlar farklı dağılım üretir', () => {
    const left = new ParticleStore(32);
    const right = new ParticleStore(32);
    const sdf = domain();
    seedInitialMatter(left, createSimRandom(1), sdf, defaultPhysicsGenome);
    seedInitialMatter(right, createSimRandom(2), sdf, defaultPhysicsGenome);
    expect([...left.x]).not.toEqual([...right.x]);
  });

  it('parçacık türleri yapılandırılan ağırlık dağılımına uyar', () => {
    const particles = new ParticleStore(128);
    const sdf = domain();
    seedInitialMatter(particles, createSimRandom(5), sdf, defaultPhysicsGenome);
    const counts = new Array(8).fill(0);
    for (let slot = 0; slot < particles.capacity; slot++) {
      if (particles.active[slot]) counts[particles.type[slot]]++;
    }
    expect(counts.some((c) => c > 0)).toBe(true);
  });
});
