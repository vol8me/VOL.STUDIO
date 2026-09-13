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

  it('yönlü rol çifti menzilini gözlemleyenin rolüne göre uygular', () => {
    const { particles, grid } = pair(100, 164, 0, 2);
    const config = {
      ...particleConfig,
      interactionRadiusByRolePair: new Float32Array([128, 32, 128, 128, 128, 128, 128, 128, 128]),
    };

    accumulateParticleForces(particles, grid, config);

    expect(particles.forceX[0]).toBe(0);
    expect(particles.forceX[1]).not.toBe(0);
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

  it('sert duvar temasında seker, yumuşak temasta yüzeyden ayrılır', () => {
    const particles = new ParticleStore(2);
    particles.x.set([5, 4.55]);
    particles.y.set([100, 200]);
    particles.vx.set([-2, -0.1]);
    particles.vy.set([0.5, 0.5]);

    integrateParticles(particles, particleConfig, worldConfig.boundsUnits, worldConfig.fixedStepMs);

    expect(particles.x[0]).toBeGreaterThan(particleConfig.radiusUnits);
    expect(particles.vx[0]).toBeGreaterThan(0);
    expect(particles.x[1]).toBeGreaterThanOrEqual(particleConfig.radiusUnits);
    expect(particles.vx[1]).toBeGreaterThan(0);
    expect(particles.vy[1]).toBeGreaterThan(0);
  });

  it('penetrasyon yokken görünmez wall spring uygulamaz', () => {
    const particles = new ParticleStore(1);
    particles.x[0] = particleConfig.radiusUnits + 6;
    particles.y[0] = 200;

    integrateParticles(particles, particleConfig, worldConfig.boundsUnits, worldConfig.fixedStepMs);

    expect(particles.x[0]).toBe(particleConfig.radiusUnits + 6);
    expect(particles.vx[0]).toBe(0);
  });

  it('sürekli dışarı itilen parçacığı sınır düzlemine kilitlemez', () => {
    const particles = new ParticleStore(1);
    const minimumX = particleConfig.radiusUnits;
    particles.x[0] = minimumX + 1;
    particles.y[0] = 200;
    particles.vx[0] = -0.1;
    let exactContactTicks = 0;
    let furthestSeparation = 0;

    for (let tick = 0; tick < 3_600; tick++) {
      particles.forceX[0] = -0.08;
      integrateParticles(
        particles,
        particleConfig,
        worldConfig.boundsUnits,
        worldConfig.fixedStepMs,
      );
      if (particles.x[0] <= minimumX + 1e-5) exactContactTicks++;
      furthestSeparation = Math.max(furthestSeparation, particles.x[0] - minimumX);
    }

    expect(exactContactTicks).toBeLessThan(900);
    expect(furthestSeparation).toBeGreaterThan(0.5);
  });

  it('köşede iki normal bileşeni çözer ve teğetsel hareketi korur', () => {
    const corner = new ParticleStore(1);
    corner.x[0] = particleConfig.radiusUnits + 0.1;
    corner.y[0] = particleConfig.radiusUnits + 0.1;
    corner.vx[0] = -2;
    corner.vy[0] = -1.5;

    integrateParticles(corner, particleConfig, worldConfig.boundsUnits, worldConfig.fixedStepMs);

    expect(corner.vx[0]).toBeGreaterThan(0);
    expect(corner.vy[0]).toBeGreaterThan(0);

    const grazing = new ParticleStore(1);
    grazing.x[0] = particleConfig.radiusUnits + 0.1;
    grazing.y[0] = 200;
    grazing.vx[0] = -0.2;
    grazing.vy[0] = 1;

    integrateParticles(grazing, particleConfig, worldConfig.boundsUnits, worldConfig.fixedStepMs);

    expect(grazing.vx[0]).toBeGreaterThan(0);
    expect(grazing.vy[0]).toBeGreaterThan(0.9);
  });

  it('dünya parçacık çapından küçük olduğunda initializeParticles RangeError fırlatır', () => {
    const particles = new ParticleStore(10);
    const smallBounds = { x: 0, y: 0, width: 2, height: 2 };
    expect(() =>
      initializeParticles(particles, createSimRandom(42), particleConfig, smallBounds),
    ).toThrow(RangeError);
  });

  it('geçersiz stepMs verildiğinde integrateParticles RangeError fırlatır', () => {
    const particles = new ParticleStore(1);
    expect(() => integrateParticles(particles, particleConfig, worldConfig.boundsUnits, 0)).toThrow(
      RangeError,
    );
    expect(() =>
      integrateParticles(particles, particleConfig, worldConfig.boundsUnits, -5),
    ).toThrow(RangeError);
    expect(() =>
      integrateParticles(particles, particleConfig, worldConfig.boundsUnits, Number.NaN),
    ).toThrow(RangeError);
  });

  it('sağ ve alt duvarlara çarpan parçacığın hız ve konumu sınır içine döndürülür', () => {
    const maxX =
      worldConfig.boundsUnits.x + worldConfig.boundsUnits.width - particleConfig.radiusUnits;
    const maxY =
      worldConfig.boundsUnits.y + worldConfig.boundsUnits.height - particleConfig.radiusUnits;
    const particles = new ParticleStore(2);
    particles.x.set([maxX - 0.1, 100]);
    particles.y.set([100, maxY - 0.1]);
    particles.vx.set([2, 0.5]);
    particles.vy.set([0.5, 2]);

    integrateParticles(particles, particleConfig, worldConfig.boundsUnits, worldConfig.fixedStepMs);

    expect(particles.x[0]).toBeLessThanOrEqual(maxX);
    expect(particles.vx[0]).toBeLessThan(0);
    expect(particles.y[1]).toBeLessThanOrEqual(maxY);
    expect(particles.vy[1]).toBeLessThan(0);
  });

  it('aynı tohumla aynı başlangıç dizilerini üretir', () => {
    const left = new ParticleStore(100);
    const right = new ParticleStore(100);

    initializeParticles(left, createSimRandom(42), particleConfig, worldConfig.boundsUnits);
    initializeParticles(right, createSimRandom(42), particleConfig, worldConfig.boundsUnits);

    expect(left.snapshot()).toEqual(right.snapshot());
  });
});
