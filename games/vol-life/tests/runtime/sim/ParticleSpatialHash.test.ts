import { describe, expect, it } from 'vitest';
import { ParticleSpatialHash } from '@/runtime/sim/ParticleSpatialHash';
import { ParticleStore } from '@/runtime/sim/ParticleStore';

const BOUNDS = { x: 0, y: 0, width: 384, height: 384 };

function sortedSlots(grid: ParticleSpatialHash, cell: number): number[] {
  const slots: number[] = [];
  for (let index = grid.start(cell); index < grid.end(cell); index++) {
    slots.push(grid.particleAt(index));
  }
  return slots.sort((left, right) => left - right);
}

describe('ParticleSpatialHash', () => {
  it('yalnız aktif parçacıkları counting-sort dizisine birer kez yazar', () => {
    const particles = new ParticleStore(5);
    particles.spawn(10, 10, 0, 0, 0);
    particles.spawn(20, 20, 0, 0, 0);
    particles.spawn(200, 200, 0, 0, 0);
    particles.spawn(300, 10, 0, 0, 0);
    particles.spawn(350, 350, 0, 0, 0);
    particles.deactivate(1);
    particles.deactivate(4);
    const grid = new ParticleSpatialHash(BOUNDS, 128, 5);

    grid.rebuild(particles);

    expect(grid.indexedCount).toBe(3);
    expect(sortedSlots(grid, grid.cellForPosition(10, 10)!)).toEqual([0]);
    expect(sortedSlots(grid, grid.cellForPosition(200, 200)!)).toEqual([2]);
    expect(sortedSlots(grid, grid.cellForPosition(300, 10)!)).toEqual([3]);
    expect(sortedSlots(grid, grid.cellForPosition(350, 350)!)).toEqual([]);
    let total = 0;
    for (let cell = 0; cell < grid.cellCount; cell++) total += grid.end(cell) - grid.start(cell);
    expect(total).toBe(3);
  });

  it('pasif slotun içeriği depolama dışında olsa da indekslemeyi bozmaz', () => {
    const particles = new ParticleStore(2);
    particles.spawn(10, 10, 0, 0, 0);
    particles.spawn(10, 10, 0, 0, 0);
    particles.deactivate(1);
    particles.x[1] = -9999;
    const grid = new ParticleSpatialHash(BOUNDS, 128, 2);

    expect(() => grid.rebuild(particles)).not.toThrow();
    expect(grid.indexedCount).toBe(1);
  });

  it('aktif parçacık depolama dışına çıkarsa sessizce yutmaz, RangeError fırlatır', () => {
    const particles = new ParticleStore(1);
    particles.spawn(-1, 10, 0, 0, 0);
    const grid = new ParticleSpatialHash(BOUNDS, 128, 1);
    expect(() => grid.rebuild(particles)).toThrow(/depolama sınırının dışında/);
  });

  it('kapasite ve geometri sözleşmelerini kurulumda ya da rebuild’de reddeder', () => {
    expect(() => new ParticleSpatialHash(BOUNDS, 100, 1)).toThrow(RangeError);
    expect(() => new ParticleSpatialHash({ ...BOUNDS, width: 256 }, 128, 1)).toThrow(RangeError);
    expect(() => new ParticleSpatialHash(BOUNDS, 128, 0)).toThrow(RangeError);
    const grid = new ParticleSpatialHash(BOUNDS, 128, 1);
    expect(() => grid.rebuild(new ParticleStore(2))).toThrow(/kapasitesini aşıyor/);
  });

  it('hücre indeksi ızgara dışında null, içinde satır-major indekstir', () => {
    const grid = new ParticleSpatialHash(BOUNDS, 128, 1);
    expect(grid.cellIndex(-1, 0)).toBeNull();
    expect(grid.cellIndex(0, 3)).toBeNull();
    expect(grid.cellIndex(2, 1)).toBe(5);
    expect(grid.cellForPosition(383.9, 383.9)).toBe(8);
    expect(grid.cellForPosition(384, 0)).toBeNull();
  });
});
