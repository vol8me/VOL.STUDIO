import { assertFiniteRange, assertPositiveFinite, assertPositiveInteger } from './validation';

export const PARTICLE_TYPE_COUNT = 6;
export const PARTICLE_ROLE_COUNT = 3;
export const GENOME_SCHEMA_VERSION = 1;
export const MULTIBAND_KERNEL_ID = 'multiband-directed-v1';

/** Mesafeye bağlı çok bantlı çift kuvvet profili (DESIGN.md §3). */
export interface PairForceProfile {
  readonly hardCoreRadiusUnits: number;
  readonly hardCoreStrength: number;
  /** Yakın/orta/uzak bant bitişleri, çift menziline oran; artan ve sonuncusu 1. */
  readonly bandEdges: readonly [number, number, number];
  /** Bant başına global çarpan; işaret bandın çekim/itme yönünü çevirebilir. */
  readonly bandScales: readonly [number, number, number];
}

export interface DynamicsGenes {
  readonly dampingPerReferenceTick: number;
  readonly maxSpeedUnitsPerReferenceTick: number;
  readonly initialSpeedUnitsPerReferenceTick: number;
  readonly forceScale: number;
}

export interface SeedingGenes {
  readonly patchCount: number;
  readonly patchRadiusUnits: number;
  readonly patchFraction: number;
  readonly cloudFraction: number;
  readonly cloudRadiusRatio: number;
  readonly typeWeights: readonly number[];
}

export interface FringeGenes {
  readonly widthUnits: number;
  readonly tidalStrength: number;
}

export interface PhysicsGenome {
  readonly schemaVersion: typeof GENOME_SCHEMA_VERSION;
  readonly kernelId: typeof MULTIBAND_KERNEL_ID;
  readonly roleByType: Uint8Array;
  /** Yönlü 6×6 kuvvet matrisi; `[a*6+b]` a'nın b'den aldığı kuvvet. */
  readonly strength: Float32Array;
  /** Yönlü 3×3 rol menzil çarpanı; çift menzili `cutoffUnits × rangeScale`. */
  readonly rangeScale: Float32Array;
  readonly cutoffUnits: number;
  readonly profile: PairForceProfile;
  readonly dynamics: DynamicsGenes;
  readonly seeding: SeedingGenes;
  readonly fringe: FringeGenes;
}

/** Adım 2 substrate doğrulamasının başlangıç genomu; Adım 3 kalifiye adayı DEĞİLDİR. */
export const defaultPhysicsGenome: PhysicsGenome = {
  schemaVersion: GENOME_SCHEMA_VERSION,
  kernelId: MULTIBAND_KERNEL_ID,
  roleByType: new Uint8Array([0, 0, 1, 1, 2, 2]),
  strength: new Float32Array([
    0.52, 0.66, -0.3, 0.24, -0.48, 0.14, -0.26, 0.4, 0.7, -0.36, 0.18, -0.54, 0.58, -0.22, 0.34,
    0.62, -0.4, 0.16, -0.44, 0.5, -0.16, 0.42, 0.6, -0.28, 0.22, -0.46, 0.56, -0.18, 0.38, 0.64,
    0.6, 0.12, -0.5, 0.54, -0.14, 0.36,
  ]),
  rangeScale: new Float32Array([1, 0.85, 0.7, 0.85, 0.75, 0.9, 0.7, 0.9, 0.8]),
  cutoffUnits: 96,
  profile: {
    hardCoreRadiusUnits: 11,
    hardCoreStrength: 0.42,
    bandEdges: [0.3, 0.65, 1],
    bandScales: [0.35, 1, 0.45],
  },
  dynamics: {
    dampingPerReferenceTick: 0.93,
    maxSpeedUnitsPerReferenceTick: 2.4,
    initialSpeedUnitsPerReferenceTick: 0.25,
    forceScale: 0.05,
  },
  seeding: {
    patchCount: 4,
    patchRadiusUnits: 70,
    patchFraction: 0.55,
    cloudFraction: 0.3,
    cloudRadiusRatio: 2.4,
    typeWeights: [1, 1, 1, 1, 1, 1],
  },
  fringe: {
    widthUnits: 24,
    tidalStrength: 0.03,
  },
};

export function clonePhysicsGenome(genome: PhysicsGenome): PhysicsGenome {
  return {
    ...genome,
    roleByType: genome.roleByType.slice(),
    strength: genome.strength.slice(),
    rangeScale: genome.rangeScale.slice(),
    profile: {
      ...genome.profile,
      bandEdges: [...genome.profile.bandEdges],
      bandScales: [...genome.profile.bandScales],
    },
    dynamics: { ...genome.dynamics },
    seeding: { ...genome.seeding, typeWeights: [...genome.seeding.typeWeights] },
    fringe: { ...genome.fringe },
  };
}

export function validatePhysicsGenome(genome: PhysicsGenome, particleRadiusUnits: number): void {
  if (genome.schemaVersion !== GENOME_SCHEMA_VERSION || genome.kernelId !== MULTIBAND_KERNEL_ID) {
    throw new RangeError('Genom şeması veya kernel kimliği bu çalışma zamanına ait değil.');
  }
  const rolesValid =
    genome.roleByType.length === PARTICLE_TYPE_COUNT &&
    genome.roleByType.every((role) => role < PARTICLE_ROLE_COUNT);
  const strengthValid =
    genome.strength.length === PARTICLE_TYPE_COUNT ** 2 &&
    genome.strength.every((value) => Number.isFinite(value) && Math.abs(value) <= 1);
  const rangeValid =
    genome.rangeScale.length === PARTICLE_ROLE_COUNT ** 2 &&
    genome.rangeScale.every((value) => Number.isFinite(value) && value > 0 && value <= 1);
  if (!rolesValid || !strengthValid || !rangeValid) {
    throw new RangeError('Genom rol, kuvvet veya menzil matrisi ayrışıyor.');
  }
  assertPositiveFinite(genome.cutoffUnits, 'Kernel menzili');
  validateProfile(genome.profile, genome, particleRadiusUnits);
  validateDynamics(genome.dynamics);
  validateSeeding(genome.seeding);
  assertPositiveFinite(genome.fringe.widthUnits, 'Void fringe genişliği');
  assertFiniteRange(genome.fringe.tidalStrength, 0, 1, 'Tidal stres');
}

function validateProfile(
  profile: PairForceProfile,
  genome: PhysicsGenome,
  particleRadiusUnits: number,
): void {
  assertPositiveFinite(profile.hardCoreRadiusUnits, 'Sert çekirdek yarıçapı');
  assertPositiveFinite(profile.hardCoreStrength, 'Sert çekirdek kuvveti');
  if (profile.hardCoreRadiusUnits <= particleRadiusUnits * 2) {
    throw new RangeError('Sert çekirdek yarıçapı parçacık çapından büyük olmalı.');
  }
  const [near, mid, far] = profile.bandEdges;
  if (!(near > 0 && near < mid && mid < far && far === 1)) {
    throw new RangeError('Bant bitişleri artan olmalı ve sonuncusu 1 olmalı.');
  }
  for (const scale of profile.bandScales) assertFiniteRange(scale, -1, 1, 'Bant çarpanı');
  const minRange = genome.cutoffUnits * Math.min(...genome.rangeScale);
  if (profile.hardCoreRadiusUnits >= minRange * near) {
    throw new RangeError('Sert çekirdek en dar çiftin yakın bandını yutuyor.');
  }
}

function validateDynamics(dynamics: DynamicsGenes): void {
  assertFiniteRange(dynamics.dampingPerReferenceTick, Number.MIN_VALUE, 1, 'Sönümleme');
  assertPositiveFinite(dynamics.maxSpeedUnitsPerReferenceTick, 'Hız tavanı');
  assertFiniteRange(
    dynamics.initialSpeedUnitsPerReferenceTick,
    0,
    dynamics.maxSpeedUnitsPerReferenceTick,
    'Başlangıç hızı',
  );
  assertPositiveFinite(dynamics.forceScale, 'Kuvvet ölçeği');
}

function validateSeeding(seeding: SeedingGenes): void {
  assertPositiveInteger(seeding.patchCount, 'Origin yaması sayısı');
  assertPositiveFinite(seeding.patchRadiusUnits, 'Origin yaması yarıçapı');
  assertFiniteRange(seeding.patchFraction, 0, 1, 'Yama payı');
  assertFiniteRange(seeding.cloudFraction, 0, 1, 'Bulut payı');
  if (seeding.patchFraction + seeding.cloudFraction > 1) {
    throw new RangeError('Yama ve bulut payları toplamı 1’i aşamaz.');
  }
  assertFiniteRange(seeding.cloudRadiusRatio, 1, 8, 'Bulut yarıçap oranı');
  const weightsValid =
    seeding.typeWeights.length === PARTICLE_TYPE_COUNT &&
    seeding.typeWeights.every((weight) => Number.isFinite(weight) && weight >= 0) &&
    seeding.typeWeights.some((weight) => weight > 0);
  if (!weightsValid) throw new RangeError('Tür ağırlıkları altı negatif olmayan değer taşımalı.');
}

export function serializePhysicsGenome(genome: PhysicsGenome): string {
  return JSON.stringify({
    ...genome,
    roleByType: Array.from(genome.roleByType),
    strength: Array.from(genome.strength),
    rangeScale: Array.from(genome.rangeScale),
  });
}

export function parsePhysicsGenome(serialized: string, particleRadiusUnits: number): PhysicsGenome {
  const raw = JSON.parse(serialized) as Record<string, unknown>;
  const genome = {
    ...raw,
    roleByType: Uint8Array.from(asNumberArray(raw.roleByType, 'roleByType')),
    strength: Float32Array.from(asNumberArray(raw.strength, 'strength')),
    rangeScale: Float32Array.from(asNumberArray(raw.rangeScale, 'rangeScale')),
  } as unknown as PhysicsGenome;
  validatePhysicsGenome(genome, particleRadiusUnits);
  return clonePhysicsGenome(genome);
}

function asNumberArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'number')) {
    throw new RangeError(`Genom alanı sayı dizisi olmalı: ${label}`);
  }
  return value;
}

/** 64 bitlik FNV-1a türevi; artefakt ve fingerprint kimliği için yeterli, kriptografik değil. */
export function digestString(value: string): string {
  let high = 0x811c9dc5;
  let low = 0x050c5d1f;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    high = Math.imul(high ^ code, 0x01000193);
    low = Math.imul(low ^ ((code * 31) & 0xffff), 0x01000193) ^ (high >>> 16);
  }
  return `${(high >>> 0).toString(16).padStart(8, '0')}${(low >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

export function digestPhysicsGenome(genome: PhysicsGenome): string {
  return digestString(serializePhysicsGenome(genome));
}
