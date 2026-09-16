/**
 * Küme BİÇİMİ ölçümleri. Ayrı dosyada durur çünkü tanımları ön-kayıtlıdır ve
 * metrik toplayıcıdan bağımsız olarak ground-truth fixture'larla sınanır
 * (DESIGN §8, E5).
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ClusterShape {
  /** Dolu alan / dışbükey örtü alanı. Ön-kayıtlı kompaktlık tanımı budur. */
  readonly solidity: number;
  /** Örtü içindeki BOŞ hücrelerin payı; halka bunu yükseltir, disk düşürür. */
  readonly holeRatio: number;
  /** Ağırlık merkezine göre normalize dönme yarıçapı (Rg / örtü yarıçapı). */
  readonly normalizedGyration: number;
  /** İkinci moment özdeğerlerinden (λ1−λ2)/(λ1+λ2); çizgide 1'e yaklaşır. */
  readonly anisotropy: number;
  readonly centroidX: number;
  readonly centroidY: number;
}

/**
 * Hücre boyu NOKTA YOĞUNLUĞUNDAN türer, örtü çapının sabit bir oranından
 * değil. Sabit bölme denendi ve ölçüldü: 300 noktalı dolu diskte 24×24 ızgara
 * ~450 iç hücre üretiyor, nokta sayısı hücre sayısına yakın olduğu için
 * rastgele boşluklar "delik" sayılıyordu (disk solidity 0,464 / delik 0,538;
 * halka 0,310 / 0,688 — ayrım gürültünün içinde kayboluyordu). Hücre başına
 * beklenen nokta sayısı sabit tutulunca seyrek örnekleme sahte delik üretmez.
 */
const POINTS_PER_CELL = 2.5;
/** Dejenere örtü (çizgi, tek nokta) için genişlik payı; sıfır alan bölünemez. */
const DEGENERATE_SPAN_RATIO = 0.02;

export function measureClusterShape(points: readonly Point[]): ClusterShape {
  if (points.length === 0) {
    return {
      solidity: 0,
      holeRatio: 0,
      normalizedGyration: 0,
      anisotropy: 0,
      centroidX: 0,
      centroidY: 0,
    };
  }
  let cx = 0;
  let cy = 0;
  for (const point of points) {
    cx += point.x;
    cy += point.y;
  }
  cx /= points.length;
  cy /= points.length;

  const hull = convexHull(points);
  const rawHullArea = polygonArea(hull);
  /*
   * Çizgi ve tek nokta gibi dejenere bulutlarda örtü alanı SIFIRDIR ve bütün
   * oranlar tanımsız kalır. Bu durumda örtüye ölçülmüş bir genişlik payı
   * verilir: sonuç "dolu ama son derece ince" olur — solidity 1, delik 0,
   * anisotropy 1. Sessizce sıfır döndürmek, çizgiyi gazdan ayırt edilemez
   * hâle getiriyordu (ölçüldü).
   */
  const extentX = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((p) => p.x));
  const extentY = Math.max(...points.map((point) => point.y)) - Math.min(...points.map((p) => p.y));
  const longest = Math.max(extentX, extentY);
  const degenerate = rawHullArea <= longest * longest * 1e-6;
  const hullArea = degenerate
    ? Math.max(longest * longest * DEGENERATE_SPAN_RATIO, 0)
    : rawHullArea;
  const { filledArea, holeRatio } = degenerate
    ? { filledArea: hullArea, holeRatio: 0 }
    : rasterCoverage(points, hull, hullArea);
  const solidity = hullArea > 0 ? Math.min(1, filledArea / hullArea) : 0;

  let gyrationSquared = 0;
  let varX = 0;
  let varY = 0;
  let covXY = 0;
  for (const point of points) {
    const dx = point.x - cx;
    const dy = point.y - cy;
    gyrationSquared += dx * dx + dy * dy;
    varX += dx * dx;
    varY += dy * dy;
    covXY += dx * dy;
  }
  const count = points.length;
  gyrationSquared /= count;
  varX /= count;
  varY /= count;
  covXY /= count;
  const trace = varX + varY;
  const determinant = varX * varY - covXY * covXY;
  const discriminant = Math.max(0, trace * trace - 4 * determinant);
  const lambda1 = (trace + Math.sqrt(discriminant)) / 2;
  const lambda2 = (trace - Math.sqrt(discriminant)) / 2;
  const hullRadius = hullArea > 0 ? Math.sqrt(hullArea / Math.PI) : 0;

  return {
    solidity,
    holeRatio,
    normalizedGyration: hullRadius > 0 ? Math.sqrt(gyrationSquared) / hullRadius : 0,
    anisotropy: lambda1 > 0 ? (lambda1 - lambda2) / (lambda1 + lambda2) : 0,
    centroidX: cx,
    centroidY: cy,
  };
}

/**
 * Örtünün içini ızgaraya böler: üye taşıyan hücre DOLU, örtü içinde kalan ama
 * üyesiz hücre DELİKTİR. Halkanın ortası böyle görünür; disk ise neredeyse
 * boşluksuzdur.
 */
function rasterCoverage(
  points: readonly Point[],
  hull: readonly Point[],
  hullArea: number,
): { filledArea: number; holeRatio: number } {
  if (hullArea <= 0 || hull.length < 3) return { filledArea: 0, holeRatio: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  if (span <= 0) return { filledArea: 0, holeRatio: 0 };
  // Hücre alanı ≈ (örtü alanı × hücre başına nokta) / nokta sayısı.
  const targetCellArea = (hullArea * POINTS_PER_CELL) / points.length;
  const cell = Math.max(span / 256, Math.sqrt(Math.max(targetCellArea, Number.MIN_VALUE)));
  const cellArea = cell * cell;
  const columns = Math.max(1, Math.ceil((maxX - minX) / cell) + 1);
  const rows = Math.max(1, Math.ceil((maxY - minY) / cell) + 1);
  const occupied = new Uint8Array(columns * rows);
  for (const point of points) {
    const column = Math.min(columns - 1, Math.floor((point.x - minX) / cell));
    const row = Math.min(rows - 1, Math.floor((point.y - minY) / cell));
    occupied[row * columns + column] = 1;
  }
  let filled = 0;
  let inside = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const centre = { x: minX + (column + 0.5) * cell, y: minY + (row + 0.5) * cell };
      if (!pointInPolygon(centre, hull)) continue;
      inside++;
      if (occupied[row * columns + column] === 1) filled++;
    }
  }
  return {
    filledArea: filled * cellArea,
    holeRatio: inside > 0 ? (inside - filled) / inside : 0,
  };
}

/** Andrew monotone chain; eşit noktalarda deterministiktir. */
export function convexHull(points: readonly Point[]): Point[] {
  if (points.length < 3) return [...points];
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Point[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function polygonArea(polygon: readonly Point[]): number {
  if (polygon.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Churn: önceki kadroya göre değişen üye payı (giren + çıkan / birleşim). */
export function memberChurn(previous: readonly number[], current: readonly number[]): number {
  if (previous.length === 0 && current.length === 0) return 0;
  const before = new Set(previous);
  const after = new Set(current);
  let shared = 0;
  for (const id of after) {
    if (before.has(id)) shared++;
  }
  const union = before.size + after.size - shared;
  return union > 0 ? (union - shared) / union : 0;
}
