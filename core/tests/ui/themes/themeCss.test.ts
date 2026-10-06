import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VOL_COLORS } from '../../../src/ui/colors';
import {
  LOADING_MIN_VISIBLE_MS,
  MOTION_DURATIONS,
  MOTION_EASINGS,
  MOTION_INTERACTION,
  MOTION_PRESETS,
} from '../../../src/ui/motion/presets';
import { VOL_EMBER_OVERRIDES } from '../../../src/ui/themes/ember';
import { VOL_SEMANTIC_COLORS } from '../../../src/ui/themes/semanticColors';
import {
  THEMES_BEGIN,
  THEMES_END,
  TOKENS_BEGIN,
  TOKENS_END,
  applyGenerated,
  defaultTokens,
  extractRegion,
  validateThemeSource,
} from '../../../scripts/themeSource.mjs';

const css = readFileSync(resolve(import.meta.dirname, '../../../src/ui/theme.css'), 'utf-8');
const source = {
  colors: { ...VOL_COLORS } as Record<string, string>,
  semantic: { ...VOL_SEMANTIC_COLORS } as Record<string, string>,
  themes: { ember: { ...VOL_EMBER_OVERRIDES } as Record<string, string> },
  motion: {
    durations: { ...MOTION_DURATIONS },
    easings: { ...MOTION_EASINGS },
    presets: Object.fromEntries(
      Object.entries(MOTION_PRESETS).map(([name, preset]) => [name, { ...preset }]),
    ),
    interaction: { ...MOTION_INTERACTION },
    loadingMinVisibleMs: LOADING_MIN_VISIBLE_MS,
  },
};

describe('theme.css ↔ tema kaynağı', () => {
  it('kaynak yapısal olarak geçerli', () => {
    expect(validateThemeSource(source)).toEqual([]);
  });

  it('theme.css kaynaktan sapmamış: gen:theme çalıştırmak dosyayı değiştirmez', () => {
    expect(applyGenerated(css, source), '`pnpm gen:theme` çalıştır ve sonucu commit et').toBe(css);
  });

  it('public VOL_COLORS uyumu: 60 genel token aynen durur, roller ayrı kümededir', () => {
    expect(Object.keys(VOL_COLORS)).toHaveLength(60);
    expect(Object.keys(VOL_SEMANTIC_COLORS)).toHaveLength(39);
    const keys = new Set(Object.keys(VOL_COLORS));
    for (const key of Object.keys(VOL_SEMANTIC_COLORS)) expect(keys.has(key), key).toBe(false);
    const region = extractRegion(css, TOKENS_BEGIN, TOKENS_END)!;
    for (const { cssVar, value } of defaultTokens(source.colors, {})) {
      expect(region, cssVar).toContain(`${cssVar}: ${value};`);
    }
  });

  it('ember yalnız bilinen tokenları geçersiz kılar ve varsayılandan gerçekten farklıdır', () => {
    const defaults: Record<string, string> = { ...VOL_COLORS, ...VOL_SEMANTIC_COLORS };
    for (const [key, value] of Object.entries(VOL_EMBER_OVERRIDES)) {
      expect(key in defaults, `${key} bilinmiyor`).toBe(true);
      expect(value, `${key} varsayılanla aynı: gereksiz geçersiz kılma`).not.toBe(defaults[key]);
    }
  });

  it('nadirlik renkleri kimliktir: hiçbir tema onları değiştirmez', () => {
    expect(Object.keys(VOL_EMBER_OVERRIDES).filter((key) => key.startsWith('rarity'))).toEqual([]);
  });

  it('tema blokları dosyada default + ember, ikişer seçiciyle durur; üretilen bölgelerin dışında renk satırı yok', () => {
    const themes = extractRegion(css, THEMES_BEGIN, THEMES_END)!;
    expect(themes.match(/^:root\[data-vol-theme='[a-z-]+'\],$/gm)).toEqual([
      ":root[data-vol-theme='default'],",
      ":root[data-vol-theme='ember'],",
    ]);
    expect(themes.match(/^\[data-vol-theme='[a-z-]+'\] \{$/gm)).toEqual([
      "[data-vol-theme='default'] {",
      "[data-vol-theme='ember'] {",
    ]);
    const outside = css
      .replace(extractRegion(css, TOKENS_BEGIN, TOKENS_END)!, '')
      .replace(themes, '');
    expect(outside.match(/--vol-ui-[a-z0-9-]+:\s*#/g) ?? []).toEqual([]);
  });

  it('default bloğu varsayılan token bölgesiyle birebir aynı değerleri taşır', () => {
    const tokens = extractRegion(css, TOKENS_BEGIN, TOKENS_END)!;
    const themes = extractRegion(css, THEMES_BEGIN, THEMES_END)!;
    const defaultBlock = /\[data-vol-theme='default'\] \{([^}]*)\}/.exec(themes)![1];
    const norm = (text: string): string[] =>
      text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    expect(norm(defaultBlock)).toEqual(norm(tokens));
  });
});
