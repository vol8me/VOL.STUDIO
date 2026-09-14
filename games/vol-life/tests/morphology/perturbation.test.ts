import { describe, expect, it } from 'vitest';
import {
  PerturbationSystem,
  defaultPerturbationConfig,
} from '@/../scripts/morphology/perturbation';
import { ParticleStore } from '@/runtime/sim/ParticleStore';

describe('PerturbationSystem', () => {
  it('snapshot boş dünyada sıfır metrik üretir', () => {
    const system = new PerturbationSystem(defaultPerturbationConfig);
    const particles = new ParticleStore(4);
    const snap = system.snapshot(particles);
    expect(snap.activeCount).toBe(0);
    expect(snap.meanSpeed).toBe(0);
  });

  it('velocity-kick hızı değiştirir', () => {
    const system = new PerturbationSystem(defaultPerturbationConfig);
    const particles = new ParticleStore(4);
    particles.spawn(500, 500, 0, 0, 0);
    particles.spawn(520, 500, 0, 0, 0);
    const before = Math.hypot(particles.vx[0], particles.vy[0]);
    system.apply(null as never, particles, {
      kind: 'velocity-kick',
      magnitude: 3,
      targetFraction: 1,
      tick: 42,
    });
    const after = Math.hypot(particles.vx[0], particles.vy[0]);
    expect(after).not.toBeCloseTo(before, 3);
  });

  it('position-shift konumu değiştirir', () => {
    const system = new PerturbationSystem(defaultPerturbationConfig);
    const particles = new ParticleStore(4);
    particles.spawn(500, 500, 0, 0, 0);
    const before = particles.x[0];
    system.apply(null as never, particles, {
      kind: 'position-shift',
      magnitude: 20,
      targetFraction: 1,
      tick: 7,
    });
    expect(particles.x[0]).not.toBeCloseTo(before, 1);
  });

  it('matter-removal parçacığı pasifleştirir', () => {
    const system = new PerturbationSystem(defaultPerturbationConfig);
    const particles = new ParticleStore(4);
    particles.spawn(500, 500, 0, 0, 0);
    particles.spawn(520, 500, 0, 0, 0);
    expect(particles.activeCount).toBe(2);
    system.apply(null as never, particles, {
      kind: 'matter-removal',
      magnitude: 0,
      targetFraction: 0.5,
      tick: 0,
    });
    expect(particles.activeCount).toBe(1);
  });

  it('force-pulse merkezden dışarı kuvvet uygular', () => {
    const system = new PerturbationSystem(defaultPerturbationConfig);
    const particles = new ParticleStore(4);
    particles.spawn(500, 500, 0, 0, 0);
    particles.spawn(510, 500, 0, 0, 0);
    const before = Math.hypot(particles.vx[0], particles.vy[0]);
    system.apply(null as never, particles, {
      kind: 'force-pulse',
      magnitude: 2,
      targetFraction: 1,
      tick: 0,
    });
    const after = Math.hypot(particles.vx[0], particles.vy[0]);
    expect(after).toBeGreaterThan(before);
  });

  it('snapshot aktif parçacık metriklerini ölçer', () => {
    const system = new PerturbationSystem(defaultPerturbationConfig);
    const particles = new ParticleStore(4);
    particles.spawn(500, 500, 1, 0, 0);
    particles.spawn(520, 500, 0, 1, 0);
    const snap = system.snapshot(particles);
    expect(snap.activeCount).toBe(2);
    expect(snap.meanSpeed).toBeCloseTo(1, 5);
  });
});
