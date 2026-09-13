import { describe, expect, it } from 'vitest';
import { particleConfig } from '@/config/particles';
import { worldConfig } from '@/config/world';
import {
  accumulateParticleForces,
  initializeParticles,
  integrateParticles,
} from '@/runtime/sim/ParticlePhysics';
import { ParticleSpatialHash } from '@/runtime/sim/ParticleSpatialHash';
import { ParticleStore } from '@/runtime/sim/ParticleStore';
import { createSimRandom } from '@/runtime/sim/rng';

function pair(leftX: number, rightX: number, leftType = 0, rightType = 1) {
  const particles = new ParticleStore(2);
  particles.x.set([leftX, rightX]);
  particles.y.set([100, 100]);
  particles.type.set([leftType, rightType]);
  const grid = new ParticleSpatialHash(worldConfig.boundsUnits, particleConfig.cellSizeUnits, 2);
  grid.rebuild(particles);
  return { particles, grid };
}

describe('parçacık fiziği', () => {
  it('çok yakın bütün türleri ortak kuvvetle birbirinden iter', () => {
    const { particles, grid } = pair(100, 105);

    accumulateParticleForces(particles, grid, particleConfig);

    expect(particles.forceX[0]).toBeLessThan(0);
    expect(particles.forceX[1]).toBeGreaterThan(0);
  });

  it('orta mesafede yönlü ve asimetrik tür matrisini uygular', () => {
    const { particles, grid } = pair(100, 150, 0, 1);

    accumulateParticleForces(particles, grid, particleConfig);

    expect(particles.forceX[0]).not.toBeCloseTo(-particles.forceX[1], 6);
  });

  it('dünyanın zıt kenarlarındaki parçacıkları komşu saymaz', () => {
    const { particles, grid } = pair(5, 1019);

    accumulateParticleForces(particles, grid, particleConfig);

    expect(particles.forceX[0]).toBe(0);
    expect(particles.forceX[1]).toBe(0);
  });

  it('kuvvet biriktirirken konumu değiştirmez; entegrasyonda sürtünme ve hız tavanı uygular', () => {
    const { particles, grid } = pair(100, 105);
    const before = particles.x.slice();
    accumulateParticleForces(particles, grid, particleConfig);
    expect(particles.x).toEqual(before);
    particles.vx.fill(999);

    integrateParticles(particles, particleConfig, worldConfig.boundsUnits, worldConfig.fixedStepMs);

    expect(Math.hypot(particles.vx[0], particles.vy[0])).toBeLessThanOrEqual(
      particleConfig.maxSpeedUnitsPerReferenceTick + 1e-6,
    );
    expect(particles.x[0]).toBeGreaterThanOrEqual(0);
    expect(particles.x[0]).toBeLessThanOrEqual(
      worldConfig.boundsUnits.width - particleConfig.radiusUnits,
    );
  });

  it('sert duvar temasında seker, yumuşak temasta normal hızı söndürür', () => {
    const particles = new ParticleStore(2);
    particles.x.set([5, 4.55]);
    particles.y.set([100, 200]);
    particles.vx.set([-2, -0.1]);
    particles.vy.set([0.5, 0.5]);

    integrateParticles(particles, particleConfig, worldConfig.boundsUnits, worldConfig.fixedStepMs);

    expect(particles.x[0]).toBe(particleConfig.radiusUnits);
    expect(particles.vx[0]).toBeGreaterThan(0);
    expect(particles.x[1]).toBe(particleConfig.radiusUnits);
    expect(particles.vx[1]).toBe(0);
    expect(particles.vy[1]).toBeGreaterThan(0);
  });

  it('aynı tohumla aynı başlangıç dizilerini üretir', () => {
    const left = new ParticleStore(100);
    const right = new ParticleStore(100);

    initializeParticles(left, createSimRandom(42), particleConfig, worldConfig.boundsUnits);
    initializeParticles(right, createSimRandom(42), particleConfig, worldConfig.boundsUnits);

    expect(left.snapshot()).toEqual(right.snapshot());
  });
});
