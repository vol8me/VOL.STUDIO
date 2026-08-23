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
export * from './controls';
export * from './hud';
export * from './cards';
export { VOL_COLORS, type VolColorToken } from './colors';
export { Easing, animateValue, type AnimateValueOptions } from './animation';
