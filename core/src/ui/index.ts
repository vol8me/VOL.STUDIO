/**
 * Phaser taşımayan CORE UI yüzeyi.
 *
 * Web araçları bu alt yolu kullanır; kök barrel oyun runtime'ını da ihraç
 * ettiği için araç bundle'larında kök barrel kullanılmamalıdır.
 */
export * from './primitives';
export * from './layout';
export * from './overlays';
export * from './data';
export * from './feedback';
export * from './touch';
export * from './camera';
export * from './buttons';
export * from './hud';
export * from './cards';
export * from './focus';
export * from './textEntry';
export * from './glyphs';
export { suppressNativeMenus } from './nativeMenus';
export { VOL_COLORS, type VolColorToken } from './colors';
export {
  THEME_IDS,
  DENSITY_IDS,
  resolveThemeId,
  resolveDensityId,
  type ThemeId,
  type DensityId,
} from './themes/registry';
export type { VolThemeToken } from './themes/types';
export {
  ThemeController,
  type ThemeControllerOptions,
  type ThemeState,
  type ThemeStore,
} from './themes/ThemeController';
export { Easing, animateValue, type AnimateValueOptions } from './animation';
