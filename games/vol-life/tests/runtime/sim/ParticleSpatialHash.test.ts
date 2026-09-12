import { describe, expect, it } from 'vitest';
import { ParticleSpatialHash } from '@/runtime/sim/ParticleSpatialHash';
import { ParticleStore } from '@/runtime/sim/ParticleStore';

describe('ParticleSpatialHash', () => {
  it('parçacıkları önceden ayrılmış counting-sort dizisine birer kez yazar', () => {
    const particles = new ParticleStore(5);
    particles.x.set([1, 130, 260, 900, 1023]);
    particles.y.set([1, 130, 260, 900, 1023]);
    const grid = new ParticleSpatialHash(1024, 128, particles.count);

    grid.rebuild(particles);

    const sorted = Array.from({ length: particles.count }, (_, slot) => grid.particleAt(slot));
    expect(sorted.sort((left, right) => left - right)).toEqual([0, 1, 2, 3, 4]);
    expect(grid.cellCount).toBe(64);
  });

  it('hücre koordinatını iki eksende toroidal sarar', () => {
    const grid = new ParticleSpatialHash(1024, 128, 1);

    expect(grid.cellIndex(-1, 0)).toBe(7);
    expect(grid.cellIndex(8, 0)).toBe(0);
    expect(grid.cellIndex(0, -1)).toBe(56);
  });
});
