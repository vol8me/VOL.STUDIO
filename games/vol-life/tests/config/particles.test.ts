import { describe, expect, it } from 'vitest';
import { PARTICLE_TYPE_COUNT } from '@/config/genome';
import {
  cloneParticleConfig,
  particleConfig,
  particlePalette,
  validateParticleConfig,
} from '@/config/particles';

describe('parçacık yapılandırması', () => {
  it('512 kapasiteyle başlar ve palet tür sayısını birebir kapsar', () => {
    expect(particleConfig.capacity).toBe(512);
    expect(particlePalette).toHaveLength(PARTICLE_TYPE_COUNT);
    expect(() => validateParticleConfig(particleConfig)).not.toThrow();
  });

  it('klon çağıranın sonradan yaptığı değişikliği taşımaz', () => {
    const clone = cloneParticleConfig(particleConfig);
    (clone as { capacity: number }).capacity = 1;

    expect(particleConfig.capacity).toBe(512);
  });

  it.each([
    ['capacity', 0],
    ['capacity', 1.5],
    ['radiusUnits', 0],
    ['radiusUnits', Number.NaN],
    ['cellSizeUnits', -1],
    ['referenceHz', 0],
  ] as const)('geçersiz %s=%s değerini çalışma zamanından önce reddeder', (key, value) => {
    expect(() => validateParticleConfig({ ...particleConfig, [key]: value })).toThrow(RangeError);
  });
});
