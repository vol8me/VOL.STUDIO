import { describe, expect, it } from 'vitest';
import type { ThemeSource } from '../../../scripts/themeSource.mjs';
import {
  THEMES_BEGIN,
  THEMES_END,
  TOKENS_BEGIN,
  TOKENS_END,
  applyGenerated,
  defaultTokens,
  extractRegion,
  kebab,
  renderThemes,
  renderTokens,
  validateThemeSource,
} from '../../../scripts/themeSource.mjs';

const colors: Record<string, string> = {
  uiBg: '#0d1115',
  uiSurface1: '#182028',
  brandSolid: '#b85518',
};
const semantic: Record<string, string> = {
  plateTopLight: '#ffffff1f',
  rarityRareSolid: '#356eb0',
};
const themes: Record<string, Record<string, string>> = {
  ember: { uiBg: '#140e0b', plateTopLight: '#ffd8b81f' },
};
const source: ThemeSource = { colors, semantic, themes };

const css = [
  ':root {',
  `  ${TOKENS_BEGIN}`,
  '  --eski: yok;',
  `  ${TOKENS_END}`,
  '  --vol-font-family: Jura;',
  '}',
  '',
  THEMES_BEGIN,
  THEMES_END,
  '',
  '@media (pointer: coarse) { :root { --vol-hit-target-min: 44px; } }',
  '',
].join('\n');

describe('tema kaynağı üretimi', () => {
  it('kebab adları: ui öneki düşer, rakam ayrılır, büyük harf tireye döner', () => {
    expect(kebab('uiBg')).toBe('bg');
    expect(kebab('uiSurface1')).toBe('surface-1');
    expect(kebab('plateTopLight')).toBe('plate-top-light');
    expect(kebab('rarityLegendaryGlow')).toBe('rarity-legendary-glow');
    // "ui" bir kelimenin başıysa düşmez.
    expect(kebab('uiltra')).toBe('uiltra');
  });

  it('varsayılan token sırası: önce genel renkler, sonra roller, kaynak sırasıyla', () => {
    expect(defaultTokens(colors, semantic).map((token) => token.cssVar)).toEqual([
      '--vol-ui-bg',
      '--vol-ui-surface-1',
      '--vol-ui-brand-solid',
      '--vol-ui-plate-top-light',
      '--vol-ui-rarity-rare-solid',
    ]);
  });

  it('geçerli kaynak sapma üretmez', () => {
    expect(validateThemeSource(source)).toEqual([]);
  });

  describe('ihlal örnekleri', () => {
    const problems = (patch: Partial<ThemeSource>): string =>
      validateThemeSource({ ...source, ...patch }).join('\n');

    it('desteklenmeyen (bilinmeyen) tema tokenını reddeder', () => {
      expect(problems({ themes: { ember: { uiYok: '#000000' } } })).toContain(
        'ember: desteklenmeyen token: uiYok',
      );
    });

    it('geçersiz renk biçimini reddeder (büyük harf, kısa, ad)', () => {
      expect(problems({ colors: { uiBg: '#0D1115' } })).toContain('uiBg');
      expect(problems({ colors: { uiBg: '#fff' } })).toContain('uiBg');
      expect(problems({ themes: { ember: { uiBg: 'red' } } })).toContain('ember.uiBg');
    });

    it('iki kümede aynı anahtarı ve kebab çakışmasını reddeder', () => {
      expect(problems({ semantic: { uiBg: '#000000' } })).toContain(
        'yinelenen token anahtarı: uiBg',
      );
      expect(problems({ colors: { uiBg: '#000000', bg: '#111111' } })).toContain(
        'CSS değişkeni çakışıyor: --vol-ui-bg',
      );
    });

    it('geçersiz tema kimliğini ve boş temayı reddeder', () => {
      expect(problems({ themes: { 'Ember!': { uiBg: '#000000' } } })).toContain(
        'tema kimliği geçersiz',
      );
      expect(problems({ themes: { ember: {} } })).toContain('hiçbir token geçersiz kılmıyor');
    });

    it('hiç renk yoksa reddeder', () => {
      expect(problems({ colors: {}, semantic: {} })).toContain('hiç renk tokenı yok');
    });
  });

  it('tema satırları geçersiz kılma anahtarı sırasından değil varsayılan token sırasından gelir', () => {
    const forward = renderThemes(colors, semantic, {
      ember: { uiBg: '#140e0b', plateTopLight: '#ffd8b81f' },
    });
    const reverse = renderThemes(colors, semantic, {
      ember: { plateTopLight: '#ffd8b81f', uiBg: '#140e0b' },
    });
    expect(reverse).toBe(forward);
    expect(forward).toBe(
      [
        ":root[data-vol-theme='ember'] {",
        '  --vol-ui-bg: #140e0b;',
        '  --vol-ui-plate-top-light: #ffd8b81f;',
        '}',
      ].join('\n'),
    );
  });

  it('applyGenerated yalnız işaretli bölgeleri yazar, elle yazılanı korur ve idempotenttir', () => {
    const once = applyGenerated(css, source);
    expect(once).toContain(renderTokens(colors, semantic));
    expect(once).toContain(":root[data-vol-theme='ember']");
    expect(once).toContain('--vol-font-family: Jura;');
    expect(once).toContain('--vol-hit-target-min: 44px;');
    expect(once).not.toContain('--eski');
    expect(applyGenerated(once, source)).toBe(once);
  });

  it('işaretler yoksa ya da ters ise üretim sessizce başka yere yazmaz', () => {
    expect(() => applyGenerated(':root {}', source)).toThrow(/işaretleri yok/);
    const reversed = css
      .replace(TOKENS_BEGIN, '@@')
      .replace(TOKENS_END, TOKENS_BEGIN)
      .replace('@@', TOKENS_END);
    expect(() => applyGenerated(reversed, source)).toThrow(/işaretleri yok ya da ters/);
    expect(extractRegion(':root {}', TOKENS_BEGIN, TOKENS_END)).toBeNull();
  });
});
