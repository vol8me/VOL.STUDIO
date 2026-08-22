/**
 * @volstudio/core/visual
 *
 * Prosedürel raster sentezi — parametrelerle tanımlanan, deterministik, tek
 * bir PNG sprite üreten genel amaçlı bir sistem.
 *
 * Doktrin ve sözleşme: `core/docs/visual-synthesis.md`.
 *
 * **DOM tanımaz (D8).** PNG yazma ve dosya sistemi ayrı alt-yolda:
 * `@volstudio/core/visual/encode`.
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
  type ResolvedPalette,
} from './color/palette';
export { quantizeToRgba } from './color/quantize';

export { renderSprite } from './render';
export type { RenderOptions, RenderResult, RenderChannels } from './render';

export { measureSprite, formatQaReport, type QaMetric, type QaReport } from './qa';
