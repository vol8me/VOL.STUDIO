import { describe, expect, it } from 'vitest';
import {
  PARTICLE_TYPE_COUNT,
  particleConfig,
  particleInteractionMatrix,
  particlePalette,
  validateParticleConfig,
} from '@/config/particles';

describe('parçacık yapılandırması', () => {
  it('altı tür, altı renk, tür matrisi ve açık rol-menzil modeli taşır', () => {
    expect(PARTICLE_TYPE_COUNT).toBe(6);
    expect(particlePalette).toHaveLength(6);
    expect(particleInteractionMatrix).toHaveLength(36);
    expect(particleConfig.roleByType).toHaveLength(6);
    expect(particleConfig.interactionRadiusByRolePair).toHaveLength(9);
    expect(Math.max(...particleConfig.interactionRadiusByRolePair)).toBeLessThanOrEqual(
      particleConfig.interactionRadiusUnits,
    );
    expect(Math.min(...particleConfig.interactionRadiusByRolePair)).toBeGreaterThan(
      particleConfig.repulsionRadiusUnits,
    );
  });

  it('spatial hash aralığını aşan veya eksik rol menzilini reddeder', () => {
    expect(() => validateParticleConfig(particleConfig)).not.toThrow();
    expect(() =>
      validateParticleConfig({
        ...particleConfig,
        interactionRadiusByRolePair: new Float32Array([64]),
      }),
    ).toThrow(RangeError);
    expect(() =>
      validateParticleConfig({
        ...particleConfig,
        interactionRadiusUnits: particleConfig.cellSizeUnits + 1,
      }),
    ).toThrow(RangeError);
  });

  it.each([
    ['count', 0],
    ['count', 1.5],
    ['radiusUnits', 0],
    ['cellSizeUnits', NaN],
    ['repulsionRadiusUnits', 4],
    ['interactionRadiusUnits', -1],
    ['repulsionStrength', NaN],
    ['interactionStrength', -1],
    ['referenceHz', 0],
    ['frictionPerReferenceTick', 1.01],
    ['maxSpeedUnitsPerReferenceTick', 0],
    ['initialSpeedUnitsPerReferenceTick', -1],
    ['wallHardImpactThresholdUnitsPerReferenceTick', -1],
    ['wallSoftRestitution', 1.1],
    ['wallHardRestitution', -0.1],
    ['wallTangentRetention', NaN],
  ] as const)('geçersiz %s değerini çalışma zamanından önce reddeder', (key, value) => {
    expect(() => validateParticleConfig({ ...particleConfig, [key]: value })).toThrow(RangeError);
  });

  it('etkileşim matrisi asimetriktir ve yakın/orta mesafe ayrımı geçerlidir', () => {
    const asymmetric = Array.from({ length: 6 }, (_, left) =>
      Array.from({ length: 6 }, (_, right) => {
        return (
          particleInteractionMatrix[left * 6 + right] !==
          particleInteractionMatrix[right * 6 + left]
        );
      }).some(Boolean),
    ).some(Boolean);

    expect(asymmetric).toBe(true);
    expect(particleConfig.repulsionRadiusUnits).toBeLessThan(particleConfig.interactionRadiusUnits);
    expect(particleConfig.count).toBe(100);
  });
});
