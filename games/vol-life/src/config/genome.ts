import { assertFiniteRange, assertPositiveFinite } from './validation';

export const PARTICLE_TYPE_COUNT = 6;
export const PARTICLE_ROLE_COUNT = 3;
export const PHYSICS_SCHEMA_VERSION = 1;
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

/**
 * Başlangıç hızı burada DEĞİLDİR: o bir doğuş koşuludur, hareket yasası değil,
 * ve `SeedingProfile`e aittir (DESIGN.md §3, E1).
 */
export interface DynamicsGenes {
  readonly dampingPerReferenceTick: number;
  readonly maxSpeedUnitsPerReferenceTick: number;
  readonly forceScale: number;
}

/**
 * Maddenin HAREKET yasası: roller, çift kuvvet matrisi, menzil ve dinamikler.
 * Nereye ekildiği (`SeedingProfile`) ve kıyının nasıl davrandığı (`VoidProfile`)
 * ayrı profillerdir; Adım 3 araştırması yalnız bunu ve seeding'i örnekler.
 */
export interface SubstratePhysicsProfile {
  readonly schemaVersion: typeof PHYSICS_SCHEMA_VERSION;
  readonly kernelId: typeof MULTIBAND_KERNEL_ID;
  readonly roleByType: Uint8Array;
  /** Yönlü 6×6 kuvvet matrisi; `[a*6+b]` a'nın b'den aldığı kuvvet. */
  readonly strength: Float32Array;
  /** Yönlü 3×3 rol menzil çarpanı; çift menzili `cutoffUnits × rangeScale`. */
  readonly rangeScale: Float32Array;
  readonly cutoffUnits: number;
  readonly profile: PairForceProfile;
  readonly dynamics: DynamicsGenes;
}

/** Adım 2 substrate doğrulamasının başlangıç profili; Adım 3 kalifiye adayı DEĞİLDİR. */
export const defaultPhysicsProfile: SubstratePhysicsProfile = {
  schemaVersion: PHYSICS_SCHEMA_VERSION,
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
    forceScale: 0.05,
  },
};

export function cloneSubstratePhysicsProfile(
  physics: SubstratePhysicsProfile,
): SubstratePhysicsProfile {
  return {
    ...physics,
    roleByType: physics.roleByType.slice(),
    strength: physics.strength.slice(),
    rangeScale: physics.rangeScale.slice(),
    profile: {
      ...physics.profile,
      bandEdges: [...physics.profile.bandEdges],
      bandScales: [...physics.profile.bandScales],
    },
    dynamics: { ...physics.dynamics },
  };
}

export function validateSubstratePhysicsProfile(
  physics: SubstratePhysicsProfile,
  particleRadiusUnits: number,
): void {
  if (
    physics.schemaVersion !== PHYSICS_SCHEMA_VERSION ||
    physics.kernelId !== MULTIBAND_KERNEL_ID
  ) {
    throw new RangeError('Fizik profili şeması veya kernel kimliği bu çalışma zamanına ait değil.');
  }
  const rolesValid =
    physics.roleByType.length === PARTICLE_TYPE_COUNT &&
    physics.roleByType.every((role) => role < PARTICLE_ROLE_COUNT);
  const strengthValid =
    physics.strength.length === PARTICLE_TYPE_COUNT ** 2 &&
    physics.strength.every((value) => Number.isFinite(value) && Math.abs(value) <= 1);
  const rangeValid =
    physics.rangeScale.length === PARTICLE_ROLE_COUNT ** 2 &&
    physics.rangeScale.every((value) => Number.isFinite(value) && value > 0 && value <= 1);
  if (!rolesValid || !strengthValid || !rangeValid) {
    throw new RangeError('Fizik profilinin rol, kuvvet veya menzil matrisi ayrışıyor.');
  }
  assertPositiveFinite(physics.cutoffUnits, 'Kernel menzili');
  validateProfile(physics.profile, physics, particleRadiusUnits);
  validateDynamics(physics.dynamics);
}

function validateProfile(
  profile: PairForceProfile,
  physics: SubstratePhysicsProfile,
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
  const minRange = physics.cutoffUnits * Math.min(...physics.rangeScale);
  if (profile.hardCoreRadiusUnits >= minRange * near) {
    throw new RangeError('Sert çekirdek en dar çiftin yakın bandını yutuyor.');
  }
}

function validateDynamics(dynamics: DynamicsGenes): void {
  assertFiniteRange(dynamics.dampingPerReferenceTick, Number.MIN_VALUE, 1, 'Sönümleme');
  assertPositiveFinite(dynamics.maxSpeedUnitsPerReferenceTick, 'Hız tavanı');
  assertPositiveFinite(dynamics.forceScale, 'Kuvvet ölçeği');
}

export function serializeSubstratePhysicsProfile(physics: SubstratePhysicsProfile): string {
  return JSON.stringify(canonicalPhysics(physics));
}

/** Tipli diziler JSON'da sıradan diziye iner; alan SIRASI digest'in parçasıdır. */
export function canonicalPhysics(physics: SubstratePhysicsProfile): Record<string, unknown> {
  return {
    schemaVersion: physics.schemaVersion,
    kernelId: physics.kernelId,
    roleByType: Array.from(physics.roleByType),
    strength: Array.from(physics.strength),
    rangeScale: Array.from(physics.rangeScale),
    cutoffUnits: physics.cutoffUnits,
    profile: {
      hardCoreRadiusUnits: physics.profile.hardCoreRadiusUnits,
      hardCoreStrength: physics.profile.hardCoreStrength,
      bandEdges: [...physics.profile.bandEdges],
      bandScales: [...physics.profile.bandScales],
    },
    dynamics: { ...physics.dynamics },
  };
}

export function parseSubstratePhysicsProfile(
  serialized: string,
  particleRadiusUnits: number,
): SubstratePhysicsProfile {
  const raw = JSON.parse(serialized) as Record<string, unknown>;
  const physics = {
    ...raw,
    roleByType: Uint8Array.from(asNumberArray(raw.roleByType, 'roleByType')),
    strength: Float32Array.from(asNumberArray(raw.strength, 'strength')),
    rangeScale: Float32Array.from(asNumberArray(raw.rangeScale, 'rangeScale')),
  } as unknown as SubstratePhysicsProfile;
  validateSubstratePhysicsProfile(physics, particleRadiusUnits);
  return cloneSubstratePhysicsProfile(physics);
}

function asNumberArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'number')) {
    throw new RangeError(`Fizik profili alanı sayı dizisi olmalı: ${label}`);
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

export function digestSubstratePhysicsProfile(physics: SubstratePhysicsProfile): string {
  return digestString(serializeSubstratePhysicsProfile(physics));
}
