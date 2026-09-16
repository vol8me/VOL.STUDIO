import { describe, expect, it } from 'vitest';
import { lifeGraphicsConfig, validateLifeGraphicsConfig } from '@/config/graphics';

describe('lifeGraphicsConfig', () => {
  it('renderer açıkça webgl ister; sessiz Canvas2D geri düşüşü yoktur', () => {
    expect(lifeGraphicsConfig.renderer).toBe('webgl');
    expect(() => validateLifeGraphicsConfig(lifeGraphicsConfig)).not.toThrow();
  });

  it('kamera çarpanları sınırlı, Void arka planı neredeyse mutlak siyahtır', () => {
    expect(lifeGraphicsConfig.cameraMaxZoomFactor).toBeGreaterThan(1);
    expect(lifeGraphicsConfig.cameraMaxZoomFactor).toBeLessThanOrEqual(3);
    expect(lifeGraphicsConfig.cameraInitialZoomFactor).toBeGreaterThanOrEqual(1);
    expect(lifeGraphicsConfig.voidBackgroundColor).toBe(0x000000);
  });

  it('kare border ayarı taşımaz (DESIGN §6: habitat konturu organiktir)', () => {
    expect(Object.keys(lifeGraphicsConfig).some((key) => key.startsWith('boundary'))).toBe(false);
  });

  /* C4: kontur-öteleme yolu silindi; ayarları da geri gelmemeli. */
  it('kontur segmenti ve Void halka ayarları taşımaz', () => {
    const removed = ['habitatContourSegments', 'voidGlowRingCount', 'voidGlowRingSpacingUnits'];

    expect(removed.filter((key) => key in lifeGraphicsConfig)).toEqual([]);
  });

  it.each([
    ['renderScale', 0],
    ['cameraMaxZoomFactor', 0.5],
    ['cameraInitialZoomFactor', 9],
    ['habitatEdgeFadeUnits', 0],
    ['habitatGlowResolution', 0],
    ['habitatGlowResolution', 100],
    ['habitatGlowDecayUnits', 0],
    ['habitatGlowShoreWidthUnits', Number.NaN],
    ['habitatGlowInteriorFadeUnits', -1],
    ['habitatGlowVoidAlpha', 2],
    ['habitatGlowShoreAlpha', -0.5],
    ['habitatGlowRasterBudgetMs', 0],
    ['voidPulsePeriodMs', -1],
    ['voidPulseAlphaMin', 2],
    ['voidPulseAlphaMax', 0.01],
    ['voidColor', 0x1000000],
    ['voidBackgroundColor', -1],
    ['voidDeathDurationMs', 0],
    ['voidDeathMaxGhosts', 0],
    ['voidDeathStretchMax', 0.5],
    ['particleVelocityStretchMax', 5],
    ['particleFringeStretchMax', 0],
  ] as const)('geçersiz %s=%s değerini sahne kurulmadan reddeder', (key, value) => {
    expect(() => validateLifeGraphicsConfig({ ...lifeGraphicsConfig, [key]: value })).toThrow(
      RangeError,
    );
  });
});
