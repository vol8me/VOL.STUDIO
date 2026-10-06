import { describe, expect, it } from 'vitest';
import { VOL_COLORS } from '../../../src/ui/colors';
import { VOL_EMBER_OVERRIDES } from '../../../src/ui/themes/ember';
import { contrastRatio } from '../../support/contrast';

/**
 * Ember kontrast tabanı: son renk üzerinden (alfalı renkler zeminle birleştirilir).
 * Bu bir TABANDIR; kapsamlı tema kontrast kapısı UI-01.5'tedir ve aynı yardımcıyı
 * kullanır. Eşikler: normal metin 4.5, ikon/odak/kenarlık gibi metin dışı 3.
 */
const ember: Record<string, string> = { ...VOL_COLORS, ...VOL_EMBER_OVERRIDES };
const surfaces = ['uiBg', 'uiBgSubtle', 'uiSurface1', 'uiSurface2', 'uiSurface3', 'selectedFill'];

describe('ember kontrast tabanı', () => {
  for (const surface of surfaces) {
    for (const text of ['uiText', 'uiTextSecondary', 'uiTextMuted']) {
      it(`${text} / ${surface} ≥ 4.5`, () => {
        expect(contrastRatio(ember[text], ember[surface])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('ikon yüzeylerde ≥ 3', () => {
    for (const surface of surfaces) {
      expect(contrastRatio(ember.uiIcon, ember[surface]), surface).toBeGreaterThanOrEqual(3);
    }
  });

  it('üzerinde metin taşıyan marka dolguları (solid/hover/pressed) onBrand ile ≥ 4.5', () => {
    for (const fill of ['brandSolid', 'brandHover', 'brandPressed']) {
      expect(contrastRatio(ember.onBrand, ember[fill]), fill).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('odak halkası zeminlerde ≥ 3 ve güçlü kenarlık yüzeylerde ≥ 3', () => {
    for (const surface of ['uiBg', 'uiSurface1', 'uiSurface3', 'selectedFill']) {
      expect(contrastRatio(ember.focusRing, ember[surface]), surface).toBeGreaterThanOrEqual(3);
    }
    for (const surface of ['uiBg', 'uiSurface1', 'uiSurface2']) {
      expect(contrastRatio(ember.uiBorderStrong, ember[surface]), surface).toBeGreaterThanOrEqual(
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
});
