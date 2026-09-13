export const PARTICLE_TYPE_COUNT = 6;
export const PARTICLE_ROLE_COUNT = 3;

export const particlePalette = [
  0x56d6ff, 0xff5e8a, 0x79e66d, 0xffc857, 0xb78cff, 0xff8a4c,
] as const;

export const particleInteractionMatrix = new Float32Array([
  0.42, 0.7, -0.35, 0.2, -0.55, 0.1, -0.2, 0.35, 0.72, -0.4, 0.15, -0.58, 0.55, -0.18, 0.3, 0.68,
  -0.42, 0.12, -0.48, 0.52, -0.12, 0.38, 0.64, -0.3, 0.18, -0.5, 0.6, -0.15, 0.34, 0.7, 0.66, 0.14,
  -0.52, 0.58, -0.1, 0.32,
]);

export const particleRoleByType = new Uint8Array([0, 0, 1, 1, 2, 2]);
export const particleInteractionRadiusByRolePair = new Float32Array(9).fill(128);

export interface ParticleConfig {
  readonly count: number;
  readonly radiusUnits: number;
  readonly cellSizeUnits: number;
  readonly repulsionRadiusUnits: number;
  readonly interactionRadiusUnits: number;
  readonly roleByType: Uint8Array;
  readonly interactionRadiusByRolePair: Float32Array;
  readonly repulsionStrength: number;
  readonly interactionStrength: number;
  readonly referenceHz: number;
  readonly frictionPerReferenceTick: number;
  readonly maxSpeedUnitsPerReferenceTick: number;
  readonly initialSpeedUnitsPerReferenceTick: number;
  readonly wallHardImpactThresholdUnitsPerReferenceTick: number;
  readonly wallSoftRestitution: number;
  readonly wallHardRestitution: number;
  readonly wallTangentRetention: number;
  readonly interactionMatrix: Float32Array;
}

export const particleConfig: ParticleConfig = {
  count: 100,
  radiusUnits: 4.5,
  cellSizeUnits: 128,
  repulsionRadiusUnits: 16,
  interactionRadiusUnits: 128,
  roleByType: particleRoleByType,
  interactionRadiusByRolePair: particleInteractionRadiusByRolePair,
  repulsionStrength: 0.16,
  interactionStrength: 0.045,
  referenceHz: 60,
  frictionPerReferenceTick: 0.94,
  maxSpeedUnitsPerReferenceTick: 2.2,
  initialSpeedUnitsPerReferenceTick: 0.35,
  wallHardImpactThresholdUnitsPerReferenceTick: 0.8,
  wallSoftRestitution: 0.78,
  wallHardRestitution: 0.9,
  wallTangentRetention: 0.998,
  interactionMatrix: particleInteractionMatrix,
};

export function validateParticleConfig(config: ParticleConfig): void {
  const rolesValid =
    config.roleByType.length === PARTICLE_TYPE_COUNT &&
    config.roleByType.every((role) => role < PARTICLE_ROLE_COUNT);
  const radiiValid =
    config.interactionRadiusByRolePair.length === PARTICLE_ROLE_COUNT ** 2 &&
    config.interactionRadiusByRolePair.every(
      (radius) =>
        Number.isFinite(radius) &&
        radius > config.repulsionRadiusUnits &&
        radius <= config.interactionRadiusUnits,
    );
  const matrixValid =
    config.interactionMatrix.length === PARTICLE_TYPE_COUNT ** 2 &&
    config.interactionMatrix.every(Number.isFinite);
  if (
    !rolesValid ||
    !radiiValid ||
    !matrixValid ||
    config.interactionRadiusUnits > config.cellSizeUnits
  ) {
    throw new RangeError('Parçacık rol, menzil ve spatial-hash yapılandırması ayrışıyor.');
  }
}
