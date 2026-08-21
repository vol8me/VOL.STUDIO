import { MinHeap } from '../collections/MinHeap';
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

/**
 * A* çalışma alanı — tampon sahibi.
 *
 * `findPath` her çağrıda üç typed array tahsis eder (`cols * rows` boyutunda);
 * tek seferlik aramada bu görünmez, ama çok sayıda birim her kare yol
 * arattığında kare başına megabaytlarca çöp üretir ve GC takılmaları başlar.
 *
 * `PathFinder` tamponları BİR KEZ ayırır ve her aramada damga (generation)
 * tekniğiyle "temizler": diziyi sıfırlamak yerine her aramaya artan bir damga
 * verilir ve eski damgalı hücreler ziyaret edilmemiş sayılır. Böylece temizlik
 * de O(1) olur.
 *
 * Aynı ızgara boyutuyla tekrar tekrar arama yapılacaksa bu sınıf kullanılır;
 * tek seferlik aramalarda `findPath` yeterlidir.
 */
export class PathFinder {
  private readonly gScore: Float64Array;
  private readonly cameFrom: Int32Array;
  private readonly stamp: Int32Array;
  private readonly open: MinHeap;
  private generation = 0;

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) {
      throw new Error(`PathFinder: cols/rows pozitif tam sayı olmalı (gelen: ${cols}x${rows})`);
    }
    const size = cols * rows;
    this.gScore = new Float64Array(size);
    this.cameFrom = new Int32Array(size);
    // 0 damgası "hiç ziyaret edilmedi" anlamına gelir; ilk arama 1'den başlar.
    this.stamp = new Int32Array(size);
    this.open = new MinHeap();
  }

  /** Bkz. `findPath` — aynı sözleşme, tamponlar yeniden kullanılır. */
  find(start: GridPoint, goal: GridPoint, options: FindPathOptions = {}): GridPoint[] | null {
    this.generation++;
    this.open.clear();
    return search({ cols: this.cols, rows: this.rows }, start, goal, options, {
      gScore: this.gScore,
      cameFrom: this.cameFrom,
      stamp: this.stamp,
      generation: this.generation,
      open: this.open,
    });
  }
}

interface Workspace {
  gScore: Float64Array;
  cameFrom: Int32Array;
  stamp: Int32Array;
  generation: number;
  open: MinHeap;
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
 * Tekrar tekrar arama yapılacaksa `PathFinder` kullanılmalıdır: bu fonksiyon
 * her çağrıda tamponlarını yeniden ayırır.
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
  const size = gridSize.cols * gridSize.rows;
  if (size <= 0) return null;

  return search(gridSize, start, goal, options, {
    gScore: new Float64Array(size),
    cameFrom: new Int32Array(size),
    stamp: new Int32Array(size),
    generation: 1,
    open: new MinHeap(),
  });
}

function search(
  gridSize: { cols: number; rows: number },
  start: GridPoint,
  goal: GridPoint,
  options: FindPathOptions,
  workspace: Workspace,
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

  const { gScore, cameFrom, stamp, generation, open } = workspace;

  // Damga tekniği: diziyi sıfırlamak yerine bu aramanın damgasını taşımayan
  // hücreler "ziyaret edilmemiş" sayılır. Böylece hazırlık O(1) olur.
  // Kapalı (closed) durumu damganın NEGATİFİYLE işaretlenir.
  const isSeen = (i: number): boolean => Math.abs(stamp[i]) === generation;
  const isClosed = (i: number): boolean => stamp[i] === -generation;

  gScore[startIndex] = 0;
  cameFrom[startIndex] = -1;
  stamp[startIndex] = generation;
  open.push(startIndex, heuristic(start.col, start.row));

  let expanded = 0;

  while (open.size > 0) {
    const currentIndex = open.pop()!;
    if (isClosed(currentIndex)) continue;
    stamp[currentIndex] = -generation;

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
      if (isClosed(nextIndex) || !isWalkable(next)) continue;

      const step = costOf(next);
      if (!(step > 0) || !Number.isFinite(step)) continue;

      // Çapraz adım daha uzundur; 1 saymak yolu çaprazlara doğru çarpıtırdı.
      const diagonal = offset.col !== 0 && offset.row !== 0;
      const tentative = gScore[currentIndex] + step * (diagonal ? Math.SQRT2 : 1);

      if (!isSeen(nextIndex) || tentative < gScore[nextIndex]) {
        gScore[nextIndex] = tentative;
        cameFrom[nextIndex] = currentIndex;
        stamp[nextIndex] = generation;
        open.push(nextIndex, tentative + heuristic(next.col, next.row));
      }
    }
  }

  return null;
}
