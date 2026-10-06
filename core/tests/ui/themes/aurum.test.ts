import { describe, expect, it } from 'vitest';
import { VOL_COLORS } from '../../../src/ui/colors';
import { VOL_AURUM_OVERRIDES } from '../../../src/ui/themes/aurum';
import { contrastRatio } from '../../support/contrast';
import { deltaEOk } from '../../support/oklab';

/**
 * Aurum kontrast tabanı: son renk üzerinden (alfalı renkler zeminle birleştirilir).
 * Bu bir TABANDIR; kapsamlı tema kontrast kapısı UI-01.5'tedir ve aynı yardımcıyı
 * kullanır. Eşikler: normal metin 4.5, ikon/odak/kenarlık gibi metin dışı 3.
 */
const aurum: Record<string, string> = { ...VOL_COLORS, ...VOL_AURUM_OVERRIDES };
const surfaces = ['uiBg', 'uiBgSubtle', 'uiSurface1', 'uiSurface2', 'uiSurface3', 'selectedFill'];

describe('aurum kontrast tabanı', () => {
  for (const surface of surfaces) {
    for (const text of ['uiText', 'uiTextSecondary', 'uiTextMuted']) {
      it(`${text} / ${surface} ≥ 4.5`, () => {
        expect(contrastRatio(aurum[text], aurum[surface])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('ikon yüzeylerde ≥ 3', () => {
    for (const surface of surfaces) {
      expect(contrastRatio(aurum.uiIcon, aurum[surface]), surface).toBeGreaterThanOrEqual(3);
    }
  });

  it('üzerinde metin taşıyan marka dolguları (solid/hover/pressed) onBrand ile ≥ 4.5', () => {
    for (const fill of ['brandSolid', 'brandHover', 'brandPressed']) {
      expect(contrastRatio(aurum.onBrand, aurum[fill]), fill).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('odak halkası zeminlerde ≥ 3 ve güçlü kenarlık yüzeylerde ≥ 3', () => {
    for (const surface of ['uiBg', 'uiSurface1', 'uiSurface3', 'selectedFill']) {
      expect(contrastRatio(aurum.focusRing, aurum[surface]), surface).toBeGreaterThanOrEqual(3);
    }
    for (const surface of ['uiBg', 'uiSurface1', 'uiSurface2']) {
      expect(contrastRatio(aurum.uiBorderStrong, aurum[surface]), surface).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it('kontrast ölçümü doğru çalışır: bilinen çiftler ve alfa birleştirme', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#000000', '#000000')).toBeCloseTo(1, 5);
    // %50 beyaz siyah üstünde ≈ #808080 → 5.32:1
    expect(contrastRatio('#ffffff80', '#000000')).toBeCloseTo(5.32, 1);
    expect(() => contrastRatio('kırmızı', '#000000')).toThrow();
  });

  it('default ile bir bakışta ayrışır: marka, destek, vurgu ve zemin ailesi ayrı', () => {
    // Eski ikinci tema (kahve zemin + yakın turuncu) bu eşiklerin çok altındaydı.
    const gaps: Record<string, number> = {
      uiBg: 0.03,
      uiSurface2: 0.05,
      brandSolid: 0.12,
      supportSolid: 0.1,
      accentSolid: 0.12,
    };
    for (const [token, min] of Object.entries(gaps)) {
      const distance = deltaEOk(VOL_COLORS[token as keyof typeof VOL_COLORS], aurum[token]);
      expect(distance, token).toBeGreaterThanOrEqual(min);
    }
  });

  it('marka rengi altın tonunda, varsayılan marka turuncusunda değildir', () => {
    const hue = (hex: string): number => {
      const n = Number.parseInt(hex.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    expect(hue(aurum.brandSolid)).toBeGreaterThan(38);
    expect(hue(aurum.brandSolid)).toBeLessThan(52);
    expect(hue(VOL_COLORS.brandSolid)).toBeLessThan(28);
  });
});
