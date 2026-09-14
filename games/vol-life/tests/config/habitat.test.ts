import { describe, expect, it } from 'vitest';
import { cloneHabitatConfig, habitatConfig, validateHabitatConfig } from '@/config/habitat';

describe('habitatConfig', () => {
  it('varsayılan kontur yumuşak oval, düşük frekanslı ve depolamadan içeridedir', () => {
    expect(() => validateHabitatConfig(habitatConfig)).not.toThrow();
    expect(habitatConfig.noiseHarmonicMin).toBeGreaterThanOrEqual(2);
    expect(habitatConfig.noiseHarmonicMax).toBeLessThanOrEqual(8);
    expect(habitatConfig.noiseAmplitudeRatio).toBeLessThan(0.15);
    expect(habitatConfig.storageMarginUnits).toBeGreaterThan(0);
  });

  it('klon bağımsızdır', () => {
    const clone = cloneHabitatConfig(habitatConfig);
    (clone as { radiusRatioX: number }).radiusRatioX = 0.5;
    expect(habitatConfig.radiusRatioX).not.toBe(0.5);
  });

  it.each([
    ['radiusRatioX', 0.1],
    ['radiusRatioY', 0.99],
    ['superellipseExponent', 1],
    ['noiseAmplitudeRatio', 0.2],
    ['noiseHarmonicMin', 1],
    ['noiseHarmonicMin', 6],
    ['noiseHarmonicMax', 9],
    ['noiseHarmonicMax', 2.5],
    ['storageMarginUnits', 0],
    ['cameraVoidMarginRatio', 0.6],
  ] as const)('geçersiz %s=%s değerini reddeder', (key, value) => {
    expect(() => validateHabitatConfig({ ...habitatConfig, [key]: value })).toThrow(RangeError);
  });
});
