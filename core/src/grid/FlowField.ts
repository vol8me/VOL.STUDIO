import { MinHeap } from '../collections/MinHeap';
import { ORTHOGONAL_NEIGHBOURS, type GridPoint } from './Grid';

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
 * **Kısmi/dirty yeniden hesap YOKTUR — bilinçli.** `compute()` her çağrıda
 * tüm ızgarayı sıfırlayıp baştan tarar. Ölçüm (200×200, engelsiz):
 * **13.7 ms/çağrı**, yani tek yeniden hesap bir karenin tamamını yer.
 * Gevşek-silme atlaması eklendikten SONRA da aynı kaldı (13.72 ms) —
 * darboğaz yeniden genişletme değil, 40.000 hücrelik tam taramanın kendisi.
 *
 * Artımlı onarım (D* Lite tarzı "raise & lower") bu sayıyı gerçekten
 * düşürür ama YALNIZCA belirli bir senaryoda: hedef sabitken engellerin
 * YEREL olarak değişmesi. Hedef değiştiğinde alanın tamamı zaten geçersizdir
 * ve artımlı onarım tam taramadan pahalıya gelir.
 *
 * O senaryonun bugün bir tüketicisi yok. Yazmak, ölçülmemiş bir kullanım
 * için karmaşık bir algoritma eklemek olurdu; gerçek bir oyun "hedef sabit,
 * engel değişiyor" desenini getirdiğinde `markDirty(points)` + `repair()`
 * olarak eklenmelidir. Bu blok o zamana kadar kararın kaydıdır.
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
      // Gevşek silme (lazy deletion): maliyeti iyileşen düğüm yığına TEKRAR
      // eklenir, eskisi içeride kalır. Anahtarı güncel maliyetten büyük olan
      // giriş eskimiştir; atlanmazsa aynı düğüm defalarca genişletilir.
      // Sonuç yine doğrudur (gevşetme canlı `costs` okur) ama iş boşa gider.
      const staleKey = queue.peekKey()!;
      const current = queue.pop()!;
      if (staleKey > this.costs[current]) continue;
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
