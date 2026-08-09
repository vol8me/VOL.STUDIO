import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VOL_COLORS } from '../../src/ui/colors';

const themePath = resolve(import.meta.dirname, '../../src/ui/theme.css');
const themeContent = readFileSync(themePath, 'utf-8');

/** theme.css :root bloğundan --vol-ui-* custom property'lerini çıkarır. */
function extractThemeVars(css: string): Map<string, string> {
  const map = new Map<string, string>();
  const regex = /--vol-ui-([a-z0-9-]+):\s*([^;]+);/g;
  let match;
  while ((match = regex.exec(css)) !== null) {
    map.set(match[1], match[2].trim());
  }
  return map;
}

/** colors.ts'teki key'i CSS değişken adına çevirir: uiBg → bg, uiSurface1 → surface-1 */
function toCssVarName(key: string): string {
  const stripped = key.replace(/^ui/, '');
  return stripped
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase();
}

describe('Renk sync — colors.ts ↔ theme.css', () => {
  it("colors.ts'teki her token theme.css'te --vol-ui-* olarak var", () => {
    const themeVars = extractThemeVars(themeContent);

    for (const [tsKey, hex] of Object.entries(VOL_COLORS)) {
      const cssVar = toCssVarName(tsKey);
      const cssValue = themeVars.get(cssVar);
      expect(cssValue, `--vol-ui-${cssVar} theme.css'te yok`).toBeDefined();
      expect(cssValue).toBe(hex);
    }
  });

  it("theme.css'teki --vol-ui-* değişkenleri colors.ts'te karşılığı var", () => {
    const themeVars = extractThemeVars(themeContent);
    const tsKeys = new Set(Object.keys(VOL_COLORS).map(toCssVarName));

    for (const [cssVar] of themeVars) {
      expect(tsKeys.has(cssVar), `colors.ts'te karşılığı yok: --vol-ui-${cssVar}`).toBe(true);
    }
  });
});
