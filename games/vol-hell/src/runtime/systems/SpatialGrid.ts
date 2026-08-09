import type { Enemy } from '@/runtime/entity/Enemy';

/**
 * Hücre bazlı spatial partitioning — çarpışma kontrolünü O(N·M)'den O(N·k)'ya düşürür.
 * Her frame'de clear + rebuild, sonra komşu hücreleri sorgula.
 * Numeric key ve reusable buffer ile sıfır allocation çalışır.
 */
export class SpatialGrid {
  private cellSize: number;
  private cells: Map<number, Enemy[]> = new Map();
  private readonly resultBuffer: Enemy[] = [];

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  /** Numeric key — string allocation yok. cx/cy negatif olabilir, offset gerekir. */
  private key(cx: number, cy: number): number {
    return (cx + 100000) * 200000 + (cy + 100000);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(enemy: Enemy): void {
    const cx = Math.floor(enemy.x / this.cellSize);
    const cy = Math.floor(enemy.y / this.cellSize);
    const k = this.key(cx, cy);
    let cell = this.cells.get(k);
    if (!cell) {
      cell = [];
      this.cells.set(k, cell);
    }
    cell.push(enemy);
  }

  insertAll(enemies: readonly Enemy[]): void {
    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;
      this.insert(enemy);
    }
  }

  /**
   * Verilen pozisyona yakın düşmanları döndürür — kendi hücresi + 8 komşu hücre.
   * Ölü düşmanlar filtrelenir. Dönen array reusable'dır — başka queryNearby
   * çağrısında üzerine yazılır. Sonuçu hemen tüket, saklama.
   */
  queryNearby(x: number, y: number): Enemy[] {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    this.resultBuffer.length = 0;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = this.cells.get(this.key(cx + dx, cy + dy));
        if (!cell) continue;
        for (const enemy of cell) {
          if (enemy.isAlive) this.resultBuffer.push(enemy);
        }
      }
    }

    return this.resultBuffer;
  }
}
