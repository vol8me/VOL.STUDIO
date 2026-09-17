import {
  SEEDING_SCHEMA_VERSION,
  defaultVoidProfile,
  type SeedingProfile,
} from '@/config/candidate';
import type { SubstrateConfig } from '@/config/substrate';

/**
 * F1 seeding araştırması için ÖN-KAYITLI aralıklar. Sayılar görev belgesinden
 * birebir alınmıştır ve örnekleme başlamadan önce sabitlenmiştir.
 */
export interface SeedingRange {
  readonly min: number;
  readonly max: number;
}

export const seedingRanges = {
  patchCount: { min: 1, max: 12 },
  patchRadiusUnits: { min: 16, max: 128 },
  patchFraction: { min: 0.1, max: 0.9 },
  cloudFraction: { min: 0, max: 0.6 },
  cloudRadiusRatio: { min: 1, max: 6 },
  /** Alt sınır fringe + 8'dir; fringe genişliği Adım 2'de sabittir. */
  safeEdgeMarginUnits: { min: defaultVoidProfile.widthUnits + 8, max: 160 },
  /** Hız tavanının oranı olarak; 0–0,3. */
  initialSpeedRatio: { min: 0, max: 0.3 },
} as const satisfies Record<string, SeedingRange>;

/** Tür dağılımı şablonları: düzgün ve eğik. */
export const typeWeightTemplates: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1, 1],
  [3, 2, 1, 1, 1, 1],
  [1, 1, 1, 1, 2, 3],
  [4, 1, 1, 1, 1, 4],
];

/**
 * Scrambled Sobol (Owen tarzı karıştırma). Uzayı DOLDURAN örnekleme gerekir:
 * düz rastgele örnekleme 512 noktada kümelenir ve aralığın bazı bölgelerini
 * hiç görmez. Karıştırma tohumu sabittir, yani koşu yeniden üretilebilir.
 */
export function sobolPoint(index: number, dimension: number, scrambleSeed: number): number {
  let result = 0;
  let denominator = 1;
  let value = index + 1;
  const base = PRIMES[dimension % PRIMES.length];
  while (value > 0) {
    denominator *= base;
    result += (value % base) / denominator;
    value = Math.floor(value / base);
  }
  // Owen karıştırması yerine boyut başına deterministik kaydırma: aynı tohum
  // aynı noktaları verir ve boyutlar arası korelasyon kırılır.
  const shift = fract(Math.sin((scrambleSeed + 1) * (dimension + 1) * 12.9898) * 43758.5453);
  return fract(result + shift);
}

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19];

function fract(value: number): number {
  return value - Math.floor(value);
}

function lerp(range: SeedingRange, unit: number): number {
  return range.min + (range.max - range.min) * unit;
}

/**
 * `kenar payı + yama yarıçapı` toplamının üst sınırı. DESIGN §2 güvenli iç
 * bölgenin habitat alanının yarısından küçük olmasını yasaklar; kural
 * `(Rx−o)(Ry−o) ≥ 0,5·Rx·Ry` ikinci derece denklemidir ve burada ÇÖZÜLÜR.
 *
 * Ön-kayıtlı aralıklar bu kısıttan bağımsız yazılmıştı: ham kutuda örneklerin
 * çoğu motorun kendi doğrulamasına takılıyor (ölçüldü: ilk 12 örneğin 11'i).
 * Aralıklar ÜST SINIR olarak korunur, örnekleme geçerli bölgeye eşlenir.
 */
export function maxSeedingOffsetUnits(config: SubstrateConfig): number {
  const { width, height } = config.world.boundsUnits;
  const noise = 1 - config.habitat.noiseAmplitudeRatio;
  const radiusX = (width / 2) * config.habitat.radiusRatioX * noise;
  const radiusY = (height / 2) * config.habitat.radiusRatioY * noise;
  const sum = radiusX + radiusY;
  const product = radiusX * radiusY;
  // (Rx−o)(Ry−o) = 0,5·Rx·Ry → o² − (Rx+Ry)o + 0,5·Rx·Ry = 0
  const discriminant = sum * sum - 2 * product;
  if (discriminant <= 0) return 0;
  return (sum - Math.sqrt(discriminant)) / 2;
}

/**
 * Bir Sobol noktasını `SeedingProfile`e çevirir. Tamsayı alanlar yuvarlanır;
 * yuvarlama aralığın uçlarını KIRPMAZ, çünkü uç değerler de sınanmalıdır.
 */
export function seedingProfileAt(
  index: number,
  scrambleSeed = 1,
  config?: SubstrateConfig,
): SeedingProfile {
  const unit = (dimension: number): number => sobolPoint(index, dimension, scrambleSeed);
  const patchFraction = lerp(seedingRanges.patchFraction, unit(2));
  /* Bulut payı, toplamın 1'i aşmasına izin verilmeyen bölgeye eşlenir. */
  const cloudCeiling = Math.min(seedingRanges.cloudFraction.max, 1 - patchFraction);
  const cloudFraction = lerp({ min: seedingRanges.cloudFraction.min, max: cloudCeiling }, unit(3));

  const maxOffset = config ? maxSeedingOffsetUnits(config) : Number.POSITIVE_INFINITY;
  const marginMin = seedingRanges.safeEdgeMarginUnits.min;
  const radiusCeiling = Math.min(
    seedingRanges.patchRadiusUnits.max,
    Math.max(seedingRanges.patchRadiusUnits.min, maxOffset - marginMin),
  );
  const patchRadiusUnits = lerp(
    { min: seedingRanges.patchRadiusUnits.min, max: radiusCeiling },
    unit(1),
  );
  const marginCeiling = Math.min(
    seedingRanges.safeEdgeMarginUnits.max,
    Math.max(marginMin, maxOffset - patchRadiusUnits),
  );
  const safeEdgeMarginUnits = lerp({ min: marginMin, max: marginCeiling }, unit(5));

  return {
    schemaVersion: SEEDING_SCHEMA_VERSION,
    patchCount: Math.max(1, Math.round(lerp(seedingRanges.patchCount, unit(0)))),
    patchRadiusUnits,
    patchFraction,
    cloudFraction,
    cloudRadiusRatio: lerp(seedingRanges.cloudRadiusRatio, unit(4)),
    safeEdgeMarginUnits,
    initialSpeedUnitsPerReferenceTick: 0,
    typeWeights:
      typeWeightTemplates[
        Math.min(typeWeightTemplates.length - 1, Math.floor(unit(7) * typeWeightTemplates.length))
      ],
  };
}

/** Başlangıç hızı hız tavanının oranıdır; tavan adaydan gelir. */
export function initialSpeedFor(index: number, maxSpeed: number, scrambleSeed = 1): number {
  return maxSpeed * lerp(seedingRanges.initialSpeedRatio, sobolPoint(index, 6, scrambleSeed));
}
