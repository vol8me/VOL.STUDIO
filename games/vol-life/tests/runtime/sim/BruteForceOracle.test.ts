import { describe, expect, it } from 'vitest';
import { defaultSubstrateCandidate } from '@/config/candidate';
import { particleConfig } from '@/config/particles';
import { substrateConfig } from '@/config/substrate';
import { createMultiBandKernel, type PairForceKernel } from '@/runtime/sim/PairForceKernel';
import { accumulateParticleForces } from '@/runtime/sim/ParticlePhysics';
import { ParticleSpatialHash } from '@/runtime/sim/ParticleSpatialHash';
import { ParticleStore } from '@/runtime/sim/ParticleStore';

function bruteForceForces(
  particles: ParticleStore,
  kernel: PairForceKernel,
  forceScale: number,
): { fx: Float32Array; fy: Float32Array } {
  const fx = new Float32Array(particles.capacity);
  const fy = new Float32Array(particles.capacity);
  const rangeSquared = kernel.cutoffUnits ** 2;
  for (let i = 0; i < particles.capacity; i++) {
    if (particles.active[i] === 0) continue;
    for (let j = 0; j < particles.capacity; j++) {
      if (i === j || particles.active[j] === 0) continue;
      const dx = particles.x[j] - particles.x[i];
      const dy = particles.y[j] - particles.y[i];
      const distSq = dx * dx + dy * dy;
      if (distSq <= 0 || distSq >= rangeSquared) continue;
      const dist = Math.sqrt(distSq);
      const mag = kernel.magnitude(dist, particles.type[i], particles.type[j]) * forceScale;
      fx[i] += (dx / dist) * mag;
      fy[i] += (dy / dist) * mag;
    }
  }
  return { fx, fy };
}

function seededWorld(bound: number, count: number, seed: number): ParticleStore {
  const particles = new ParticleStore(count);
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const x = 100 + next() * (bound - 200);
    const y = 100 + next() * (bound - 200);
    const vx = (next() - 0.5) * 2;
    const vy = (next() - 0.5) * 2;
    const type = Math.floor(next() * 6);
    particles.activateSlot(x, y, vx, vy, type);
  }
  return particles;
}

const TOLERANCE = 1e-4;
const bounds = substrateConfig.world.boundsUnits;
const cellSize = particleConfig.cellSizeUnits;
const forceScale = defaultSubstrateCandidate.physics.dynamics.forceScale;

describe('Brute-force oracle: spatial-hash kernel vs all-pairs reference', () => {
  it('az parçacıkta kuvvetler özdeş', () => {
    const kernel = createMultiBandKernel(defaultSubstrateCandidate.physics);
    const particles = seededWorld(bounds.width, 8, 42);
    const grid = new ParticleSpatialHash(bounds, cellSize, particles.capacity);
    grid.rebuild(particles);
    accumulateParticleForces(particles, grid, kernel, forceScale);
    const ref = bruteForceForces(particles, kernel, forceScale);
    for (let i = 0; i < particles.capacity; i++) {
      if (particles.active[i] === 0) continue;
      expect(particles.forceX[i]).toBeCloseTo(ref.fx[i], 4);
      expect(particles.forceY[i]).toBeCloseTo(ref.fy[i], 4);
    }
  });

  it('çok parçacıkta kuvvetler tolerans içinde', () => {
    const kernel = createMultiBandKernel(defaultSubstrateCandidate.physics);
    const particles = seededWorld(bounds.width, 64, 123);
    const grid = new ParticleSpatialHash(bounds, cellSize, particles.capacity);
    grid.rebuild(particles);
    accumulateParticleForces(particles, grid, kernel, forceScale);
    const ref = bruteForceForces(particles, kernel, forceScale);
    let maxDiff = 0;
    for (let i = 0; i < particles.capacity; i++) {
      if (particles.active[i] === 0) continue;
      maxDiff = Math.max(maxDiff, Math.abs(particles.forceX[i] - ref.fx[i]));
      maxDiff = Math.max(maxDiff, Math.abs(particles.forceY[i] - ref.fy[i]));
    }
    expect(maxDiff).toBeLessThan(TOLERANCE);
  });

  it('pasif parçacıklar kuvvet hesabına girmez', () => {
    const kernel = createMultiBandKernel(defaultSubstrateCandidate.physics);
    const particles = seededWorld(bounds.width, 16, 7);
    particles.deactivateSlot(3);
    particles.deactivateSlot(7);
    const grid = new ParticleSpatialHash(bounds, cellSize, particles.capacity);
    grid.rebuild(particles);
    accumulateParticleForces(particles, grid, kernel, forceScale);
    const ref = bruteForceForces(particles, kernel, forceScale);
    for (let i = 0; i < particles.capacity; i++) {
      if (particles.active[i] === 0) {
        expect(particles.forceX[i]).toBe(0);
        expect(particles.forceY[i]).toBe(0);
        continue;
      }
      expect(particles.forceX[i]).toBeCloseTo(ref.fx[i], 4);
      expect(particles.forceY[i]).toBeCloseTo(ref.fy[i], 4);
    }
  });

  it('farklı tür çiftleri için kuvvetler doğru', () => {
    const kernel = createMultiBandKernel(defaultSubstrateCandidate.physics);
    const particles = new ParticleStore(12);
    for (let t = 0; t < 6; t++) {
      particles.activateSlot(200 + t * 20, 200, 0, 0, t);
      particles.activateSlot(200 + t * 20, 220, 0, 0, t);
    }
    const grid = new ParticleSpatialHash(bounds, cellSize, particles.capacity);
    grid.rebuild(particles);
    accumulateParticleForces(particles, grid, kernel, forceScale);
    const ref = bruteForceForces(particles, kernel, forceScale);
    for (let i = 0; i < particles.capacity; i++) {
      if (particles.active[i] === 0) continue;
      expect(particles.forceX[i]).toBeCloseTo(ref.fx[i], 4);
      expect(particles.forceY[i]).toBeCloseTo(ref.fy[i], 4);
    }
  });

  it('deterministik: aynı konumda iki koşu özdeş kuvvet üretir', () => {
    const kernel = createMultiBandKernel(defaultSubstrateCandidate.physics);
    const particles1 = seededWorld(bounds.width, 32, 999);
    const particles2 = seededWorld(bounds.width, 32, 999);
    const grid1 = new ParticleSpatialHash(bounds, cellSize, particles1.capacity);
    const grid2 = new ParticleSpatialHash(bounds, cellSize, particles2.capacity);
    grid1.rebuild(particles1);
    grid2.rebuild(particles2);
    accumulateParticleForces(particles1, grid1, kernel, forceScale);
    accumulateParticleForces(particles2, grid2, kernel, forceScale);
    for (let i = 0; i < particles1.capacity; i++) {
      expect(particles1.forceX[i]).toBeCloseTo(particles2.forceX[i], 8);
      expect(particles1.forceY[i]).toBeCloseTo(particles2.forceY[i], 8);
    }
  });

  it('kenar parçacıkları: sınır yakınında hash ile brute-force uyuşur', () => {
    const kernel = createMultiBandKernel(defaultSubstrateCandidate.physics);
    const particles = new ParticleStore(8);
    particles.activateSlot(10, 10, 0, 0, 0);
    particles.activateSlot(20, 10, 0, 0, 1);
    particles.activateSlot(bounds.width - 10, bounds.height - 10, 0, 0, 2);
    particles.activateSlot(bounds.width - 20, bounds.height - 10, 0, 0, 3);
    const grid = new ParticleSpatialHash(bounds, cellSize, particles.capacity);
    grid.rebuild(particles);
    accumulateParticleForces(particles, grid, kernel, forceScale);
    const ref = bruteForceForces(particles, kernel, forceScale);
    for (let i = 0; i < particles.capacity; i++) {
      if (particles.active[i] === 0) continue;
      expect(particles.forceX[i]).toBeCloseTo(ref.fx[i], 4);
      expect(particles.forceY[i]).toBeCloseTo(ref.fy[i], 4);
    }
  });
});
