import { PARTICLE_ROLE_COUNT, PARTICLE_TYPE_COUNT } from '../../src/config/genome';
import type { PairForceKernel } from '../../src/runtime/sim/PairForceKernel';

/**
 * REDDEDİLEN ürün yolu: tek üçgen zarflı triangular çift yasası (DESIGN.md §3,
 * §14 ders 9). Yalnız yeniden üretilebilir negatif kontrol olarak yaşar;
 * çalışma zamanı bunu import etmez.
 */
export interface TriangularKernelParams {
  readonly repulsionRadiusUnits: number;
  readonly repulsionStrength: number;
  readonly interactionStrength: number;
  readonly roleByType: Uint8Array;
  readonly interactionRadiusByRolePair: Float32Array;
  readonly interactionMatrix: Float32Array;
}

export const legacyTriangularParams: TriangularKernelParams = {
  repulsionRadiusUnits: 16,
  repulsionStrength: 0.16,
  interactionStrength: 0.045,
  roleByType: new Uint8Array([0, 0, 1, 1, 2, 2]),
  interactionRadiusByRolePair: new Float32Array(9).fill(128),
  interactionMatrix: new Float32Array([
    0.42, 0.7, -0.35, 0.2, -0.55, 0.1, -0.2, 0.35, 0.72, -0.4, 0.15, -0.58, 0.55, -0.18, 0.3, 0.68,
    -0.42, 0.12, -0.48, 0.52, -0.12, 0.38, 0.64, -0.3, 0.18, -0.5, 0.6, -0.15, 0.34, 0.7, 0.66,
    0.14, -0.52, 0.58, -0.1, 0.32,
  ]),
};

export function createTriangularKernel(
  params: TriangularKernelParams = legacyTriangularParams,
): PairForceKernel {
  const cutoffUnits = Math.max(...params.interactionRadiusByRolePair);
  return {
    cutoffUnits,
    magnitude(distance, ownType, otherType) {
      if (distance < params.repulsionRadiusUnits) {
        return -params.repulsionStrength * (1 - distance / params.repulsionRadiusUnits);
      }
      const rolePair =
        params.roleByType[ownType] * PARTICLE_ROLE_COUNT + params.roleByType[otherType];
      const radius = params.interactionRadiusByRolePair[rolePair];
      if (distance >= radius) return 0;
      const phase =
        (distance - params.repulsionRadiusUnits) / (radius - params.repulsionRadiusUnits);
      return (
        params.interactionMatrix[ownType * PARTICLE_TYPE_COUNT + otherType] *
        params.interactionStrength *
        (1 - Math.abs(phase * 2 - 1))
      );
    },
  };
}
