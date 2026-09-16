import {
  PARTICLE_TYPE_COUNT,
  canonicalPhysics,
  cloneSubstratePhysicsProfile,
  defaultPhysicsProfile,
  digestString,
  validateSubstratePhysicsProfile,
  type SubstratePhysicsProfile,
} from './genome';
import { assertFiniteRange, assertPositiveFinite, assertPositiveInteger } from './validation';

export const SEEDING_SCHEMA_VERSION = 1;
export const VOID_SCHEMA_VERSION = 1;
export const CANDIDATE_SCHEMA_VERSION = 1;

/**
 * Maddenin NEREYE ve NASIL doğduğu. Başlangıç hızı ve güvenli kenar payı
 * buraya aittir: ikisi de doğuş koşuludur, hareket yasası ya da kıyı fiziği
 * değil (DESIGN.md §2, E1).
 */
export interface SeedingProfile {
  readonly schemaVersion: typeof SEEDING_SCHEMA_VERSION;
  readonly patchCount: number;
  readonly patchRadiusUnits: number;
  readonly patchFraction: number;
  readonly cloudFraction: number;
  readonly cloudRadiusRatio: number;
  readonly typeWeights: readonly number[];
  /** Doğuş hızı; hareket yasası değil, başlangıç koşuludur. */
  readonly initialSpeedUnitsPerReferenceTick: number;
  /** Hiçbir parçacık kıyıya bundan daha yakın doğmaz. */
  readonly safeEdgeMarginUnits: number;
}

/**
 * Kıyının fiziği. Adım 2'de SABİTLENİR: Adım 3 morfoloji araması bunu
 * optimize etmez, örneklemez ve kaydıramaz (E2).
 */
export interface VoidProfile {
  readonly schemaVersion: typeof VOID_SCHEMA_VERSION;
  readonly widthUnits: number;
  readonly tidalStrength: number;
}

/**
 * Adayın hangi soruyla sınandığı (E10).
 *
 * - `intrinsic`: morfoloji yalnız güvenli iç bölgedeki maddeyle değerlendirilir.
 * - `void-stress`: yakınsamış yapı kıyıya taşınır; `tidalControl` işaretli koşu
 *   `tidalStrength = 0` kontrolüdür ve ikisinin farkı ölçülür.
 */
export type ExperimentScenario =
  | { readonly kind: 'intrinsic' }
  | { readonly kind: 'void-stress'; readonly tidalControl: boolean };

/** Fizik + seeding + Void + senaryo; Adım 3'ün taşıdığı tek kimlik. */
export interface SubstrateCandidate {
  readonly schemaVersion: typeof CANDIDATE_SCHEMA_VERSION;
  readonly physics: SubstratePhysicsProfile;
  readonly seeding: SeedingProfile;
  readonly void: VoidProfile;
  readonly scenario: ExperimentScenario;
}

export const defaultSeedingProfile: SeedingProfile = {
  schemaVersion: SEEDING_SCHEMA_VERSION,
  patchCount: 4,
  patchRadiusUnits: 70,
  patchFraction: 0.55,
  cloudFraction: 0.3,
  cloudRadiusRatio: 2.4,
  typeWeights: [1, 1, 1, 1, 1, 1],
  initialSpeedUnitsPerReferenceTick: 0.25,
  safeEdgeMarginUnits: 24,
};

export const defaultVoidProfile: VoidProfile = {
  schemaVersion: VOID_SCHEMA_VERSION,
  widthUnits: 24,
  tidalStrength: 0.03,
};

export const intrinsicScenario: ExperimentScenario = { kind: 'intrinsic' };

export const defaultSubstrateCandidate: SubstrateCandidate = {
  schemaVersion: CANDIDATE_SCHEMA_VERSION,
  physics: defaultPhysicsProfile,
  seeding: defaultSeedingProfile,
  void: defaultVoidProfile,
  scenario: intrinsicScenario,
};

export function cloneSeedingProfile(seeding: SeedingProfile): SeedingProfile {
  return { ...seeding, typeWeights: [...seeding.typeWeights] };
}

export function cloneVoidProfile(profile: VoidProfile): VoidProfile {
  return { ...profile };
}

export function cloneExperimentScenario(scenario: ExperimentScenario): ExperimentScenario {
  return scenario.kind === 'intrinsic' ? { kind: 'intrinsic' } : { ...scenario };
}

export function cloneSubstrateCandidate(candidate: SubstrateCandidate): SubstrateCandidate {
  return {
    schemaVersion: candidate.schemaVersion,
    physics: cloneSubstratePhysicsProfile(candidate.physics),
    seeding: cloneSeedingProfile(candidate.seeding),
    void: cloneVoidProfile(candidate.void),
    scenario: cloneExperimentScenario(candidate.scenario),
  };
}

export function validateSeedingProfile(seeding: SeedingProfile): void {
  if (seeding.schemaVersion !== SEEDING_SCHEMA_VERSION) {
    throw new RangeError('Seeding profili şeması bu çalışma zamanına ait değil.');
  }
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
  assertFiniteRange(
    seeding.initialSpeedUnitsPerReferenceTick,
    0,
    Number.MAX_VALUE,
    'Başlangıç hızı',
  );
  assertPositiveFinite(seeding.safeEdgeMarginUnits, 'Güvenli kenar payı');
}

export function validateVoidProfile(profile: VoidProfile): void {
  if (profile.schemaVersion !== VOID_SCHEMA_VERSION) {
    throw new RangeError('Void profili şeması bu çalışma zamanına ait değil.');
  }
  assertPositiveFinite(profile.widthUnits, 'Void fringe genişliği');
  assertFiniteRange(profile.tidalStrength, 0, 1, 'Tidal stres');
}

export function validateExperimentScenario(scenario: ExperimentScenario): void {
  if (scenario.kind === 'intrinsic') return;
  if (scenario.kind !== 'void-stress' || typeof scenario.tidalControl !== 'boolean') {
    throw new RangeError('Deney senaryosu intrinsic ya da void-stress olmalı.');
  }
}

/**
 * Profiller arası tek çapraz koşul burada durur: doğuş hızı hareket yasasının
 * hız tavanını aşamaz. Profil başına doğrulama bunu göremez, çünkü iki ayrı
 * profilin alanlarını karşılaştırır.
 */
export function validateSubstrateCandidate(
  candidate: SubstrateCandidate,
  particleRadiusUnits: number,
): void {
  if (candidate.schemaVersion !== CANDIDATE_SCHEMA_VERSION) {
    throw new RangeError('Aday şeması bu çalışma zamanına ait değil.');
  }
  validateSubstratePhysicsProfile(candidate.physics, particleRadiusUnits);
  validateSeedingProfile(candidate.seeding);
  validateVoidProfile(candidate.void);
  validateExperimentScenario(candidate.scenario);
  if (
    candidate.seeding.initialSpeedUnitsPerReferenceTick >
    candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick
  ) {
    throw new RangeError('Doğuş hızı hareket yasasının hız tavanını aşamaz.');
  }
}

export function canonicalSubstrateCandidate(
  candidate: SubstrateCandidate,
): Record<string, unknown> {
  return {
    schemaVersion: candidate.schemaVersion,
    physics: canonicalPhysics(candidate.physics),
    seeding: { ...candidate.seeding, typeWeights: [...candidate.seeding.typeWeights] },
    void: { ...candidate.void },
    scenario: cloneExperimentScenario(candidate.scenario),
  };
}

export function serializeSubstrateCandidate(candidate: SubstrateCandidate): string {
  return JSON.stringify(canonicalSubstrateCandidate(candidate));
}

export function parseSubstrateCandidate(
  serialized: string,
  particleRadiusUnits: number,
): SubstrateCandidate {
  const raw = JSON.parse(serialized) as { physics?: Record<string, unknown> };
  const physics = raw.physics;
  if (!physics || typeof physics !== 'object') {
    throw new RangeError('Aday fizik profili taşımalı.');
  }
  const candidate = {
    ...(raw as unknown as SubstrateCandidate),
    physics: {
      ...physics,
      roleByType: Uint8Array.from(asNumberArray(physics.roleByType, 'roleByType')),
      strength: Float32Array.from(asNumberArray(physics.strength, 'strength')),
      rangeScale: Float32Array.from(asNumberArray(physics.rangeScale, 'rangeScale')),
    },
  } as unknown as SubstrateCandidate;
  validateSubstrateCandidate(candidate, particleRadiusUnits);
  return cloneSubstrateCandidate(candidate);
}

function asNumberArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'number')) {
    throw new RangeError(`Aday alanı sayı dizisi olmalı: ${label}`);
  }
  return value;
}

export function digestSeedingProfile(seeding: SeedingProfile): string {
  return digestString(JSON.stringify({ ...seeding, typeWeights: [...seeding.typeWeights] }));
}

export function digestVoidProfile(profile: VoidProfile): string {
  return digestString(JSON.stringify(profile));
}

export function digestSubstrateCandidate(candidate: SubstrateCandidate): string {
  return digestString(serializeSubstrateCandidate(candidate));
}
