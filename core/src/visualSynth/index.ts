/**
 * @volstudio/core/visualSynth
 *
 * Prosedürel raster sentezi — parametrelerle tanımlanan, deterministik, tek
 * bir PNG sprite üreten genel amaçlı bir sistem.
 *
 * Doktrin ve sözleşme: `core/docs/visual-synthesis.md`.
 *
 * **DOM tanımaz (D8).** PNG yazma ve dosya sistemi ayrı alt-yolda:
 * `@volstudio/core/visualSynth/encode`.
 */

export type * from './types';

export { NODE_SCHEMAS, FIELD_KINDS, resolveFieldDomain } from './schema';
export type { NodeSchema, ParamSchema, ParamType, ParamConstraint, OutputRule } from './schema';

export {
  validateSpriteDoc,
  collectSpriteDocIssues,
  validateField,
  collectFieldIssues,
  MIN_SIZE,
  MAX_SIZE,
  MAX_FIELD_DEPTH,
  MAX_STACK_DEPTH,
} from './validate';

export { createUnitSpace, type UnitSpace } from './field/space';
export { FieldBufferPool, type FieldBuffer } from './field/buffer';
export { createLattice, type Lattice } from './field/lattice';
export {
  compileField,
  applyDomainChain,
  createCompileContext,
  releaseCompiled,
  evaluateInto,
  deriveNodeSeed,
  type CompileContext,
} from './field/evaluate';
export type { FieldFn } from './field/fn';
export { toCoverageFn } from './field/coverage';
export { blendCoverage, blendHeight } from './field/blend';
export { createBufferSampler, type SampleMode, type EdgeMode } from './field/sample';
export { signedDistanceField } from './field/distance';

export {
  rgbToOklab,
  oklabToRgb,
  oklabDistance,
  srgbToLinear,
  linearToSrgb,
  type Oklab,
} from './color/oklab';
export {
  resolvePalette,
  parseHexColor,
  packRgb,
  isPaletteColor,
  type ResolvablePalette,
  type ResolvedPalette,
} from './color/palette';
export {
  quantizeToRgba,
  buildShadeTables,
  nearestPaletteIndex,
  type QuantizeMode,
  type ShadeTables,
} from './color/quantize';
export { generateRamp, generatePalette, type RampRequest, type SatCurve } from './color/generate';
export {
  bayerMatrix,
  blueNoiseTile,
  resolveDitherMatrix,
  applyDither,
  BLUE_NOISE_SIZE,
  type DitherKind,
  type DitherMatrix,
} from './color/dither';

export { computeNormals, type NormalChannel } from './shade/normal';
export { computeShade, type LightingOptions } from './shade/lighting';
export { computeAo } from './shade/ao';
export { computeOutline, type OutlineMode } from './shade/outline';

export {
  PRESET_CATEGORIES,
  VISUAL_PRESET_CATALOG,
  isPresetCategory,
  findVisualPresets,
  createVisualPreset,
  type PresetCategory,
  type VisualPresetId,
  type VisualPresetMetadata,
  type FindVisualPresetsQuery,
  type CreateVisualPresetOptions,
} from './catalog';

export { renderSprite, resolvePaletteSpec } from './render';
export type { RenderOptions, RenderResult, RenderChannels } from './render';

export { measureSprite, formatQaReport, type QaMetric, type QaReport } from './qa';
