import type { Enemy } from '@/runtime/entity/Enemy';

/** Negatif hucre indekslerini pozitife tasiyan offset. */
const CELL_OFFSET = 1_000_000;
/** Anahtar adimi — offset'in iki kati olmali ki cy terimi cx hanesine tasmasin. */
const CELL_STRIDE = CELL_OFFSET * 2;

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

  /**
   * Numeric key — string allocation yok. cx/cy negatif olabildigi icin offset
   * eklenir; carpan offset'in IKI KATI olmak zorunda.
   *
   * Onceki hali `(cx + OFFSET) * OFFSET + (cy + OFFSET)` idi: cy >= 0 iken
   * ikinci terim OFFSET'i asip cx hanesine tasiyordu, yani
   * `key(cx, cy) === key(cx + 1, cy - OFFSET)`. Oyun alani sinirli oldugu icin
   * pratikte ulasilmazdi ama formul yanlisti.
   */
  private key(cx: number, cy: number): number {
    return (cx + CELL_OFFSET) * CELL_STRIDE + (cy + CELL_OFFSET);
  }

  /** Hücre dizilerini yeniden tahsis etmeden temizler; sonraki insertAll eski dizileri kullanır. */
  clear(): void {
    for (const cell of this.cells.values()) {
      cell.length = 0;
    }
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

  /** Aktif hücre sayısını döndürür — diagnostic amaçlı. */
  getCellCount(): number {
    return this.cells.size;
  }

  /**
   * Boş kalan hücreleri kaldırır — `insertAll` sonrası çağrılır.
   * Böylece haritada düşmanı olmayan eski hücreler birikmez.
   */
  trim(): void {
    for (const [key, cell] of this.cells) {
      if (cell.length === 0) {
        this.cells.delete(key);
      }
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
