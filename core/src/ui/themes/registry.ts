import type { VolThemeToken } from './types';

/**
 * Tema ve yoğunluk kimlikleri: tek doğruluk kaynağı. `default` tema,
 * `colors.ts` + `semanticColors.ts` değerleridir; diğerleri `gen:theme`
 * tarafından üretilen `[data-vol-theme]` bloklarıdır (parite testi bu listenin
 * üretilen temalarla aynı olduğunu doğrular).
 */
export const THEME_IDS = ['default', 'ember'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = 'default';

/** Boşluk ölçeğini değiştiren yoğunluk: font ve radyus değişmez. */
export const DENSITY_IDS = ['compact', 'comfortable', 'spacious'] as const;
export type DensityId = (typeof DENSITY_IDS)[number];
export const DEFAULT_DENSITY: DensityId = 'comfortable';

/** Bilinmeyen/bozuk değer varsayılana döner; hata fırlatmaz (kalıcı kayıt bozulabilir). */
export function resolveThemeId(value: unknown): ThemeId {
  return THEME_IDS.find((id) => id === value) ?? DEFAULT_THEME;
}

export function resolveDensityId(value: unknown): DensityId {
  return DENSITY_IDS.find((id) => id === value) ?? DEFAULT_DENSITY;
}

/**
 * Token anahtarının CSS değişken adı (`uiSurface1` → `--vol-ui-surface-1`).
 * `core/scripts/themeSource.mjs` `kebab` ile aynı kuraldır; parite testlidir.
 */
export function themeCssVar(token: VolThemeToken): string {
  const name = token
    .replace(/^ui(?=[A-Z])/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase();
  return `--vol-ui-${name}`;
}
