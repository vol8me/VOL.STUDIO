import { describe, expect, it } from 'vitest';
import {
  PARTICLE_TYPE_COUNT,
  particleConfig,
  particleInteractionMatrix,
  particlePalette,
} from '@/config/particles';

describe('parçacık yapılandırması', () => {
  it('altı tür, altı renk ve 6×6 etkileşim matrisi taşır', () => {
    expect(PARTICLE_TYPE_COUNT).toBe(6);
    expect(particlePalette).toHaveLength(6);
    expect(particleInteractionMatrix).toHaveLength(36);
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
