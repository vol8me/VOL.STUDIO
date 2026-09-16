import type { WorldDomain } from '@/runtime/sim/WorldDomain';

export interface HabitatTruthSample {
  /** İşaretli mesafe: habitat içi +, Void −. */
  readonly distance: number;
  readonly nearestX: number;
  readonly nearestY: number;
  /** Void'a bakan birim normal. */
  readonly normalX: number;
  readonly normalY: number;
  /** En yakın nokta tek mi? Medial eksen yakınında açı iddiası tanımsızdır. */
  readonly unique: boolean;
}

const UNIQUENESS_ARC_UNITS = 64;
const UNIQUENESS_MARGIN_UNITS = 1;
const NORMAL_FROM_OFFSET_UNITS = 1e-3;
const ORIENTATION_PROBE_UNITS = 0.5;

/**
 * Mesafe sözleşmesinin BAĞIMSIZ referansı (C6 ön-kaydı): yoğun kapalı kontur
 * üzerinde nokta-segment mesafesinin minimumu, işaret ışın-kesişimiyle. Sınanan
 * uygulamanın iç matematiğini kullanmaz; yalnız `contour()` okur. İç döngüler
 * tahsissizdir — 1000 seedlik korpusta her sorgu konturun tamamını tarar.
 */
export class HabitatTruth {
  private readonly points: Float64Array;
  private readonly arc: Float64Array;
  private readonly perimeter: number;
  readonly segmentCount: number;

  constructor(domain: WorldDomain, segments = 20_000) {
    if (!Number.isInteger(segments) || segments < 1000) {
      throw new RangeError(`Referans kontur en az 1000 segment ister: ${segments}`);
    }
    this.segmentCount = segments;
    this.points = Float64Array.from(domain.contour(segments));
    this.arc = new Float64Array(segments + 1);
    for (let index = 0; index < segments; index++) {
      const next = (index + 1) % segments;
      this.arc[index + 1] =
        this.arc[index] +
        Math.hypot(
          this.points[next * 2] - this.points[index * 2],
          this.points[next * 2 + 1] - this.points[index * 2 + 1],
        );
    }
    this.perimeter = this.arc[segments];
  }

  sample(x: number, y: number): HabitatTruthSample {
    const points = this.points;
    const count = this.segmentCount;
    let bestSquared = Number.POSITIVE_INFINITY;
    let bestIndex = 0;
    let bestX = 0;
    let bestY = 0;
    let bestT = 0;
    for (let index = 0; index < count; index++) {
      const next = index + 1 === count ? 0 : index + 1;
      const ax = points[index * 2];
      const ay = points[index * 2 + 1];
      const dx = points[next * 2] - ax;
      const dy = points[next * 2 + 1] - ay;
      const lengthSquared = dx * dx + dy * dy;
      let t = lengthSquared > 0 ? ((x - ax) * dx + (y - ay) * dy) / lengthSquared : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const footX = ax + dx * t;
      const footY = ay + dy * t;
      const gapX = x - footX;
      const gapY = y - footY;
      const squared = gapX * gapX + gapY * gapY;
      if (squared < bestSquared) {
        bestSquared = squared;
        bestIndex = index;
        bestX = footX;
        bestY = footY;
        bestT = t;
      }
    }
    const bestDistance = Math.sqrt(bestSquared);
    const inside = this.contains(x, y);
    const normal = this.outwardNormal(bestIndex, bestX, bestY, x, y, bestDistance, inside);
    return {
      distance: inside ? bestDistance : -bestDistance,
      nearestX: bestX,
      nearestY: bestY,
      normalX: normal.x,
      normalY: normal.y,
      unique: this.isNearestUnique(x, y, bestIndex, bestT, bestDistance),
    };
  }

  /** Işın-kesişimi; konturun kendi örtük fonksiyonuna bakmaz. */
  contains(x: number, y: number): boolean {
    const points = this.points;
    const count = this.segmentCount;
    let inside = false;
    for (let index = 0; index < count; index++) {
      const next = index + 1 === count ? 0 : index + 1;
      const ax = points[index * 2];
      const ay = points[index * 2 + 1];
      const bx = points[next * 2];
      const by = points[next * 2 + 1];
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    }
    return inside;
  }

  private outwardNormal(
    index: number,
    footX: number,
    footY: number,
    x: number,
    y: number,
    distance: number,
    inside: boolean,
  ): { x: number; y: number } {
    if (distance > NORMAL_FROM_OFFSET_UNITS) {
      const dirX = inside ? footX - x : x - footX;
      const dirY = inside ? footY - y : y - footY;
      const length = Math.hypot(dirX, dirY);
      return { x: dirX / length, y: dirY / length };
    }
    const next = index + 1 === this.segmentCount ? 0 : index + 1;
    const tangentX = this.points[next * 2] - this.points[index * 2];
    const tangentY = this.points[next * 2 + 1] - this.points[index * 2 + 1];
    const length = Math.hypot(tangentX, tangentY);
    const candidateX = tangentY / length;
    const candidateY = -tangentX / length;
    const outward = !this.contains(
      footX + candidateX * ORIENTATION_PROBE_UNITS,
      footY + candidateY * ORIENTATION_PROBE_UNITS,
    );
    return outward ? { x: candidateX, y: candidateY } : { x: -candidateX, y: -candidateY };
  }

  /** İkinci en iyi aday konturda yeterince uzakta VE ölçülebilir biçimde daha uzaktaysa tek. */
  private isNearestUnique(
    x: number,
    y: number,
    bestIndex: number,
    bestT: number,
    bestDistance: number,
  ): boolean {
    const points = this.points;
    const count = this.segmentCount;
    const bestArc = this.arc[bestIndex] + bestT * (this.arc[bestIndex + 1] - this.arc[bestIndex]);
    const limitSquared = (bestDistance + UNIQUENESS_MARGIN_UNITS) ** 2;
    for (let index = 0; index < count; index++) {
      const gap = Math.abs(this.arc[index] - bestArc);
      if (Math.min(gap, this.perimeter - gap) < UNIQUENESS_ARC_UNITS) continue;
      const next = index + 1 === count ? 0 : index + 1;
      const ax = points[index * 2];
      const ay = points[index * 2 + 1];
      const dx = points[next * 2] - ax;
      const dy = points[next * 2 + 1] - ay;
      const lengthSquared = dx * dx + dy * dy;
      let t = lengthSquared > 0 ? ((x - ax) * dx + (y - ay) * dy) / lengthSquared : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const gapX = x - (ax + dx * t);
      const gapY = y - (ay + dy * t);
      if (gapX * gapX + gapY * gapY < limitSquared) return false;
    }
    return true;
  }
}
