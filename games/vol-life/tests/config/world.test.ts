import { describe, expect, it } from 'vitest';
import {
  resolveMaxStepsForSpeed,
  resolveSimulationHz,
  validateWorldConfig,
  worldConfig,
} from '@/config/world';
import { lifeGraphicsConfig } from '@/config/graphics';

describe('worldConfig', () => {
  it('sonlu dünya sınırı pozitif ve tek kaynaktır', () => {
    expect(worldConfig.boundsUnits).toEqual({ x: 0, y: 0, width: 1024, height: 1024 });
    expect(Object.values(worldConfig.boundsUnits).every(Number.isFinite)).toBe(true);
    expect(worldConfig.particleCollisionInsetUnits).toBeGreaterThan(0);
    expect(worldConfig.particleCollisionInsetUnits * 2).toBeLessThan(worldConfig.boundsUnits.width);
  });

  it('sabit adım pozitiftir', () => {
    expect(worldConfig.fixedStepMs).toBeGreaterThan(0);
  });

  /*
   * Ölüm sarmalının kapısı. Tavan yükseldiğinde kare bütçesini aşan bir koşu
   * daha çok telafi adımı ister ve geri dönemez; bu yüzden sayı bir tercih
   * değil sözleşmedir.
   */
  it('kare başına adım tavanı telafi sarmalına izin vermez', () => {
    expect(worldConfig.maxStepsPerFrame).toBeGreaterThanOrEqual(1);
    expect(worldConfig.maxStepsPerFrame).toBeLessThanOrEqual(2);
  });

  it('world-instance seed build yapılandırmasında tutulmaz', () => {
    expect(worldConfig).not.toHaveProperty('seed');
  });

  it('canlı yapılandırma 256² alanı 10 Hz tam günceller', () => {
    expect(worldConfig.fieldResolution).toBe(256);
    expect(worldConfig.fieldHz).toBe(10);
    expect(worldConfig.fieldUpdateBands).toBe(1);
  });

  it('sabit adımdan tam sayı simülasyon temposunu türetir', () => {
    expect(resolveSimulationHz(1000 / 60)).toBe(60);
    expect(resolveSimulationHz(1000 / 30)).toBe(30);
    expect(() => resolveSimulationHz(17)).toThrow(RangeError);
    expect(() => resolveSimulationHz(NaN)).toThrow(RangeError);
    expect(() => resolveSimulationHz(Number.MIN_VALUE)).toThrow(RangeError);
    expect(() => resolveSimulationHz(Number.MAX_VALUE)).toThrow(RangeError);
  });

  it.each([
    ['fixedStepMs', 0],
    ['maxStepsPerFrame', 1.5],
    ['fieldResolution', 30],
    ['fieldHz', 7],
    ['fieldUpdateBands', 3],
    ['lightSourceCount', 0],
    ['lightSourceRadiusUnits', NaN],
    ['lightSourceDriftUnits', -1],
    ['nutrientDiffusion', 0.3],
    ['nutrientRenewal', 1.1],
  ] as const)('geçersiz %s değerini dünya kurulmadan reddeder', (key, value) => {
    expect(() => validateWorldConfig({ ...worldConfig, [key]: value })).toThrow(RangeError);
  });

  it('resolveMaxStepsForSpeed hız çarpanına göre tavanı güvenle ölçekler', () => {
    expect(resolveMaxStepsForSpeed(1)).toBe(2);
    expect(resolveMaxStepsForSpeed(2)).toBe(4);
    expect(resolveMaxStepsForSpeed(4)).toBe(8);
    expect(resolveMaxStepsForSpeed(0.5)).toBe(1);
    // Güvenlik sınırları: 4x üzerini kelepçeler, bozuk değerde 1x tabanını korur
    expect(resolveMaxStepsForSpeed(10)).toBe(8);
    expect(resolveMaxStepsForSpeed(NaN)).toBe(2);
  });
});

describe('lifeGraphicsConfig', () => {
  it('renderer açıkça webgl ister; sessiz Canvas2D geri düşüşü yoktur', () => {
    expect(lifeGraphicsConfig.renderer).toBe('webgl');
  });

  it('renderScale 0.25–1 aralığındadır', () => {
    expect(lifeGraphicsConfig.renderScale).toBeGreaterThanOrEqual(0.25);
    expect(lifeGraphicsConfig.renderScale).toBeLessThanOrEqual(1);
  });

  it('mevcut parçacık ayrıntısında bilgi taşımayan aşırı yakınlaştırmayı sınırlar', () => {
    expect(lifeGraphicsConfig.cameraMaxZoomFactor).toBeGreaterThan(1);
    expect(lifeGraphicsConfig.cameraMaxZoomFactor).toBeLessThanOrEqual(3);
  });

  it('görsel sınır kalınlığı fizik insetinden bağımsız sunum verisidir', () => {
    expect(lifeGraphicsConfig.boundaryPreferredThicknessUnits).toBeGreaterThan(0);
    expect(lifeGraphicsConfig.boundaryMinScreenPixels).toBeLessThanOrEqual(
      lifeGraphicsConfig.boundaryMaxScreenPixels,
    );
  });
});
