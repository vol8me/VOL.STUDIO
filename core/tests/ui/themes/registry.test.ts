import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VOL_COLORS } from '../../../src/ui/colors';
import { VOL_AURUM_OVERRIDES } from '../../../src/ui/themes/aurum';
import {
  DEFAULT_DENSITY,
  DEFAULT_THEME,
  DENSITY_IDS,
  THEME_IDS,
  resolveDensityId,
  resolveThemeId,
  themeCssVar,
} from '../../../src/ui/themes/registry';
import { VOL_SEMANTIC_COLORS } from '../../../src/ui/themes/semanticColors';
import { kebab } from '../../../scripts/themeSource.mjs';

const uiDir = resolve(import.meta.dirname, '../../../src/ui');
const themeCss = readFileSync(resolve(uiDir, 'theme.css'), 'utf-8');
const densityCss = readFileSync(resolve(uiDir, 'layout/density.css'), 'utf-8');

describe('tema ve yoğunluk kimlikleri', () => {
  it('THEME_IDS: default + üretilen her tema; theme.css her biri için blok taşır', () => {
    expect([...THEME_IDS]).toEqual([DEFAULT_THEME, ...Object.keys({ aurum: VOL_AURUM_OVERRIDES })]);
    for (const id of THEME_IDS) {
      expect(themeCss, id).toContain(`:root[data-vol-theme='${id}']`);
      expect(themeCss, id).toContain(`\n[data-vol-theme='${id}'] {`);
    }
    expect(themeCss.match(/data-vol-theme='/g)!.length).toBe(THEME_IDS.length * 2);
  });

  it('bilinmeyen değer varsayılana döner', () => {
    for (const value of ['', 'Aurum', 'x', 3, null, undefined, {}, ['aurum']]) {
      expect(resolveThemeId(value)).toBe(DEFAULT_THEME);
      expect(resolveDensityId(value)).toBe(DEFAULT_DENSITY);
    }
    expect(resolveThemeId('aurum')).toBe('aurum');
    expect(resolveDensityId('spacious')).toBe('spacious');
  });

  it('CSS değişken adı üretimi script ile aynı kuralı izler (her token)', () => {
    for (const token of [...Object.keys(VOL_COLORS), ...Object.keys(VOL_SEMANTIC_COLORS)]) {
      expect(themeCssVar(token as keyof typeof VOL_COLORS), token).toBe(`--vol-ui-${kebab(token)}`);
    }
  });
});

describe('density.css sözleşmesi', () => {
  it('her yoğunluk için kök ve kapsamlı seçici vardır', () => {
    for (const id of DENSITY_IDS) {
      expect(densityCss, id).toContain(`:root[data-vol-density='${id}']`);
      expect(densityCss, id).toContain(`[data-vol-density='${id}'] {`);
    }
  });

  it('yoğunluk yalnız boşluk ölçeğini değiştirir (font, radyus, hedef minimumu değil)', () => {
    const declared = [...densityCss.matchAll(/--vol-[a-z0-9-]+(?=:)/g)].map((match) => match[0]);
    const allowed = new Set([
      '--vol-space-xs',
      '--vol-space-sm',
      '--vol-space-md',
      '--vol-space-lg',
      '--vol-space-xl',
      '--vol-hit-target-min',
    ]);
    for (const name of declared) expect(allowed.has(name), name).toBe(true);
    expect(densityCss).not.toMatch(/--vol-(text|radius|font)/);
  });

  it('comfortable değerleri theme.css varsayılanıyla aynıdır (iç içe sıfırlama doğru)', () => {
    for (const name of ['xs', 'sm', 'md', 'lg', 'xl']) {
      const root = new RegExp(`--vol-space-${name}:\\s*([0-9]+px)`).exec(themeCss)![1];
      const block = /\[data-vol-density='comfortable'\] \{([^}]*)\}/.exec(densityCss)![1];
      expect(new RegExp(`--vol-space-${name}:\\s*${root}`).test(block), name).toBe(true);
    }
  });

  it('büyük hedef tabanı kaba işaretçiden bağımsız 44 px verir', () => {
    expect(densityCss).toMatch(
      /\[data-vol-target='large'\] \{\s*--vol-hit-target-min:\s*44px;\s*\}/,
    );
    // Taban niteliğe bağlıdır; anlık işaretçi medya sorgusuna değil.
    expect(/\[data-vol-target='large'\][^{]*\{[^}]*pointer/.test(densityCss)).toBe(false);
    expect(densityCss).not.toContain('@media');
  });

  it('theme.css density.css içe aktarır', () => {
    expect(themeCss).toContain("@import url('./layout/density.css');");
  });
});
