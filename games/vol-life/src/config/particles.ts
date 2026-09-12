import { worldConfig } from '@/config/world';

export const PARTICLE_TYPE_COUNT = 6;

export const particlePalette = [
  0x56d6ff, 0xff5e8a, 0x79e66d, 0xffc857, 0xb78cff, 0xff8a4c,
] as const;

export const particleInteractionMatrix = new Float32Array([
  0.42, 0.7, -0.35, 0.2, -0.55, 0.1, -0.2, 0.35, 0.72, -0.4, 0.15, -0.58, 0.55, -0.18, 0.3, 0.68,
  -0.42, 0.12, -0.48, 0.52, -0.12, 0.38, 0.64, -0.3, 0.18, -0.5, 0.6, -0.15, 0.34, 0.7, 0.66, 0.14,
  -0.52, 0.58, -0.1, 0.32,
]);

export interface ParticleConfig {
  readonly count: number;
  readonly worldSizeUnits: number;
  readonly radiusUnits: number;
  readonly cellSizeUnits: number;
  readonly repulsionRadiusUnits: number;
  readonly interactionRadiusUnits: number;
  readonly repulsionStrength: number;
  readonly interactionStrength: number;
  readonly friction: number;
  readonly maxSpeedUnitsPerTick: number;
  readonly initialSpeedUnitsPerTick: number;
  readonly interactionMatrix: Float32Array;
}

export const particleConfig: ParticleConfig = {
  count: 100,
  worldSizeUnits: worldConfig.sizeUnits,
  radiusUnits: 4.5,
  cellSizeUnits: 128,
  repulsionRadiusUnits: 16,
  interactionRadiusUnits: 128,
  repulsionStrength: 0.16,
  interactionStrength: 0.045,
  friction: 0.94,
  maxSpeedUnitsPerTick: 2.2,
  initialSpeedUnitsPerTick: 0.35,
  interactionMatrix: particleInteractionMatrix,
};
