import type { PARTICLE_TYPE_COUNT } from './genome';
import { assertPositiveFinite, assertPositiveInteger } from './validation';

export const particlePalette = [
  0x56d6ff, 0xff5e8a, 0x79e66d, 0xffc857, 0xb78cff, 0xff8a4c,
] as const satisfies readonly number[] & { readonly length: typeof PARTICLE_TYPE_COUNT };

export interface ParticleConfig {
  /** Depo kapasitesi; aktif sayı bunun altında dalgalanır (DESIGN.md §3). */
  readonly capacity: number;
  readonly radiusUnits: number;
  readonly cellSizeUnits: number;
  readonly referenceHz: number;
}

export const particleConfig: ParticleConfig = {
  capacity: 512,
  radiusUnits: 4.5,
  cellSizeUnits: 128,
  referenceHz: 60,
};

export function cloneParticleConfig(config: ParticleConfig): ParticleConfig {
  return { ...config };
}

export function validateParticleConfig(config: ParticleConfig): void {
  assertPositiveInteger(config.capacity, 'Parçacık kapasitesi');
  assertPositiveFinite(config.radiusUnits, 'Parçacık yarıçapı');
  assertPositiveFinite(config.cellSizeUnits, 'Spatial-hash hücresi');
  assertPositiveInteger(config.referenceHz, 'Referans tempo');
}
