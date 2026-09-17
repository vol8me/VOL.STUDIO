import {
  MULTIBAND_KERNEL_ID,
  PARTICLE_ROLE_COUNT,
  PARTICLE_TYPE_COUNT,
  PHYSICS_SCHEMA_VERSION,
  type SubstratePhysicsProfile,
} from '@/config/genome';
import { particleConfig } from '@/config/particles';
import { sobolPoint } from './seedingSampler';

/**
 * F3 — fizik uzayında UZAYI DOLDURAN örnekleme.
 *
 * Mevcut `GenomeSampler` varsayılan genomun etrafında jitter yapıyordu: aramayı
 * bilinen noktanın komşuluğuna hapsediyor ve "geniş arama" iddiasını boş
 * bırakıyordu. Burada her eksen kendi ARALIĞINDAN örneklenir.
 *
 * Aralıklar görev belgesinde ön-kayıtlı DEĞİLDİR (orada yalnız seeding var);
 * doğrulayıcının kabul ettiği bölge ile bugünkü varsayılanın çevresindeki
 * anlamlı büyüklük mertebeleri esas alınmıştır. Gerekçe DESIGN §8'de.
 */
export const physicsRanges = {
  /** Varsayılan 0,05; iki mertebe aşağı ve yukarı taranır. */
  forceScale: { min: 0.002, max: 0.5 },
  /** 1 = sönüm yok. Varsayılan 0,93. */
  dampingPerReferenceTick: { min: 0.85, max: 1 },
  /** Varsayılan 2,4. */
  maxSpeedUnitsPerReferenceTick: { min: 0.6, max: 4 },
  /**
   * Varsayılan 96. Alt sınır 64: sert çekirdek hem parçacık çapından büyük hem
   * de en dar çiftin yakın bandından küçük olmalı ve bu iki kısıt dar
   * menzillerde ÇELİŞİYOR (48 birimde geçerli aralık boş kalıyor). Üst sınır
   * 128: kernel menzili spatial-hash hücresini aşamaz.
   */
  cutoffUnits: { min: 64, max: 128 },
  hardCoreStrength: { min: 0.1, max: 0.8 },
  /** Bant çarpanları doğrulayıcıda [-1, 1] ile sınırlı. */
  bandScaleMid: { min: 0.3, max: 1 },
  bandScaleOuter: { min: 0.1, max: 1 },
} as const;

/** Etkileşim matrisinin genel işareti ve genliği; şekil sabit kalır. */
export const strengthRanges = {
  /** Doğrulayıcı |değer| ≤ 1 ister; genlik ve asimetri birlikte o sınırı aşamaz. */
  amplitude: { min: 0.2, max: 0.9 },
  asymmetry: { min: 0, max: 1 },
} as const;

function lerp(range: { min: number; max: number }, unit: number): number {
  return range.min + (range.max - range.min) * unit;
}

/**
 * Bir Sobol noktasını fizik profiline çevirir. Boyutlar seeding örnekleyicisiyle
 * ÇAKIŞMAZ: seeding 0-7 boyutlarını kullanır, fizik 8'den başlar.
 */
export function physicsProfileAt(index: number, scrambleSeed = 1): SubstratePhysicsProfile {
  const unit = (dimension: number): number => sobolPoint(index, dimension + 8, scrambleSeed);
  const cutoffUnits = lerp(physicsRanges.cutoffUnits, unit(3));
  const amplitude = lerp(strengthRanges.amplitude, unit(8));
  const asymmetry = lerp(strengthRanges.asymmetry, unit(9));

  const strength = new Float32Array(PARTICLE_TYPE_COUNT * PARTICLE_TYPE_COUNT);
  for (let row = 0; row < PARTICLE_TYPE_COUNT; row++) {
    for (let column = 0; column < PARTICLE_TYPE_COUNT; column++) {
      /*
       * Matris DETERMİNİSTİK bir desenden üretilir: köşegen çekim, uzak türler
       * itme, asimetri kovalamaca üretir. Rastgele 36 sayı örneklemek arama
       * uzayını 36 boyuta çıkarır ve 2048 aday orada hiçbir şey öğretmez.
       */
      const distance = Math.abs(row - column) / (PARTICLE_TYPE_COUNT - 1);
      const base = 1 - 2 * distance;
      const skew = asymmetry * (row < column ? 1 : -1) * distance;
      // Doğrulayıcı sınırı: |değer| ≤ 1. Kısıtlama sessiz değil, kuralın kendisi.
      strength[row * PARTICLE_TYPE_COUNT + column] = Math.max(
        -1,
        Math.min(1, amplitude * (base + skew)),
      );
    }
  }

  const rangeScale = new Float32Array(PARTICLE_ROLE_COUNT * PARTICLE_ROLE_COUNT);
  for (let index2 = 0; index2 < rangeScale.length; index2++) {
    rangeScale[index2] = 0.6 + 0.4 * sobolPoint(index, 18 + index2, scrambleSeed);
  }

  /*
   * Sert çekirdek yarıçapı TAHMİN EDİLMEZ, kısıttan türetilir: parçacık
   * çapından büyük ve en dar çiftin yakın bandından küçük olmalı. Aralığın
   * kendisi menzile ve menzil ölçeklerine bağlı olduğu için burada hesaplanır.
   */
  const nearEdge = 0.3;
  const minRangeScale = Math.min(...rangeScale);
  const hardCoreLower = particleConfig.radiusUnits * 2 * 1.05;
  const hardCoreUpper = cutoffUnits * minRangeScale * nearEdge * 0.95;
  const hardCoreRadiusUnits =
    hardCoreUpper > hardCoreLower
      ? hardCoreLower + (hardCoreUpper - hardCoreLower) * unit(4)
      : hardCoreLower;

  return {
    schemaVersion: PHYSICS_SCHEMA_VERSION,
    kernelId: MULTIBAND_KERNEL_ID,
    roleByType: new Uint8Array([0, 0, 1, 1, 2, 2]),
    strength,
    rangeScale,
    cutoffUnits,
    profile: {
      hardCoreRadiusUnits,
      hardCoreStrength: lerp(physicsRanges.hardCoreStrength, unit(5)),
      bandEdges: [nearEdge, 0.65, 1],
      bandScales: [
        0.35,
        lerp(physicsRanges.bandScaleMid, unit(6)),
        lerp(physicsRanges.bandScaleOuter, unit(7)),
      ],
    },
    dynamics: {
      dampingPerReferenceTick: lerp(physicsRanges.dampingPerReferenceTick, unit(1)),
      maxSpeedUnitsPerReferenceTick: lerp(physicsRanges.maxSpeedUnitsPerReferenceTick, unit(2)),
      forceScale: lerp(physicsRanges.forceScale, unit(0)),
    },
  };
}
