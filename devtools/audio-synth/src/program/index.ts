/**
 * Kanonik program katmanı: `AudioBriefV1`, `AcousticProgramV1`, registry ve
 * program render'ı. Kök yüzeye tek ad (`Acoustic`) altında girer; saf
 * DSP'dir (dosya sistemi, süreç, kripto yok). Protokol/publish katmanı
 * `@volstudio/audio-synth/protocol` alt yolundadır.
 */
export { AUDIO_BRIEF_SCHEMA, validateBrief } from './brief';
export type {
  AcousticBriefV1,
  AcousticSubtype,
  AudioBriefKind,
  AudioBriefV1,
  BriefProvenanceV1,
} from './brief';
export { PROGRAM_REGISTRY } from './catalog';
export { CURVES, renderGesture } from './curves';
export type { GesturePoint } from './curves';
export { describeEntry, describeRegistry } from './describe';
export type { RegistryEntryDescription } from './describe';
export { KNOWN_LIMITATIONS } from './limitations';
export type { KnownLimitation } from './limitations';
export type {
  AcousticDimension,
  CausalEffect,
  ChoiceParamSpec,
  NumberParamSpec,
  ParamSignal,
  ParamSpec,
  ParamUnit,
  ResolvedParams,
} from './params';
export { deriveSeed, substream, SUBSTREAM_SCHEME } from './random';
export type { ControlTarget, NodeContext, ProgramEntry, RegistryKind } from './registry';
export {
  estimateProgramCost,
  PROGRAM_RENDERER_VERSION,
  renderProgram,
  renderProgramLayers,
} from './render';
export type { ProgramRender, ProgramRenderOptions } from './render';
export { ACOUSTIC_PROGRAM_SCHEMA, PROGRAM_LIMITS, resolveProgram } from './schema';
export type {
  AcousticProgramV1,
  ControlV1,
  GestureV1,
  ModulationV1,
  ModulatorV1,
  ParamValueV1,
  SignalBindingV1,
  ProgramLayerV1,
  ProgramMasterV1,
  ProgramNodeV1,
  ResolvedProgram,
} from './schema';
