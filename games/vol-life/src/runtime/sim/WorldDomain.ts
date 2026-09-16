import type { Rect } from '@volstudio/core/math/geometry';
import { digestString } from '@/config/genome';
import { validateHabitatConfig, type HabitatConfig } from '@/config/habitat';
import { deriveStreamSeed } from '@/runtime/sim/RandomStreams';
import { createSimRandom, type SimRandom } from '@/runtime/sim/rng';

export interface DomainVector {
  x: number;
  y: number;
}

/**
 * Habitatın tek geometri sahibi. İşaret sözleşmesi: pozitif habitat içi, sıfır
 * kıyı, negatif Void. Renderer, fizik, kamera ve alan maskesi ayrı geometri
 * hesaplamaz (DESIGN.md §2).
 */
export interface WorldDomain {
  readonly storage: Readonly<Rect>;
  readonly bbox: Readonly<Rect>;
  readonly digest: string;
  distance(x: number, y: number): number;
  /** Void'a bakan birim normal; `out` verilirse ona yazar. */
  normal(x: number, y: number, out?: DomainVector): DomainVector;
  contour(segments: number): Float32Array;
}

interface Harmonic {
  readonly order: number;
  readonly amplitude: number;
  readonly phase: number;
}

const BBOX_SAMPLES = 720;
const GRADIENT_STEP = 0.5;

export class HabitatSDF implements WorldDomain {
  readonly storage: Readonly<Rect>;
  readonly bbox: Readonly<Rect>;
  readonly digest: string;
  private readonly centerX: number;
  private readonly centerY: number;
  private readonly radiusX: number;
  private readonly radiusY: number;
  private readonly exponent: number;
  private readonly harmonics: readonly Harmonic[];
  private minRadius = Number.POSITIVE_INFINITY;

  /** Kontur YALNIZ `habitat` akışından türer; ışık ya da seeding akışı onu kaydıramaz. */
  constructor(storage: Readonly<Rect>, config: HabitatConfig, random: SimRandom) {
    validateHabitatConfig(config);
    this.storage = { ...storage };
    this.centerX = storage.x + storage.width / 2;
    this.centerY = storage.y + storage.height / 2;
    this.radiusX = (storage.width / 2) * config.radiusRatioX;
    this.radiusY = (storage.height / 2) * config.radiusRatioY;
    this.exponent = config.superellipseExponent;
    this.harmonics = buildHarmonics(config, random);
    this.bbox = this.measureBbox();
    const margin = config.storageMarginUnits;
    if (
      this.bbox.x < storage.x + margin ||
      this.bbox.y < storage.y + margin ||
      this.bbox.x + this.bbox.width > storage.x + storage.width - margin ||
      this.bbox.y + this.bbox.height > storage.y + storage.height - margin
    ) {
      throw new RangeError('Habitat konturu depolama kenar boşluğunu ihlal ediyor.');
    }
    this.digest = digestString(
      JSON.stringify({
        storage: this.storage,
        radiusX: this.radiusX,
        radiusY: this.radiusY,
        exponent: this.exponent,
        harmonics: this.harmonics,
      }),
    );
  }

  distance(x: number, y: number): number {
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    const rho = Math.hypot(dx, dy);
    if (rho === 0) return this.minRadius;
    const [radius, slope] = this.radiusAndSlope(Math.atan2(dy, dx));
    return ((radius - rho) * radius) / Math.hypot(radius, slope);
  }

  normal(x: number, y: number, out: DomainVector = { x: 0, y: 0 }): DomainVector {
    const gradientX = this.distance(x + GRADIENT_STEP, y) - this.distance(x - GRADIENT_STEP, y);
    const gradientY = this.distance(x, y + GRADIENT_STEP) - this.distance(x, y - GRADIENT_STEP);
    const length = Math.hypot(gradientX, gradientY);
    if (length < 1e-9) {
      const dx = x - this.centerX;
      const dy = y - this.centerY;
      const radial = Math.hypot(dx, dy);
      out.x = radial === 0 ? 1 : dx / radial;
      out.y = radial === 0 ? 0 : dy / radial;
      return out;
    }
    out.x = -gradientX / length;
    out.y = -gradientY / length;
    return out;
  }

  contour(segments: number): Float32Array {
    if (!Number.isInteger(segments) || segments < 3) {
      throw new RangeError(`Kontur en az üç segment ister: ${segments}`);
    }
    const points = new Float32Array(segments * 2);
    for (let index = 0; index < segments; index++) {
      const theta = (index / segments) * Math.PI * 2;
      const [radius] = this.radiusAndSlope(theta);
      points[index * 2] = this.centerX + Math.cos(theta) * radius;
      points[index * 2 + 1] = this.centerY + Math.sin(theta) * radius;
    }
    return points;
  }

  private radiusAndSlope(theta: number): [number, number] {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const n = this.exponent;
    const cosTerm = Math.abs(cos) / this.radiusX;
    const sinTerm = Math.abs(sin) / this.radiusY;
    const u = cosTerm ** n + sinTerm ** n;
    const base = u ** (-1 / n);
    const du =
      (n * cosTerm ** (n - 1) * (-Math.sign(cos) * sin)) / this.radiusX +
      (n * sinTerm ** (n - 1) * (Math.sign(sin) * cos)) / this.radiusY;
    const baseSlope = (-1 / n) * u ** (-1 / n - 1) * du;
    let noise = 1;
    let noiseSlope = 0;
    for (const harmonic of this.harmonics) {
      const angle = harmonic.order * theta + harmonic.phase;
      noise += harmonic.amplitude * Math.sin(angle);
      noiseSlope += harmonic.amplitude * harmonic.order * Math.cos(angle);
    }
    return [base * noise, baseSlope * noise + base * noiseSlope];
  }

  private measureBbox(): Rect {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < BBOX_SAMPLES; index++) {
      const theta = (index / BBOX_SAMPLES) * Math.PI * 2;
      const [radius] = this.radiusAndSlope(theta);
      this.minRadius = Math.min(this.minRadius, radius);
      const x = this.centerX + Math.cos(theta) * radius;
      const y = this.centerY + Math.sin(theta) * radius;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
}

/** Dünya tohumundan habitat akışını türeten tek giriş; doğrudan tohum kullanılmaz. */
export function createHabitatDomain(
  storage: Readonly<Rect>,
  config: HabitatConfig,
  worldSeed: number,
): HabitatSDF {
  return new HabitatSDF(storage, config, createSimRandom(deriveStreamSeed(worldSeed, 'habitat')));
}

function buildHarmonics(config: HabitatConfig, random: SimRandom): Harmonic[] {
  if (config.noiseAmplitudeRatio === 0) return [];
  const orders: number[] = [];
  for (let order = config.noiseHarmonicMin; order <= config.noiseHarmonicMax; order++) {
    orders.push(order);
  }
  const weights = orders.map(() => 0.3 + random.next() * 0.7);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  return orders.map((order, index) => ({
    order,
    amplitude: (config.noiseAmplitudeRatio * weights[index]) / totalWeight,
    phase: random.next() * Math.PI * 2,
  }));
}

/** Alan ızgarası için habitat maskesi: 1 habitat içi hücre, 0 Void hücresi. */
export function rasterizeHabitatMask(domain: WorldDomain, resolution: number): Uint8Array {
  const mask = new Uint8Array(resolution * resolution);
  forEachCell(domain, resolution, (index, distance) => {
    mask[index] = distance >= 0 ? 1 : 0;
  });
  return mask;
}

/** Kıyıya yaklaşırken 1→0 inen sunum gölgesi; fiziğe girmez. */
export function rasterizeHabitatShade(
  domain: WorldDomain,
  resolution: number,
  fadeUnits: number,
): Float32Array {
  if (!(fadeUnits > 0) || !Number.isFinite(fadeUnits)) {
    throw new RangeError(`Karartma mesafesi pozitif ve sonlu olmalı: ${fadeUnits}`);
  }
  const shade = new Float32Array(resolution * resolution);
  forEachCell(domain, resolution, (index, distance) => {
    shade[index] = Math.max(0, Math.min(1, distance / fadeUnits));
  });
  return shade;
}

function forEachCell(
  domain: WorldDomain,
  resolution: number,
  visit: (index: number, distance: number) => void,
): void {
  if (!Number.isInteger(resolution) || resolution < 2) {
    throw new RangeError(`Izgara çözünürlüğü en az 2 olmalı: ${resolution}`);
  }
  const { storage } = domain;
  const cellWidth = storage.width / resolution;
  const cellHeight = storage.height / resolution;
  for (let y = 0; y < resolution; y++) {
    const worldY = storage.y + (y + 0.5) * cellHeight;
    for (let x = 0; x < resolution; x++) {
      const worldX = storage.x + (x + 0.5) * cellWidth;
      visit(y * resolution + x, domain.distance(worldX, worldY));
    }
  }
}
