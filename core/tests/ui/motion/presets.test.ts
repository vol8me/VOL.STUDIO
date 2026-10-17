import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LOADING_MIN_VISIBLE_MS,
  MOTION_BUDGET,
  MOTION_DURATIONS,
  MOTION_EASINGS,
  MOTION_INTERACTION,
  MOTION_JUICE,
  MOTION_PRESETS,
  MOTION_SAFETY_MARGIN_MS,
} from '../../../src/ui/motion/presets';
import {
  MOTION_BEGIN,
  MOTION_END,
  extractRegion,
  renderMotion,
  validateMotion,
  type MotionSource,
} from '../../../scripts/themeSource.mjs';

const css = readFileSync(resolve(import.meta.dirname, '../../../src/ui/theme.css'), 'utf-8');

const source: MotionSource = {
  durations: { ...MOTION_DURATIONS },
  easings: { ...MOTION_EASINGS },
  presets: Object.fromEntries(
    Object.entries(MOTION_PRESETS).map(([name, preset]) => [name, { ...preset }]),
  ),
  interaction: { ...MOTION_INTERACTION },
  loadingMinVisibleMs: LOADING_MIN_VISIBLE_MS,
  juice: { ...MOTION_JUICE },
};

describe('hareket presetleri (CONTRACT §4)', () => {
  it('juice ilkelleri adlı, birim son ekli ve sınırlıdır', () => {
    for (const [name, value] of Object.entries(MOTION_JUICE)) {
      expect(value, name).toBeGreaterThan(0);
      if (/(Ms|Px)$/.test(name)) expect(Number.isInteger(value), name).toBe(true);
    }
    // Basma yolu hafif; sarsıntı en çok 6 px ve 300 ms; flaş tek vuruşluk.
    expect(MOTION_JUICE.pressSquash).toBeGreaterThan(0.95);
    expect(MOTION_JUICE.shakeDistancePx).toBeLessThanOrEqual(6);
    expect(MOTION_JUICE.shakeDurationMs).toBeLessThanOrEqual(300);
    expect(MOTION_JUICE.hitFlashMs).toBeLessThanOrEqual(200);
  });

  it('dört temel süre 120/200/320/480 ms', () => {
    expect(MOTION_DURATIONS).toEqual({ fast: 120, base: 200, slow: 320, cinematic: 480 });
  });

  it('özel koreografi sözleşmedeki adlı sürelerdir; gizli sayısal istisna yok', () => {
    const ms = Object.fromEntries(Object.entries(MOTION_PRESETS).map(([k, v]) => [k, v.ms]));
    expect(ms).toEqual({
      scrimIn: 120,
      dialogIn: 200,
      modalOut: 140,
      cardStagger: 40,
      hudGain: 200,
      hudLoss: 80,
      tabSwitch: 160,
      sceneOut: 200,
      sceneIn: 320,
    });
    expect(MOTION_PRESETS.tabSwitch.offsetPx).toBe(6);
  });

  it('etkileşim ölçekleri, bütçe ve loading asgari süresi sözleşmedeki değerlerdir', () => {
    expect(MOTION_INTERACTION).toEqual({
      hoverScale: 1.02,
      pressScale: 0.96,
      cardSelectScale: 1.04,
    });
    expect(MOTION_BUDGET).toEqual({ groups: 3, particles: 64, blur: 1 });
    expect(LOADING_MIN_VISIBLE_MS).toBe(500);
    expect(MOTION_SAFETY_MARGIN_MS).toBeGreaterThan(0);
  });

  it('her presetin eğrisi tanımlı eğrilerdendir', () => {
    for (const [name, preset] of Object.entries(MOTION_PRESETS)) {
      expect(preset.easing in MOTION_EASINGS, name).toBe(true);
    }
  });

  it('kaynak yapısal olarak geçerli', () => {
    expect(validateMotion(source)).toEqual([]);
  });

  it('theme.css hareket bölgesi kaynaktan sapmamış (CSS ↔ TS tek kaynak)', () => {
    expect(extractRegion(css, MOTION_BEGIN, MOTION_END)).toBe(renderMotion(source).trim());
    expect(css).toContain('--vol-motion-duration-fast: 120ms;');
    expect(css).toContain('--vol-motion-preset-tab-switch-offset: 6px;');
  });

  describe('ihlal örnekleri', () => {
    const problems = (patch: Partial<MotionSource>): string =>
      validateMotion({ ...source, ...patch }).join('\n');

    it('geçersiz süreyi reddeder (sıfır, negatif, kesirli)', () => {
      expect(problems({ durations: { fast: 0 } })).toContain('süre fast');
      expect(problems({ durations: { fast: -5 } })).toContain('süre fast');
      expect(problems({ durations: { fast: 12.5 } })).toContain('süre fast');
    });

    it('geçersiz eğriyi ve bilinmeyen eğri kullanan preseti reddeder', () => {
      expect(problems({ easings: { standard: 'ease' } })).toContain('cubic-bezier');
      expect(problems({ presets: { x: { ms: 100, easing: 'yok' } } })).toContain('bilinmeyen eğri');
    });

    it('camelCase olmayan preset adını, kesirli ofseti ve aşırı ölçeği reddeder', () => {
      expect(problems({ presets: { 'Kötü-ad': { ms: 100, easing: 'standard' } } })).toContain(
        'camelCase',
      );
      expect(
        problems({ presets: { x: { ms: 100, easing: 'standard', offsetPx: 1.5 } } }),
      ).toContain('offsetPx');
      expect(problems({ interaction: { hoverScale: 3 } })).toContain('ölçek hoverScale');
      expect(problems({ loadingMinVisibleMs: 0 })).toContain('loading asgari süre');
      expect(problems({ juice: { pressSquash: 0 } })).toContain('juice pressSquash');
      expect(problems({ juice: { hoverLiftPx: 1.5 } })).toContain('hoverLiftPx tam sayı');
      expect(problems({ juice: { Kötü: 1 } })).toContain('juice adı');
    });
  });
});
