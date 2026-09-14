import type { Rect } from '@volstudio/core/math/geometry';
import type { ParticleStore } from '@/runtime/sim/ParticleStore';

/** Counting-sort hücre indeksi; yalnız AKTİF parçacıkları indeksler. */
export class ParticleSpatialHash {
  readonly cellsX: number;
  readonly cellsY: number;
  readonly cellCount: number;
  private readonly counts: Uint32Array;
  private readonly offsets: Uint32Array;
  private readonly cursors: Uint32Array;
  private readonly sortedParticles: Uint32Array;
  private indexed = 0;

  constructor(
    readonly bounds: Readonly<Rect>,
    readonly cellSize: number,
    capacity: number,
  ) {
    const cellsX = bounds.width / cellSize;
    const cellsY = bounds.height / cellSize;
    if (!Number.isInteger(cellsX) || !Number.isInteger(cellsY) || cellsX < 3 || cellsY < 3) {
      throw new RangeError(
        'Depolama boyutları hücre boyutuna tam bölünmeli ve en az üç hücre olmalı.',
      );
    }
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`Spatial hash kapasitesi pozitif tam sayı olmalı: ${capacity}`);
    }
    this.cellsX = cellsX;
    this.cellsY = cellsY;
    this.cellCount = cellsX * cellsY;
    this.counts = new Uint32Array(this.cellCount);
    this.offsets = new Uint32Array(this.cellCount + 1);
    this.cursors = new Uint32Array(this.cellCount);
    this.sortedParticles = new Uint32Array(capacity);
  }

  /** İndekslenen aktif parçacık sayısı; son `rebuild` sonrası geçerli. */
  get indexedCount(): number {
    return this.indexed;
  }

  rebuild(particles: ParticleStore): void {
    if (particles.capacity > this.sortedParticles.length) {
      throw new RangeError('Parçacık kapasitesi spatial hash kapasitesini aşıyor.');
    }
    this.counts.fill(0);
    const { active, x, y, capacity } = particles;
    for (let slot = 0; slot < capacity; slot++) {
      if (active[slot] === 0) continue;
      this.counts[this.requireCell(x[slot], y[slot])]++;
    }
    this.offsets[0] = 0;
    for (let cell = 0; cell < this.cellCount; cell++) {
      this.offsets[cell + 1] = this.offsets[cell] + this.counts[cell];
      this.cursors[cell] = this.offsets[cell];
    }
    for (let slot = 0; slot < capacity; slot++) {
      if (active[slot] === 0) continue;
      this.sortedParticles[this.cursors[this.requireCell(x[slot], y[slot])]++] = slot;
    }
    this.indexed = this.offsets[this.cellCount];
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

  private requireCell(x: number, y: number): number {
    const cell = this.cellForPosition(x, y);
    if (cell === null) throw new RangeError('Aktif parçacık depolama sınırının dışında.');
    return cell;
  }
}
