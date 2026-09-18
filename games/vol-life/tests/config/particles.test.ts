import { describe, expect, it } from 'vitest';
import { PARTICLE_TYPE_COUNT } from '@/config/genome';
import {
  cloneParticleConfig,
  particleConfig,
  particlePalette,
  validateParticleConfig,
} from '@/config/particles';

describe('parçacık yapılandırması', () => {
  it('512 kapasiteyle başlar, yeniden ekim değerleri kilitlidir ve palet tür sayısını kapsar', () => {
    expect(particleConfig.capacity).toBe(512);
    expect(particleConfig.reseedIntervalSeconds).toBe(60);
    expect(particleConfig.reseedFraction).toBe(0.5);
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
    ['reseedIntervalSeconds', 0],
    ['reseedIntervalSeconds', -10],
    ['reseedIntervalSeconds', Number.NaN],
    ['reseedFraction', -0.1],
    ['reseedFraction', 1.1],
    ['reseedFraction', Number.NaN],
    ['exclusionRadiusUnits', 0],
    ['exclusionRadiusUnits', -5],
    ['exclusionRadiusUnits', Number.NaN],
    ['exclusionStrength', -0.1],
    ['exclusionStrength', 2.5],
    ['exclusionStrength', Number.NaN],
  ] as const)('geçersiz %s=%s değerini çalışma zamanından önce reddeder', (key, value) => {
    expect(() => validateParticleConfig({ ...particleConfig, [key]: value })).toThrow(RangeError);
  });
});
