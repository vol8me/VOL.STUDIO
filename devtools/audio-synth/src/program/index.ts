/**
 * Kanonik program katmanı: `AudioBriefV1`, `AcousticProgramV1`, registry ve
 * program render'ı. Kök yüzeye tek ad (`Acoustic`) altında girer; saf
 * DSP'dir (dosya sistemi, süreç, kripto yok). Protokol/publish katmanı
 * `@volstudio/audio-synth/protocol` alt yolundadır.
 */
export { ARCHETYPE_REQUEST_SCHEMA, expandArchetype } from './archetype';
export type { ArchetypeRequestV1 } from './archetype';
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
export type {
  ArchetypeEntry,
  ArchetypeLayer,
  ControlTarget,
  NodeContext,
  ProgramEntry,
  RegistryKind,
} from './registry';
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
export { graphOf, SOUND_GRAPH_SCHEMA, soundGraph, topologyOf } from './soundGraph';
export type { SoundGraphEdgeV1, SoundGraphNodeV1, SoundGraphV1 } from './soundGraph';
export { planBrief, PROGRAM_PLAN_SCHEMA, tokenize } from './planner';
export type { PlannedLayerV1, PlannedMechanismV1, ProgramPlanV1 } from './planner';
export { capabilityMatrix, MECHANISMS, mechanismById, ONTOLOGY_VERSION } from './ontology';
export type { MechanismV1 } from './ontology';
export { describeMaterials, MATERIALS, materialById } from './materials';
export type { MaterialProfileV1 } from './materials';
export { NEUTRAL_STYLE, STYLE_PROFILES } from './styles';
export type { StyleControlsV1, StyleProfileV1 } from './styles';
export type { StyleRefV1 } from './style';
export { LAYER_ROLES } from './roles';
export type { LayerRole } from './roles';
export { MASTER_BUS, ROUTING_LIMITS } from './routing';
export type { BusV1, EffectNodeV1, SendV1 } from './routing';
export { SAMPLE_BANK_SCHEMA, selectZone } from './sampleBank';
export type { SampleBankV1, SampleZoneV1 } from './sampleBank';
export type { SampleData, SampleDeclV1, SampleResolver } from './samples';
export { outputSeconds } from './schema';
