import type { ParticleStore } from '@/runtime/sim/ParticleStore';

export class ParticleSpatialHash {
  readonly cellsPerAxis: number;
  readonly cellCount: number;
  private readonly counts: Uint32Array;
  private readonly offsets: Uint32Array;
  private readonly cursors: Uint32Array;
  private readonly sortedParticles: Uint32Array;

  constructor(
    readonly worldSize: number,
    readonly cellSize: number,
    capacity: number,
  ) {
    const cellsPerAxis = worldSize / cellSize;
    if (!Number.isInteger(cellsPerAxis) || cellsPerAxis < 3) {
      throw new RangeError('Dünya boyutu hücre boyutuna tam bölünmeli ve en az üç hücre olmalı.');
    }
    this.cellsPerAxis = cellsPerAxis;
    this.cellCount = cellsPerAxis * cellsPerAxis;
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
      this.counts[this.cellForPosition(particles.x[index], particles.y[index])]++;
    }
    this.offsets[0] = 0;
    for (let cell = 0; cell < this.cellCount; cell++) {
      this.offsets[cell + 1] = this.offsets[cell] + this.counts[cell];
      this.cursors[cell] = this.offsets[cell];
    }
    for (let index = 0; index < particles.count; index++) {
      const cell = this.cellForPosition(particles.x[index], particles.y[index]);
      this.sortedParticles[this.cursors[cell]++] = index;
    }
  }

  cellForPosition(x: number, y: number): number {
    return this.cellIndex(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
  }

  cellIndex(x: number, y: number): number {
    const wrappedX = wrapIndex(x, this.cellsPerAxis);
    const wrappedY = wrapIndex(y, this.cellsPerAxis);
    return wrappedY * this.cellsPerAxis + wrappedX;
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

function wrapIndex(value: number, size: number): number {
  return ((value % size) + size) % size;
}
