import { describe, expect, it } from 'vitest';
import { worldConfig } from '@/config/world';
import { lifeGraphicsConfig } from '@/config/graphics';

describe('worldConfig', () => {
  it('toroidal dünya kenarı pozitif ve sonludur', () => {
    expect(worldConfig.sizeUnits).toBeGreaterThan(0);
    expect(Number.isFinite(worldConfig.sizeUnits)).toBe(true);
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

  it('seed tam sayıdır — dünya tekrar üretilebilir', () => {
    expect(Number.isInteger(worldConfig.seed)).toBe(true);
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
});
