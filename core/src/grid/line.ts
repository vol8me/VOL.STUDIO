import type { GridPoint } from './Grid';

/**
 * Bresenham doğrusu — iki hücre arasındaki hücre dizisi.
 *
 * Yalnızca tam sayı aritmetiği kullanır: kayan noktalı adımlarla yürümek,
 * uzun mesafelerde birikimli yuvarlama hatası yüzünden doğrunun kaymasına ve
 * iki uçtan çizilen aynı doğrunun farklı hücrelerden geçmesine yol açar.
 *
 * Başlangıç ve bitiş DAHİLDİR.
 */
export function bresenhamLine(from: GridPoint, to: GridPoint): GridPoint[] {
  const points: GridPoint[] = [];

  let col = Math.trunc(from.col);
  let row = Math.trunc(from.row);
  const targetCol = Math.trunc(to.col);
  const targetRow = Math.trunc(to.row);

  const dCol = Math.abs(targetCol - col);
  const dRow = Math.abs(targetRow - row);
  const stepCol = col < targetCol ? 1 : -1;
  const stepRow = row < targetRow ? 1 : -1;
  let error = dCol - dRow;

  for (;;) {
    points.push({ col, row });
    if (col === targetCol && row === targetRow) break;

    const doubled = error * 2;
    if (doubled > -dRow) {
      error -= dRow;
      col += stepCol;
    }
    if (doubled < dCol) {
      error += dCol;
      row += stepRow;
    }
  }

  return points;
}

export interface LineOfSightOptions {
  /** Görüşü ENGELLEYEN hücre mi? */
  blocks: (point: GridPoint) => boolean;
  /**
   * Başlangıç ve bitiş hücreleri engel sayılsın mı? Varsayılan `false`:
   * bir duvarın üstünde duran ya da bir duvarı HEDEFLEYEN birim kendi
   * hücresi yüzünden kör kalmamalı.
   */
  includeEndpoints?: boolean;
}

/**
 * İki hücre arasında görüş var mı?
 *
 * Aradaki hücreleri Bresenham ile tarar. Bu, "duvar köşesinden diagonal
 * sızma" gibi ince durumlarda kaba bir yaklaşımdır — piksel hassasiyetinde
 * görüş isteyen bir tüketici `raycastCircles` ile sürekli uzayda çalışmalıdır.
 * Izgara oyunlarında beklenen davranış budur ve ucuzdur.
 */
export function hasLineOfSight(
  from: GridPoint,
  to: GridPoint,
  options: LineOfSightOptions,
): boolean {
  const line = bresenhamLine(from, to);
  const start = options.includeEndpoints ? 0 : 1;
  const end = options.includeEndpoints ? line.length : line.length - 1;

  for (let i = start; i < end; i++) {
    if (options.blocks(line[i])) return false;
  }
  return true;
}
