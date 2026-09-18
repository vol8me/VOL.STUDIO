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
  /** Hacim dışlama kuvvet şiddeti (0..4). */
  readonly exclusionStrength: number;
  /** Geometrik iç içe geçmeyi (penetrasyon) engelleyen sert temas bariyeri şiddeti (0..8). */
  readonly contactStrength: number;
  /** Ekolojik vent içinde parçacıkların tek tek doğuş aralığı (tick, 60 Hz'de 90 ≈ 1.5 sn). */
  readonly ventCadenceTicks: number;
  /** Tek bir vent grubunda doğacak asgari parçacık sayısı. */
  readonly ventBurstMin: number;
  /** Tek bir vent grubunda doğacak azami parçacık sayısı. */
  readonly ventBurstMax: number;
  /** Vent grubu tamamlandıktan sonraki ekolojik dinlenme süresi (tick, 1500 ≈ 25 sn). */
  readonly ventCooldownTicks: number;
}

export const particleConfig: ParticleConfig = {
  capacity: 512,
  radiusUnits: 4.5,
  cellSizeUnits: 128,
  referenceHz: 60,
  reseedIntervalSeconds: 60,
  reseedFraction: 0.5,
  exclusionRadiusUnits: 18,
  exclusionStrength: 2.4,
  contactStrength: 4.0,
  ventCadenceTicks: 90,
  ventBurstMin: 2,
  ventBurstMax: 4,
  ventCooldownTicks: 1500,
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
  assertFiniteRange(config.exclusionStrength, 0, 4, 'Hacim dışlama şiddeti');
  assertFiniteRange(config.contactStrength, 0, 8, 'Temas bariyeri şiddeti');
  assertPositiveInteger(config.ventCadenceTicks, 'Vent kadans tick');
  assertPositiveInteger(config.ventBurstMin, 'Vent asgari parçacık');
  assertPositiveInteger(config.ventBurstMax, 'Vent azami parçacık');
  if (config.ventBurstMin > config.ventBurstMax) {
    throw new RangeError('Vent asgari parçacık sayısı azamiden büyük olamaz.');
  }
  assertPositiveInteger(config.ventCooldownTicks, 'Vent dinlenme tick');
}
