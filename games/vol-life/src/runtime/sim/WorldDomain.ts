import type { Rect } from '@volstudio/core/math/geometry';
import { digestString } from '@/config/genome';
import { validateHabitatConfig, type HabitatConfig } from '@/config/habitat';
import { deriveStreamSeed } from '@/runtime/sim/RandomStreams';
import { createSimRandom, type SimRandom } from '@/runtime/sim/rng';

export interface DomainSample {
  /** Dünya birimi işaretli mesafe: pozitif habitat içi, sıfır kıyı, negatif Void. */
  distance: number;
  normalX: number;
  normalY: number;
}

/**
 * Habitatın tek geometri sahibi. İşaret sözleşmesi: pozitif habitat içi, sıfır
 * kıyı, negatif Void. Mesafe ve normal TEK örneklemede birlikte alınır; ayrı
 * `distance` + `normal` çifti yoktur (DESIGN.md §2).
 */
export interface WorldDomain {
  readonly storage: Readonly<Rect>;
  readonly bbox: Readonly<Rect>;
  readonly digest: string;
  /** `out` verilirse ona yazar ve onu döner; ödünç tampon çağrı başına geçerlidir. */
  sampleDistanceAndNormal(x: number, y: number, out?: DomainSample): DomainSample;
  /**
   * Yalnız İŞARET; `sampleDistanceAndNormal(x, y).distance >= 0` ile her noktada
   * aynı cevabı verir (testle sabit). Mesafe sözleşmesinin ikinci bir kaynağı
   * değildir — aynı karşılaştırmanın ucuz girişidir.
   */
  contains(x: number, y: number): boolean;
  contour(segments: number): Float32Array;
}

interface Harmonic {
  readonly order: number;
  readonly amplitude: number;
  readonly phase: number;
}

const BBOX_SAMPLES = 720;
const NEWTON_MAX_STEPS = 8;
const NEWTON_STEP_CLAMP = 0.25;
/**
 * 1e-9 rad'lık adım, ayak noktasını yarıçap × 1e-9 ≈ 4e-7 birim oynatır —
 * ölçülen 4,9e-5 birimlik hatanın iki, ön-kayıtlı 0,5 birimlik sınırın altı
 * mertebe altında. Daha sıkı tolerans doğruluk getirmiyor, yalnız iterasyon
 * ekliyordu (ölçüldü: dünya kurulumunda 1,5 sn rasterleme).
 */
const NEWTON_TOLERANCE = 1e-9;
const DEGENERATE_DISTANCE = 1e-9;
/**
 * Sorgu açısından (θ₀) başlayan Newton, ancak nokta kıyıya yeterince yakınken
 * en yakın kontur noktasını bulur; merkeze yaklaştıkça başka bir durağan
 * noktaya kaçar. Eşik ÖLÇÜMLE seçildi (6 seed, 32.440 sorgu): radyal boşluk
 * ≤ 192 birimde en büyük hata 1e-4 birim, 192–256'da 5,7 birim, 256'nın
 * üstünde 63,3 birim.
 */
const RELIABLE_RADIAL_GAP_UNITS = 192;
/**
 * Uzak noktalarda arama, KURULUMDA bir kez hesaplanan kaba kontur tablosundan
 * başlar. Tabloyu her çağrıda yeniden üretmek ölçüldü ve üretim dağılımında
 * parçacıkların %32'si bu dala düştüğü için çağrı başına 21,8 µs'ye çıkıyordu;
 * tablo aramasında trigonometri ve eğri değerlendirmesi yoktur.
 */
const COARSE_TABLE_SIZE = 256;
/** Kontur üstündeki gerçek bir nokta her zaman geçerli bir üst sınırdır. */
const PROJECTION_SLACK = 1e-6;

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
  /** [R, R', R''] ödünç tamponu; tek iş parçacığı varsayımıyla örnek başına yeniden kullanılır. */
  private readonly curve = new Float64Array(3);
  /** Harmonikler sıcak döngüde nesne yerine düz üçlü (order, amplitude, phase) olarak okunur. */
  private readonly harmonicTable: Float64Array;
  /** Kurulumda bir kez hesaplanan kaba kontur noktaları; uzak sorguların başlangıcı. */
  private readonly coarseContour = new Float64Array(COARSE_TABLE_SIZE * 2);
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
    this.harmonicTable = Float64Array.from(
      this.harmonics.flatMap((harmonic) => [harmonic.order, harmonic.amplitude, harmonic.phase]),
    );
    this.bbox = this.measureBbox();
    for (let index = 0; index < COARSE_TABLE_SIZE; index++) {
      const theta = (index / COARSE_TABLE_SIZE) * Math.PI * 2;
      this.evaluate(theta);
      this.coarseContour[index * 2] = this.centerX + Math.cos(theta) * this.curve[0];
      this.coarseContour[index * 2 + 1] = this.centerY + Math.sin(theta) * this.curve[0];
    }
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

  /**
   * Gerçek en yakın kontur noktasına Newton izdüşümü. Polar yaklaşım mesafeyi
   * bantta 0,9 birime kadar şaşırıyordu (ölçüldü); burada mesafe, izdüşüm
   * noktasına olan gerçek uzaklıktır. İşaret yıldız biçimli konturda ışın
   * karşılaştırmasından gelir ve yaklaşıklık taşımaz.
   */
  sampleDistanceAndNormal(
    x: number,
    y: number,
    out: DomainSample = { distance: 0, normalX: 1, normalY: 0 },
  ): DomainSample {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new RangeError(`Örnekleme noktası sonlu olmalı: (${x}, ${y})`);
    }
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    const rho = Math.hypot(dx, dy);
    if (rho === 0) {
      out.distance = this.minRadius;
      out.normalX = 1;
      out.normalY = 0;
      return out;
    }
    const queryTheta = Math.atan2(dy, dx);
    const radialRadius = this.radiusAt(queryTheta);
    const inside = insideAt(rho, radialRadius);
    const radialGap = Math.abs(radialRadius - rho);
    const radialBound = Math.hypot(
      this.centerX + Math.cos(queryTheta) * radialRadius - x,
      this.centerY + Math.sin(queryTheta) * radialRadius - y,
    );

    let theta =
      radialGap <= RELIABLE_RADIAL_GAP_UNITS
        ? this.project(queryTheta, x, y)
        : this.projectFromSamples(x, y);
    let distance = this.footDistance(theta, x, y);
    if (distance > radialBound + PROJECTION_SLACK) {
      theta = this.projectFromSamples(x, y);
      distance = this.footDistance(theta, x, y);
      if (distance > radialBound) {
        theta = queryTheta;
        distance = radialBound;
      }
    }

    out.distance = inside ? distance : -distance;
    this.writeNormal(theta, x, y, distance, inside, out);
    return out;
  }

  /**
   * İşaret Newton izdüşümü İSTEMEZ: yıldız biçimli kontur her açıda tek yarıçap
   * verdiği için içerideliği ışın karşılaştırması belirler — `sampleDistance‐
   * AndNormal` da işareti aynı `insideAt` çağrısından alır. Ölçüldü: 1024²
   * maskede 2916,7 ms yerine 273,4 ms (10,7×).
   */
  contains(x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new RangeError(`Örnekleme noktası sonlu olmalı: (${x}, ${y})`);
    }
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    const rho = Math.hypot(dx, dy);
    if (rho === 0) return true;
    return insideAt(rho, this.radiusAt(Math.atan2(dy, dx)));
  }

  contour(segments: number): Float32Array {
    if (!Number.isInteger(segments) || segments < 3) {
      throw new RangeError(`Kontur en az üç segment ister: ${segments}`);
    }
    const points = new Float32Array(segments * 2);
    for (let index = 0; index < segments; index++) {
      const theta = (index / segments) * Math.PI * 2;
      const radius = this.radiusAt(theta);
      points[index * 2] = this.centerX + Math.cos(theta) * radius;
      points[index * 2 + 1] = this.centerY + Math.sin(theta) * radius;
    }
    return points;
  }

  /** Kontur üzerindeki `theta` noktasının Q'ya uzaklığı; yalnız R gerekir. */
  private footDistance(theta: number, x: number, y: number): number {
    const radius = this.radiusAt(theta);
    return Math.hypot(
      this.centerX + Math.cos(theta) * radius - x,
      this.centerY + Math.sin(theta) * radius - y,
    );
  }

  /**
   * Yalnız R(θ). Sıcak yolun çoğu (işaret, ayak mesafesi, kontur, kaba tablo)
   * türev istemez; ikinci türev birkaç `Math.pow` demektir ve gereksizdir.
   */
  private radiusAt(theta: number): number {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const n = this.exponent;
    const cosTerm = Math.abs(cos) / this.radiusX;
    const sinTerm = Math.abs(sin) / this.radiusY;
    const base = (cosTerm ** n + sinTerm ** n) ** (-1 / n);
    let noise = 1;
    const harmonics = this.harmonicTable;
    for (let index = 0; index < harmonics.length; index += 3) {
      noise += harmonics[index + 1] * Math.sin(harmonics[index] * theta + harmonics[index + 2]);
    }
    return base * noise;
  }

  /** Güven bölgeli Newton; ikinci türev kaybolursa eğim adımına düşer. */
  private project(startTheta: number, x: number, y: number): number {
    let theta = startTheta;
    for (let step = 0; step < NEWTON_MAX_STEPS; step++) {
      this.evaluate(theta);
      const radius = this.curve[0];
      const slope = this.curve[1];
      const curvature = this.curve[2];
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const gapX = this.centerX + cos * radius - x;
      const gapY = this.centerY + sin * radius - y;
      const tangentX = slope * cos - radius * sin;
      const tangentY = slope * sin + radius * cos;
      const secondX = (curvature - radius) * cos - 2 * slope * sin;
      const secondY = (curvature - radius) * sin + 2 * slope * cos;
      const first = gapX * tangentX + gapY * tangentY;
      const second = tangentX * tangentX + tangentY * tangentY + gapX * secondX + gapY * secondY;
      let delta = second > 0 ? -first / second : -Math.sign(first) * NEWTON_STEP_CLAMP;
      if (delta > NEWTON_STEP_CLAMP) delta = NEWTON_STEP_CLAMP;
      if (delta < -NEWTON_STEP_CLAMP) delta = -NEWTON_STEP_CLAMP;
      theta += delta;
      if (Math.abs(delta) < NEWTON_TOLERANCE) break;
    }
    return theta;
  }

  /** Önceden hesaplanmış kaba tablodan en yakın açıyı seçip Newton ile keskinleştirir. */
  private projectFromSamples(x: number, y: number): number {
    const table = this.coarseContour;
    let bestIndex = 0;
    let bestSquared = Number.POSITIVE_INFINITY;
    for (let index = 0; index < COARSE_TABLE_SIZE; index++) {
      const gapX = table[index * 2] - x;
      const gapY = table[index * 2 + 1] - y;
      const squared = gapX * gapX + gapY * gapY;
      if (squared < bestSquared) {
        bestSquared = squared;
        bestIndex = index;
      }
    }
    return this.project((bestIndex / COARSE_TABLE_SIZE) * Math.PI * 2, x, y);
  }

  private writeNormal(
    theta: number,
    x: number,
    y: number,
    distance: number,
    inside: boolean,
    out: DomainSample,
  ): void {
    const radius =
      distance > DEGENERATE_DISTANCE ? this.radiusAt(theta) : this.evaluateRadius(theta);
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const footX = this.centerX + cos * radius;
    const footY = this.centerY + sin * radius;
    if (distance > DEGENERATE_DISTANCE) {
      const dirX = inside ? footX - x : x - footX;
      const dirY = inside ? footY - y : y - footY;
      const length = Math.hypot(dirX, dirY);
      out.normalX = dirX / length;
      out.normalY = dirY / length;
      return;
    }
    // Kıyının üstünde yön farkı tanımsızdır; teğetin dik bileşeni kullanılır (R' gerekir).
    const slope = this.curve[1];
    const tangentX = slope * cos - radius * sin;
    const tangentY = slope * sin + radius * cos;
    const length = Math.hypot(tangentX, tangentY);
    const candidateX = tangentY / length;
    const candidateY = -tangentX / length;
    const outward = candidateX * cos + candidateY * sin >= 0;
    out.normalX = outward ? candidateX : -candidateX;
    out.normalY = outward ? candidateY : -candidateY;
  }

  /** Türevli yol: `curve`u doldurur ve R'yi döner (kıyı üstü normal için). */
  private evaluateRadius(theta: number): number {
    this.evaluate(theta);
    return this.curve[0];
  }

  /** `curve` = [R(θ), R'(θ), R''(θ)]. */
  private evaluate(theta: number): void {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const n = this.exponent;
    const cosTerm = Math.abs(cos) / this.radiusX;
    const sinTerm = Math.abs(sin) / this.radiusY;
    const u = cosTerm ** n + sinTerm ** n;
    const base = u ** (-1 / n);
    const cosTermSlope = (-Math.sign(cos) * sin) / this.radiusX;
    const sinTermSlope = (Math.sign(sin) * cos) / this.radiusY;
    const cosTermCurvature = (-Math.sign(cos) * cos) / this.radiusX;
    const sinTermCurvature = (-Math.sign(sin) * sin) / this.radiusY;
    const du = n * cosTerm ** (n - 1) * cosTermSlope + n * sinTerm ** (n - 1) * sinTermSlope;
    const ddu =
      n * (n - 1) * cosTerm ** (n - 2) * cosTermSlope * cosTermSlope +
      n * cosTerm ** (n - 1) * cosTermCurvature +
      n * (n - 1) * sinTerm ** (n - 2) * sinTermSlope * sinTermSlope +
      n * sinTerm ** (n - 1) * sinTermCurvature;
    const baseSlope = (-1 / n) * u ** (-1 / n - 1) * du;
    const baseCurvature =
      (-1 / n) * ((-1 / n - 1) * u ** (-1 / n - 2) * du * du + u ** (-1 / n - 1) * ddu);
    let noise = 1;
    let noiseSlope = 0;
    let noiseCurvature = 0;
    const harmonics = this.harmonicTable;
    for (let index = 0; index < harmonics.length; index += 3) {
      const order = harmonics[index];
      const amplitude = harmonics[index + 1];
      const angle = order * theta + harmonics[index + 2];
      const sinAngle = Math.sin(angle);
      noise += amplitude * sinAngle;
      noiseSlope += amplitude * order * Math.cos(angle);
      noiseCurvature -= amplitude * order * order * sinAngle;
    }
    this.curve[0] = base * noise;
    this.curve[1] = baseSlope * noise + base * noiseSlope;
    this.curve[2] = baseCurvature * noise + 2 * baseSlope * noiseSlope + base * noiseCurvature;
  }

  private measureBbox(): Rect {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < BBOX_SAMPLES; index++) {
      const theta = (index / BBOX_SAMPLES) * Math.PI * 2;
      this.evaluate(theta);
      const radius = this.curve[0];
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

/** İşaret sözleşmesinin TEK karşılaştırması; `contains` ve mesafe örneklemesi bunu paylaşır. */
function insideAt(rho: number, radialRadius: number): boolean {
  return rho <= radialRadius;
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

/** Dünya tohumundan habitat akışını türeten tek giriş; doğrudan tohum kullanılmaz. */
export function createHabitatDomain(
  storage: Readonly<Rect>,
  config: HabitatConfig,
  worldSeed: number,
): HabitatSDF {
  return new HabitatSDF(storage, config, createSimRandom(deriveStreamSeed(worldSeed, 'habitat')));
}

/** Alan ızgarası için habitat maskesi: 1 habitat içi hücre, 0 Void hücresi. */
export function rasterizeHabitatMask(domain: WorldDomain, resolution: number): Uint8Array {
  const mask = new Uint8Array(resolution * resolution);
  forEachCell(domain, resolution, (index, x, y) => {
    mask[index] = domain.contains(x, y) ? 1 : 0;
  });
  return mask;
}

/**
 * Kıyıya yaklaşırken 1→0 inen sunum gölgesi; fiziğe girmez. Void hücrelerinde
 * kırpma zaten 0 verdiği için mesafe hesaplanmaz — sonuç tam örneklemeyle bayt
 * bayt aynıdır (testle sabit), maliyeti değil.
 */
export function rasterizeHabitatShade(
  domain: WorldDomain,
  resolution: number,
  fadeUnits: number,
): Float32Array {
  if (!(fadeUnits > 0) || !Number.isFinite(fadeUnits)) {
    throw new RangeError(`Karartma mesafesi pozitif ve sonlu olmalı: ${fadeUnits}`);
  }
  const shade = new Float32Array(resolution * resolution);
  const sample: DomainSample = { distance: 0, normalX: 1, normalY: 0 };
  forEachCell(domain, resolution, (index, x, y) => {
    if (!domain.contains(x, y)) return;
    const distance = domain.sampleDistanceAndNormal(x, y, sample).distance;
    shade[index] = distance >= fadeUnits ? 1 : distance / fadeUnits;
  });
  return shade;
}

function forEachCell(
  domain: WorldDomain,
  resolution: number,
  visit: (index: number, x: number, y: number) => void,
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
      visit(y * resolution + x, storage.x + (x + 0.5) * cellWidth, worldY);
    }
  }
}
