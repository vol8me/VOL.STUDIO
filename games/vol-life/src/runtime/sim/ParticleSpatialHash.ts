import type { Rect } from '@volstudio/core/math/geometry';
import type { ParticleStore } from '@/runtime/sim/ParticleStore';

export class ParticleSpatialHash {
  readonly cellsX: number;
  readonly cellsY: number;
  readonly cellCount: number;
  private readonly counts: Uint32Array;
  private readonly offsets: Uint32Array;
  private readonly cursors: Uint32Array;
  private readonly sortedParticles: Uint32Array;

  constructor(
    readonly bounds: Readonly<Rect>,
    readonly cellSize: number,
    capacity: number,
  ) {
    const cellsX = bounds.width / cellSize;
    const cellsY = bounds.height / cellSize;
    if (!Number.isInteger(cellsX) || !Number.isInteger(cellsY) || cellsX < 3 || cellsY < 3) {
      throw new RangeError(
        'Dünya boyutları hücre boyutuna tam bölünmeli ve en az üç hücre olmalı.',
      );
    }
    this.cellsX = cellsX;
    this.cellsY = cellsY;
    this.cellCount = cellsX * cellsY;
    this.counts = new Uint32Array(this.cellCount);
    this.offsets = new Uint32Array(this.cellCount + 1);
    this.cursors = new Uint32Array(this.cellCount);
    this.sortedParticles = new Uint32Array(capacity);
  }

  rebuild(particles: ParticleStore): void {
    if (particles.count > this.sortedParticles.length) {
      throw new RangeError('Parçacık sayısı spatial hash kapasitesini aşıyor.');
    }
    this.counts.fill(0);
    for (let index = 0; index < particles.count; index++) {
      const cell = this.cellForPosition(particles.x[index], particles.y[index]);
      if (cell === null) throw new RangeError('Parçacık fiziksel dünya sınırının dışında.');
      this.counts[cell]++;
    }
    this.offsets[0] = 0;
    for (let cell = 0; cell < this.cellCount; cell++) {
      this.offsets[cell + 1] = this.offsets[cell] + this.counts[cell];
      this.cursors[cell] = this.offsets[cell];
    }
    for (let index = 0; index < particles.count; index++) {
      const cell = this.cellForPosition(particles.x[index], particles.y[index]);
      if (cell === null) throw new RangeError('Parçacık fiziksel dünya sınırının dışında.');
      this.sortedParticles[this.cursors[cell]++] = index;
    }
  }

  cellForPosition(x: number, y: number): number | null {
    return this.cellIndex(
      Math.floor((x - this.bounds.x) / this.cellSize),
      Math.floor((y - this.bounds.y) / this.cellSize),
    );
  }

  cellIndex(x: number, y: number): number | null {
    if (x < 0 || x >= this.cellsX || y < 0 || y >= this.cellsY) return null;
    return y * this.cellsX + x;
  }

  start(cell: number): number {
    return this.offsets[cell];
  }

  end(cell: number): number {
    return this.offsets[cell + 1];
  }

  particleAt(slot: number): number {
    return this.sortedParticles[slot];
  }
}
