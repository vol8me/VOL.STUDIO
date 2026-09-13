import { describe, expect, it } from 'vitest';
import { ParticleSpatialHash } from '@/runtime/sim/ParticleSpatialHash';
import { ParticleStore } from '@/runtime/sim/ParticleStore';

describe('ParticleSpatialHash', () => {
  it('parçacıkları önceden ayrılmış counting-sort dizisine birer kez yazar', () => {
    const particles = new ParticleStore(5);
    particles.x.set([1, 130, 260, 900, 1023]);
    particles.y.set([1, 130, 260, 900, 1023]);
    const grid = new ParticleSpatialHash(
      { x: 0, y: 0, width: 1024, height: 1024 },
      128,
      particles.count,
    );

    grid.rebuild(particles);

    const sorted = Array.from({ length: particles.count }, (_, slot) => grid.particleAt(slot));
    expect(sorted.sort((left, right) => left - right)).toEqual([0, 1, 2, 3, 4]);
    expect(grid.cellCount).toBe(64);
  });

  it('dünya dışındaki hücreleri karşı kenara sarmaz', () => {
    const grid = new ParticleSpatialHash({ x: 0, y: 0, width: 1024, height: 1024 }, 128, 1);

    expect(grid.cellIndex(-1, 0)).toBeNull();
    expect(grid.cellIndex(8, 0)).toBeNull();
    expect(grid.cellIndex(0, -1)).toBeNull();
    expect(grid.cellIndex(0, 8)).toBeNull();
    expect(grid.cellIndex(7, 7)).toBe(63);
  });

  it('bölünmeyen veya üçten az hücre veren sınırlarda RangeError fırlatır', () => {
    expect(() => new ParticleSpatialHash({ x: 0, y: 0, width: 100, height: 100 }, 30, 1)).toThrow(
      RangeError,
    );
    expect(() => new ParticleSpatialHash({ x: 0, y: 0, width: 128, height: 128 }, 64, 1)).toThrow(
      RangeError,
    );
  });

  it('kapasite aşıldığında veya sınır dışı parçacıkta RangeError fırlatır', () => {
    const grid = new ParticleSpatialHash({ x: 0, y: 0, width: 512, height: 512 }, 128, 1);
    const particles = new ParticleStore(2);
    expect(() => grid.rebuild(particles)).toThrow(RangeError);

    const single = new ParticleStore(1);
    single.x[0] = -10;
    single.y[0] = 100;
    expect(() => grid.rebuild(single)).toThrow(RangeError);
  });
});
