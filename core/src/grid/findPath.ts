import { ORTHOGONAL_NEIGHBOURS, type GridPoint } from './Grid';

export interface FindPathOptions {
  /** Hücre geçilebilir mi? Verilmezse her hücre geçilebilir sayılır. */
  isWalkable?: (point: GridPoint) => boolean;
  /**
   * Bir hücreye girmenin maliyeti (varsayılan 1). Yavaşlatan zemin, tercih
   * edilen yol gibi ağırlıklar buradan gelir. Pozitif olmalı.
   */
  cost?: (point: GridPoint) => number;
  /** Komşuluk tanımı; varsayılan dört yön. */
  neighbours?: readonly GridPoint[];
  /**
   * Genişletilecek azami düğüm sayısı — ulaşılamaz bir hedefte aramanın tüm
   * haritayı taramasını sınırlar. Varsayılan `cols * rows`.
   */
  maxNodes?: number;
}

/** Sabit kapasiteli ikili yığın (min-heap) — A*'ın açık listesi. */
class MinHeap {
  private readonly keys: number[] = [];
  private readonly values: number[] = [];

  get size(): number {
    return this.values.length;
  }

  push(value: number, key: number): void {
    this.values.push(value);
    this.keys.push(key);
    let i = this.values.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= this.keys[i]) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  pop(): number | undefined {
    if (this.values.length === 0) return undefined;
    const top = this.values[0];
    const lastValue = this.values.pop()!;
    const lastKey = this.keys.pop()!;

    if (this.values.length > 0) {
      this.values[0] = lastValue;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.keys.length && this.keys[left] < this.keys[smallest]) smallest = left;
        if (right < this.keys.length && this.keys[right] < this.keys[smallest]) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.values[a], this.values[b]] = [this.values[b], this.values[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}

/**
 * Izgara üzerinde A* ile en kısa yol.
 *
 * Izgaranın İÇERİĞİNİ bilmez: geçilebilirlik ve maliyet çağırandan gelen
 * fonksiyonlardır, yani duvar/su/yol kavramları tüketicinin sözlüğünde kalır.
 *
 * **Sezgisel (heuristic)** komşuluğa göre seçilir: dört yönde Manhattan,
 * çaprazlı komşulukta Chebyshev. Sezgiselin gerçek maliyeti ASLA AŞMAMASI
 * (admissible olması) A*'ın en kısa yolu bulma garantisinin koşuludur; çapraz
 * harekette Manhattan kullanmak bu garantiyi bozar ve daha uzun yollar üretir.
 *
 * @returns Başlangıçtan hedefe hücre dizisi (ikisi de dahil); yol yoksa `null`.
 *   Başlangıç hedefe eşitse tek elemanlı dizi.
 */
export function findPath(
  gridSize: { cols: number; rows: number },
  start: GridPoint,
  goal: GridPoint,
  options: FindPathOptions = {},
): GridPoint[] | null {
  const { cols, rows } = gridSize;
  const neighbours = options.neighbours ?? ORTHOGONAL_NEIGHBOURS;
  const isWalkable = options.isWalkable ?? (() => true);
  const costOf = options.cost ?? (() => 1);
  const maxNodes = options.maxNodes ?? cols * rows;

  const inBounds = (p: GridPoint): boolean =>
    p.col >= 0 && p.row >= 0 && p.col < cols && p.row < rows;

  if (!inBounds(start) || !inBounds(goal)) return null;
  if (!isWalkable(start) || !isWalkable(goal)) return null;

  const index = (p: GridPoint): number => p.row * cols + p.col;
  const startIndex = index(start);
  const goalIndex = index(goal);
  if (startIndex === goalIndex) return [start];

  // Çapraz komşuluk varsa Chebyshev, yoksa Manhattan — admissible kalması için.
  const hasDiagonal = neighbours.some((n) => n.col !== 0 && n.row !== 0);
  const heuristic = (col: number, row: number): number => {
    const dx = Math.abs(col - goal.col);
    const dy = Math.abs(row - goal.row);
    return hasDiagonal ? Math.max(dx, dy) : dx + dy;
  };

  const gScore = new Float64Array(cols * rows).fill(Infinity);
  const cameFrom = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);

  gScore[startIndex] = 0;
  const open = new MinHeap();
  open.push(startIndex, heuristic(start.col, start.row));

  let expanded = 0;

  while (open.size > 0) {
    const currentIndex = open.pop()!;
    if (closed[currentIndex]) continue;
    closed[currentIndex] = 1;

    if (currentIndex === goalIndex) {
      const path: GridPoint[] = [];
      for (let at = goalIndex; at !== -1; at = cameFrom[at]) {
        path.push({ col: at % cols, row: Math.floor(at / cols) });
      }
      return path.reverse();
    }

    if (++expanded > maxNodes) return null;

    const col = currentIndex % cols;
    const row = Math.floor(currentIndex / cols);

    for (const offset of neighbours) {
      const next = { col: col + offset.col, row: row + offset.row };
      if (!inBounds(next)) continue;

      const nextIndex = index(next);
      if (closed[nextIndex] || !isWalkable(next)) continue;

      const step = costOf(next);
      if (!(step > 0) || !Number.isFinite(step)) continue;

      // Çapraz adım daha uzundur; 1 saymak yolu çaprazlara doğru çarpıtırdı.
      const diagonal = offset.col !== 0 && offset.row !== 0;
      const tentative = gScore[currentIndex] + step * (diagonal ? Math.SQRT2 : 1);

      if (tentative < gScore[nextIndex]) {
        gScore[nextIndex] = tentative;
        cameFrom[nextIndex] = currentIndex;
        open.push(nextIndex, tentative + heuristic(next.col, next.row));
      }
    }
  }

  return null;
}
