import { ORTHOGONAL_NEIGHBOURS, type GridPoint } from './Grid';

/** Sabit kapasiteli ikili yığın — Dijkstra açık listesi için. */
class MinHeap {
  private readonly values: number[] = [];
  private readonly keys: number[] = [];

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
        this.swap(smallest, i);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const v = this.values[a];
    this.values[a] = this.values[b];
    this.values[b] = v;
    const k = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = k;
  }
}

export interface FlowFieldOptions {
  /** Hücre geçilebilir mi? Verilmezse hepsi geçilebilir. */
  isWalkable?: (point: GridPoint) => boolean;
  /** Hücreye girme maliyeti (varsayılan 1). Pozitif olmalı. */
  cost?: (point: GridPoint) => number;
  /** Komşuluk tanımı; varsayılan dört yön. */
  neighbours?: readonly GridPoint[];
}

/**
 * Akış alanı — TEK hedefe giden çok sayıda birim için.
 *
 * A* ile farkı yön: `findPath` BİR başlangıçtan BİR hedefe yol arar, yani N
 * birim için N arama gerekir. `FlowField` hedeften geriye doğru TEK bir
 * Dijkstra taraması yapar ve her hücre için "buradan hangi komşuya gitmeli"
 * bilgisini üretir. Birim sayısı arttıkça maliyet değişmez: 10 birim de 5000
 * birim de aynı alanı okur.
 *
 * Bedeli: tüm ızgara taranır ve hedef değişince yeniden hesaplanır. Az sayıda
 * birim ya da sık değişen hedefler varsa A* daha ucuzdur. İkisi rakip değil,
 * farklı sorulara verilen cevaplardır.
 *
 * Ulaşılamayan hücrelerde `getCost` `Infinity`, `getNext` `null` döner —
 * "yol yok" durumu sessizce sıfır maliyetli bir hücreye dönüşmez.
 */
export class FlowField {
  private readonly costs: Float64Array;
  /** Her hücre için hedefe doğru bir sonraki hücre indeksi; -1 = yok. */
  private readonly next: Int32Array;

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) {
      throw new Error(`FlowField: cols/rows pozitif tam sayı olmalı (gelen: ${cols}x${rows})`);
    }
    this.costs = new Float64Array(cols * rows).fill(Infinity);
    this.next = new Int32Array(cols * rows).fill(-1);
  }

  /**
   * Alanı verilen hedeflerden geriye doğru hesaplar.
   *
   * Birden fazla hedef verilebilir (birden çok çıkış, birden çok toplanma
   * noktası); her hücre EN YAKIN hedefe yönlenir.
   */
  compute(goals: readonly GridPoint[], options: FlowFieldOptions = {}): void {
    const { cols, rows } = this;
    const neighbours = options.neighbours ?? ORTHOGONAL_NEIGHBOURS;
    const isWalkable = options.isWalkable ?? (() => true);
    const costOf = options.cost ?? (() => 1);

    this.costs.fill(Infinity);
    this.next.fill(-1);

    const inBounds = (col: number, row: number): boolean =>
      col >= 0 && row >= 0 && col < cols && row < rows;

    // Dijkstra dalgası: maliyete göre sıralı işlenir. Tüm kenar maliyetleri
    // eşitse bu bir BFS'e indirgenir; farklıysa sıralama şart, aksi halde
    // pahalı bir kenardan erken ulaşılan hücre yanlış maliyetle kilitlenir.
    // MinHeap O(n log n); önceki lineer min-search O(n²) idi ve büyük
    // ızgaralarda (binlerce hücre) darboğaz oluşturuyordu.
    const queue = new MinHeap();
    for (const goal of goals) {
      if (!inBounds(goal.col, goal.row) || !isWalkable(goal)) continue;
      const index = goal.row * cols + goal.col;
      this.costs[index] = 0;
      queue.push(index, 0);
    }

    while (queue.size > 0) {
      const current = queue.pop()!;
      const col = current % cols;
      const row = Math.floor(current / cols);

      for (const offset of neighbours) {
        const nc = col + offset.col;
        const nr = row + offset.row;
        if (!inBounds(nc, nr)) continue;

        const point = { col: nc, row: nr };
        if (!isWalkable(point)) continue;

        const step = costOf(point);
        if (!(step > 0) || !Number.isFinite(step)) continue;

        const diagonal = offset.col !== 0 && offset.row !== 0;
        const candidate = this.costs[current] + step * (diagonal ? Math.SQRT2 : 1);
        const nextIndex = nr * cols + nc;

        if (candidate < this.costs[nextIndex]) {
          this.costs[nextIndex] = candidate;
          // Alan hedeften geriye kuruluyor: komşunun "sonrakisi" biziz.
          this.next[nextIndex] = current;
          queue.push(nextIndex, candidate);
        }
      }
    }
  }

  /** Hücrenin hedefe toplam maliyeti; ulaşılamıyorsa `Infinity`. */
  getCost(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return Infinity;
    return this.costs[row * this.cols + col];
  }

  /** Hedefe doğru bir sonraki hücre; hedefteyse ya da ulaşılamıyorsa `null`. */
  getNext(col: number, row: number): GridPoint | null {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return null;
    const index = this.next[row * this.cols + col];
    if (index < 0) return null;
    return { col: index % this.cols, row: Math.floor(index / this.cols) };
  }

  /**
   * Verilen hücreden hedefe kadar adım adım yol — alan zaten hesaplanmış
   * olduğu için maliyeti yalnızca yolun uzunluğu kadardır.
   *
   * Alan bozuksa (döngü) sonsuz döngüye girmemek için hücre sayısıyla
   * sınırlıdır.
   */
  traceFrom(col: number, row: number): GridPoint[] {
    const path: GridPoint[] = [];
    if (this.getCost(col, row) === Infinity) return path;

    let current: GridPoint | null = { col, row };
    const limit = this.cols * this.rows;

    while (current && path.length < limit) {
      path.push(current);
      current = this.getNext(current.col, current.row);
    }
    return path;
  }
}
