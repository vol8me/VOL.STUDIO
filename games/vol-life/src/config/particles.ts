import type { PARTICLE_TYPE_COUNT } from './genome';
import { assertFiniteRange, assertPositiveFinite, assertPositiveInteger } from './validation';

export const particlePalette = [
  0x56d6ff, 0xff5e8a, 0x79e66d, 0xffc857, 0xb78cff, 0xff8a4c,
] as const satisfies readonly number[] & { readonly length: typeof PARTICLE_TYPE_COUNT };

export interface ParticleConfig {
  /** Depo kapasitesi; aktif sayı bunun altında dalgalanır (DESIGN.md §3). */
  readonly capacity: number;
  readonly radiusUnits: number;
  readonly cellSizeUnits: number;
  readonly referenceHz: number;
  /** Rezervuardan iç bölgeye yeniden ekim periyodu (saniye). */
  readonly reseedIntervalSeconds: number;
  /** Her periyotta rezervuardaki maddenin ne kadarının güvenli bölgeye ekileceği (0..1). */
  readonly reseedFraction: number;
  /** Küme çökmesini ve yapışmayı önleyen yerel hacim dışlama mesafesi (dünya birimi). */
  readonly exclusionRadiusUnits: number;
  /** Hacim dışlama kuvvet şiddeti (0..2). */
  readonly exclusionStrength: number;
}

export const particleConfig: ParticleConfig = {
  capacity: 512,
  radiusUnits: 4.5,
  cellSizeUnits: 128,
  referenceHz: 60,
  reseedIntervalSeconds: 60,
  reseedFraction: 0.5,
  exclusionRadiusUnits: 16,
  exclusionStrength: 0.35,
};

export function cloneParticleConfig(config: ParticleConfig): ParticleConfig {
  return { ...config };
}

export function validateParticleConfig(config: ParticleConfig): void {
  assertPositiveInteger(config.capacity, 'Parçacık kapasitesi');
  assertPositiveFinite(config.radiusUnits, 'Parçacık yarıçapı');
  assertPositiveFinite(config.cellSizeUnits, 'Spatial-hash hücresi');
  assertPositiveInteger(config.referenceHz, 'Referans tempo');
  assertPositiveFinite(config.reseedIntervalSeconds, 'Yeniden ekim periyodu');
  assertFiniteRange(config.reseedFraction, 0, 1, 'Yeniden ekim fraksiyonu');
  assertPositiveFinite(config.exclusionRadiusUnits, 'Hacim dışlama yarıçapı');
  assertFiniteRange(config.exclusionStrength, 0, 2, 'Hacim dışlama şiddeti');
}
