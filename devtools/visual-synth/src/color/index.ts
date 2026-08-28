/**
 * @volstudio/visual-synth/color
 *
 * Renk uzayı, palet ve dither yardımcılarının DAR alt yolu.
 *
 * `visual-synth` barrel'ının tamamı prosedürel sentez motorunu (alan değerlendirme,
 * şema, render) da taşır; piksel editörü yalnız renk matematiğine ihtiyaç
 * duyar ve barrel üzerinden almak istemci paketine binlerce satır ölü kod
 * sokardı. Bu alt yol DOM ve Node bağımlılığı taşımaz.
 */
export {
  linearToSrgb,
  oklabDistance,
  oklabToRgb,
  rgbToOklab,
  srgbToLinear,
  type Oklab,
} from './oklab';
export { isPaletteColor, packRgb, parseHexColor, resolvePalette } from './palette';
export type { ResolvablePalette, ResolvedPalette } from './palette';
export { nearestPaletteIndex, type QuantizeMode } from './quantize';
export {
  applyDither,
  bayerMatrix,
  blueNoiseTile,
  resolveDitherMatrix,
  BLUE_NOISE_SIZE,
  type DitherKind,
  type DitherMatrix,
} from './dither';
export { generatePalette, generateRamp, type RampRequest, type SatCurve } from './generate';
