import { describe, expect, it } from 'vitest';
import {
  fittingWindowSizes,
  isRenderScaleChoice,
  isWindowSizeChoice,
  RENDER_SCALES,
  RESOLUTION_AUTO,
  windowSizeOf,
  WINDOW_SIZES,
} from '@/config/resolution';

describe('çözünürlük tercihleri', () => {
  it('çizim ölçeği yalnız auto ya da bilinen sabit basamaktır; 1 üstü ve 0,5 altı kabul edilmez', () => {
    expect(isRenderScaleChoice(RESOLUTION_AUTO)).toBe(true);
    for (const scale of RENDER_SCALES) expect(isRenderScaleChoice(scale)).toBe(true);
    for (const bad of [0, 0.25, 1.5, 2, -1, '1', null, undefined, Number.NaN])
      expect(isRenderScaleChoice(bad), String(bad)).toBe(false);
    // Basamaklar azalan ve CORE aralığının (0,25–1) içindedir.
    expect([...RENDER_SCALES]).toEqual([...RENDER_SCALES].sort((a, b) => b - a));
    expect(Math.max(...RENDER_SCALES)).toBe(1);
    expect(Math.min(...RENDER_SCALES)).toBeGreaterThanOrEqual(0.25);
  });

  it('pencere boyutu auto ya da ön ayar kimliğidir ve kimlik boyuta çevrilir', () => {
    expect(isWindowSizeChoice(RESOLUTION_AUTO)).toBe(true);
    expect(isWindowSizeChoice('1920x1080')).toBe(true);
    for (const bad of ['1920×1080', '800x600', 1920, null, ''])
      expect(isWindowSizeChoice(bad)).toBe(false);
    expect(windowSizeOf('1920x1080')).toEqual({ width: 1920, height: 1080 });
    expect(windowSizeOf(RESOLUTION_AUTO)).toBeUndefined();
    for (const size of WINDOW_SIZES)
      expect(windowSizeOf(`${size.width}x${size.height}`)).toEqual(size);
  });

  it('yalnız ekrana sığan ön ayarlar önerilir; auto her zaman vardır', () => {
    expect(fittingWindowSizes({ width: 1366, height: 768 })).toEqual([RESOLUTION_AUTO, '1280x720']);
    expect(fittingWindowSizes({ width: 1920, height: 1040 })).toEqual([
      RESOLUTION_AUTO,
      '1280x720',
      '1600x900',
    ]);
    expect(fittingWindowSizes({ width: 3840, height: 2160 })).toHaveLength(WINDOW_SIZES.length + 1);
    expect(fittingWindowSizes({ width: 320, height: 200 })).toEqual([RESOLUTION_AUTO]);
  });
});
