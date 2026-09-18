import { describe, expect, it } from 'vitest';
import type { SubstratePhysicsProfile } from '@/config/genome';
import { defaultSubstrateCandidate } from '@/config/candidate';
import { particleConfig } from '@/config/particles';
import { substrateConfig } from '@/config/substrate';
import { accumulateParticleForces, integrateParticles } from '@/runtime/sim/ParticlePhysics';
import { createMultiBandKernel } from '@/runtime/sim/PairForceKernel';
import { ParticleSpatialHash } from '@/runtime/sim/ParticleSpatialHash';
import { ParticleStore } from '@/runtime/sim/ParticleStore';

const BOUNDS = substrateConfig.world.boundsUnits;
const DYNAMICS = defaultSubstrateCandidate.physics.dynamics;
const KERNEL = createMultiBandKernel(defaultSubstrateCandidate.physics);

function pair(
  leftX: number,
  rightX: number,
  leftType = 0,
  rightType = 1,
  genome: SubstratePhysicsProfile = defaultSubstrateCandidate.physics,
) {
  const particles = new ParticleStore(2);
  const centerY = BOUNDS.y + BOUNDS.height / 2;
  particles.activateSlot(leftX, centerY, 0, 0, leftType);
  particles.activateSlot(rightX, centerY, 0, 0, rightType);
  const grid = new ParticleSpatialHash(BOUNDS, particleConfig.cellSizeUnits, 2);
  grid.rebuild(particles);
  const kernel =
    genome === defaultSubstrateCandidate.physics ? KERNEL : createMultiBandKernel(genome);
  return { particles, grid, kernel };
}

describe('parçacık kuvvet biriktirimi', () => {
  it('çok yakın bütün türleri ortak sert çekirdekle birbirinden iter', () => {
    const { particles, grid, kernel } = pair(100, 105);

    accumulateParticleForces(particles, grid, kernel, 1);

    expect(particles.forceX[0]).toBeLessThan(0);
    expect(particles.forceX[1]).toBeGreaterThan(0);
  });

  it('orta mesafede yönlü ve asimetrik tür matrisini uygular', () => {
    const { particles, grid, kernel } = pair(100, 150, 0, 1);

    accumulateParticleForces(particles, grid, kernel, 1);

    expect(particles.forceX[0]).not.toBeCloseTo(-particles.forceX[1], 6);
  });

  it('menzil dışındaki parçacıklara kuvvet uygulamaz', () => {
    const { particles, grid, kernel } = pair(5, 1019);

    accumulateParticleForces(particles, grid, kernel, 1);

    expect(particles.forceX[0]).toBe(0);
    expect(particles.forceX[1]).toBe(0);
  });

  it('kuvvet biriktirirken konumu değiştirmez', () => {
    const { particles, grid, kernel } = pair(100, 105);
    const before = particles.x.slice();

    accumulateParticleForces(particles, grid, kernel, 1);

    expect(particles.x).toEqual(before);
  });

  it('tam üst üste binen parçacıklarda (singularity) deterministik itiş kuvveti üretir', () => {
    const { particles, grid, kernel } = pair(100, 100);
    accumulateParticleForces(particles, grid, kernel, 1);

    expect(particles.forceX[0]).toBeGreaterThan(0);
    expect(particles.forceX[1]).toBeLessThan(0);
    expect(particles.forceX[0] + particles.forceX[1]).toBeCloseTo(0);
  });

  it('aktif olmayan slotlar kuvvet hesabına katılmaz', () => {
    const particles = new ParticleStore(2);
    particles.x.set([100, 105]);
    particles.y.set([200, 200]);
    particles.type.set([0, 1]);
    particles.active.set([1, 0]);
    const grid = new ParticleSpatialHash(BOUNDS, particleConfig.cellSizeUnits, 2);
    grid.rebuild(particles);

    accumulateParticleForces(particles, grid, KERNEL, 1);

    expect(particles.forceX[0]).toBe(0);
    expect(particles.forceX[1]).toBe(0);
  });

  it('geçersiz kuvvet ölçeği RangeError fırlatır', () => {
    const { particles, grid, kernel } = pair(100, 105);

    expect(() => accumulateParticleForces(particles, grid, kernel, 0)).toThrow(RangeError);
    expect(() => accumulateParticleForces(particles, grid, kernel, -1)).toThrow(RangeError);
    expect(() => accumulateParticleForces(particles, grid, kernel, Number.NaN)).toThrow(RangeError);
  });

  it('kernel menzili hücre boyutunu aşarsa RangeError fırlatır', () => {
    const { particles, grid } = pair(100, 105);
    const wideKernel = { cutoffUnits: 999, magnitude: () => 0 };

    expect(() => accumulateParticleForces(particles, grid, wideKernel, 1)).toThrow(RangeError);
  });

  it('hacim dışlama gradyanı çok yakın parçacıklarda ek itme sağlar ve kitle çökmesini önler', () => {
    const { particles, grid, kernel } = pair(100, 113, 0, 0);
    accumulateParticleForces(particles, grid, kernel, 1, 16, 0.5);
    const withExclusion = particles.forceX[0];

    const { particles: pNoEx, grid: gNoEx, kernel: kNoEx } = pair(100, 113, 0, 0);
    accumulateParticleForces(pNoEx, gNoEx, kNoEx, 1, 16, 0);
    const withoutExclusion = pNoEx.forceX[0];

    expect(withExclusion).toBeLessThan(withoutExclusion);
  });

  it('sert temas bariyeri d < 2r mesafesinde ıraksak itme ile penetrasyonu engeller', () => {
    const { particles, grid, kernel } = pair(100, 107, 0, 0);
    accumulateParticleForces(particles, grid, kernel, 1, 18, 2.4, 9.0, 4.0);
    const withContact = particles.forceX[0];

    const { particles: pNoCt, grid: gNoCt, kernel: kNoCt } = pair(100, 107, 0, 0);
    accumulateParticleForces(pNoCt, gNoCt, kNoCt, 1, 18, 2.4, 9.0, 0);
    const withoutContact = pNoCt.forceX[0];

    expect(withContact).toBeLessThan(withoutContact);
    expect(particles.forceX[0]).toBeLessThan(-1.0);
    expect(particles.forceX[1]).toBeGreaterThan(1.0);
  });
});

describe('parçacık entegrasyonu', () => {
  it('sönümleme uygular ve hız tavanını aşmaz', () => {
    const particles = new ParticleStore(1);
    particles.activateSlot(500, 500, 999, 999, 0);

    integrateParticles(
      particles,
      DYNAMICS,
      particleConfig.referenceHz,
      1000 / particleConfig.referenceHz,
    );

    expect(Math.hypot(particles.vx[0], particles.vy[0])).toBeLessThanOrEqual(
      DYNAMICS.maxSpeedUnitsPerReferenceTick + 1e-6,
    );
  });

  it('duvar, clamp veya sekme uygulamaz; parçacık sınır dışına çıkabilir', () => {
    const particles = new ParticleStore(1);
    particles.activateSlot(5, 200, -2, 0.5, 0);

    integrateParticles(
      particles,
      DYNAMICS,
      particleConfig.referenceHz,
      1000 / particleConfig.referenceHz,
    );

    expect(particles.x[0]).toBeLessThan(5);
    expect(particles.vx[0]).toBeLessThan(0);
  });

  it('kuvvet hızını ve konumu günceller', () => {
    const particles = new ParticleStore(1);
    particles.activateSlot(500, 500, 0, 0, 0);
    particles.forceX[0] = 1;
    particles.forceY[0] = 0;

    integrateParticles(
      particles,
      DYNAMICS,
      particleConfig.referenceHz,
      1000 / particleConfig.referenceHz,
    );

    expect(particles.vx[0]).toBeGreaterThan(0);
    expect(particles.x[0]).toBeGreaterThan(500);
  });

  it('aktif olmayan slotların konumu değişmez', () => {
    const particles = new ParticleStore(1);
    particles.x[0] = 500;
    particles.y[0] = 500;
    particles.vx[0] = 999;
    particles.vy[0] = 999;

    integrateParticles(
      particles,
      DYNAMICS,
      particleConfig.referenceHz,
      1000 / particleConfig.referenceHz,
    );

    expect(particles.x[0]).toBe(500);
    expect(particles.y[0]).toBe(500);
    expect(particles.vx[0]).toBe(999);
    expect(particles.vy[0]).toBe(999);
  });

  it('geçersiz stepMs verildiğinde RangeError fırlatır', () => {
    const particles = new ParticleStore(1);
    particles.activateSlot(500, 500, 0, 0, 0);

    expect(() => integrateParticles(particles, DYNAMICS, particleConfig.referenceHz, 0)).toThrow(
      RangeError,
    );
    expect(() => integrateParticles(particles, DYNAMICS, particleConfig.referenceHz, -5)).toThrow(
      RangeError,
    );
    expect(() =>
      integrateParticles(particles, DYNAMICS, particleConfig.referenceHz, Number.NaN),
    ).toThrow(RangeError);
  });

  it('referenceHz ile stepMs çarpımı adım ölçeğini belirler', () => {
    const particles = new ParticleStore(1);
    particles.activateSlot(500, 500, 1, 0, 0);

    const stepMs = 1000 / particleConfig.referenceHz;
    const before = particles.x[0];
    integrateParticles(particles, DYNAMICS, particleConfig.referenceHz, stepMs);
    const deltaOne = particles.x[0] - before;

    particles.x[0] = 500;
    particles.vx[0] = 1;
    integrateParticles(particles, DYNAMICS, particleConfig.referenceHz, stepMs * 2);
    const deltaTwo = particles.x[0] - 500;

    expect(deltaTwo).toBeGreaterThan(deltaOne);
  });
});
