import { AudioParamError } from '../guard/errors';
import {
  checkArray,
  checkNumber,
  checkObject,
  checkSampleRate,
  readChoice,
  readNumber,
} from '../guard/read';
import {
  checkName,
  LIMITS,
  modulatorNames,
  resolveControls,
  resolveGestures,
  resolveModulators,
  resolveParams,
  type ResolvedGesture,
  type ResolvedNode,
  type ResolveScope,
} from './bindings';
import { PROGRAM_REGISTRY } from './catalog';
import type { GesturePoint } from './curves';
import type { EffectEntry, ModulatorEntry, ProcessorEntry, SourceEntry } from './registry';

export type { ResolvedGesture, ResolvedNode, ResolvedSignal, ResolvedValue } from './bindings';

export const ACOUSTIC_PROGRAM_SCHEMA = 'AcousticProgramV1';

/** Programın yapısal sınırları; kaynak bütçesi bunların ÜSTÜNE ayrıca uygulanır. */
export const PROGRAM_LIMITS = {
  layers: 32,
  resonators: 8,
  effects: 8,
  gestures: LIMITS.gestures,
  gesturePoints: LIMITS.gesturePoints,
  modulators: LIMITS.modulators,
  modulationsPerParam: LIMITS.modulationsPerParam,
  maxDurationSeconds: 600,
  descriptionLength: 2000,
} as const;

export interface ModulationV1 {
  readonly by: string;
  readonly depth: number;
}

export interface SignalBindingV1 {
  readonly gesture?: string;
  readonly value?: number;
  readonly modulate?: readonly ModulationV1[];
}
export type ParamValueV1 = number | string | SignalBindingV1;

export interface ProgramNodeV1 {
  readonly primitive: string;
  readonly version: number;
  readonly params?: Readonly<Record<string, ParamValueV1>>;
}

export interface GestureV1 {
  readonly curve: string;
  readonly version: number;
  readonly points: readonly GesturePoint[];
}

export interface ModulatorV1 {
  readonly modulator: string;
  readonly version: number;
  readonly params?: Readonly<Record<string, number | { readonly gesture: string }>>;
}

export interface ControlV1 {
  readonly control: string;
  readonly version: number;
  readonly value?: number | { readonly gesture: string };
}

export interface ProgramLayerV1 {
  readonly name: string;
  readonly source: ProgramNodeV1;
  readonly resonators?: readonly ProgramNodeV1[];
  readonly routing?: 'series' | 'parallel';
  readonly articulation?: ProgramNodeV1;
  readonly gainDb?: number;
  readonly pan?: number;
  readonly startSeconds?: number;
  readonly durationSeconds?: number;
}

export interface ProgramMasterV1 {
  readonly normalize?: 'peak' | 'none';
  readonly peakDbfs?: number;
  readonly gainDb?: number;
  readonly fadeInSeconds?: number;
  readonly fadeOutSeconds?: number;
  readonly dcBlockHz?: number;
}

/**
 * Non-music ses tasarımının kanonik programı. Her yapı taşı registry
 * kimliği + sürümüyle anılır; bilinmeyen alan, kimlik ya da sürüm render
 * başlamadan `AudioParamError` verir. `description` serbest metindir, sesin
 * makine-okunur kaynağı değildir. Gesture zamanı KATMAN başlangıcına
 * göredir; modülatörler program zaman eksenindedir.
 */
export interface AcousticProgramV1 {
  readonly schema: typeof ACOUSTIC_PROGRAM_SCHEMA;
  readonly description?: string;
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly durationSeconds: number;
  readonly seed: number;
  readonly gestures?: Readonly<Record<string, GestureV1>>;
  readonly modulators?: Readonly<Record<string, ModulatorV1>>;
  readonly controls?: readonly ControlV1[];
  readonly layers: readonly ProgramLayerV1[];
  readonly effects?: readonly ProgramNodeV1[];
  readonly master?: ProgramMasterV1;
}

export interface ResolvedLayer {
  readonly name: string;
  readonly source: ResolvedNode<SourceEntry>;
  readonly resonators: readonly ResolvedNode<ProcessorEntry>[];
  readonly routing: 'series' | 'parallel';
  readonly articulation: ResolvedNode<ProcessorEntry> | null;
  readonly gain: number;
  readonly pan: number | undefined;
  readonly startSeconds: number;
  /** `floor(startSeconds · oran)` — mix veriyolunun yerleştirdiği ilk örnek. */
  readonly startFrame: number;
  readonly frames: number;
}

export interface ResolvedMaster {
  readonly normalize: 'peak' | 'none';
  readonly peakDbfs: number;
  readonly gainDb: number;
  readonly fadeInSeconds: number;
  readonly fadeOutSeconds: number;
  readonly dcBlockHz: number;
}

/** `control.instability` gibi modülasyon derinliğini ölçekleyen makro. */
export interface DepthControl {
  readonly span: number;
  readonly value: number | ResolvedGesture;
}

export interface ResolvedProgram {
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly durationSeconds: number;
  /** `ceil(süre · oran)` — mix tamponunun uzunluğu. */
  readonly frames: number;
  readonly seed: number;
  readonly modulators: readonly ResolvedNode<ModulatorEntry>[];
  readonly depthControl: DepthControl | null;
  readonly layers: readonly ResolvedLayer[];
  readonly effects: readonly ResolvedNode<EffectEntry>[];
  readonly master: ResolvedMaster;
}

const SEED_RULE = { min: 0, max: 0xffff_ffff, integer: true } as const;

function checkSchema(value: unknown): void {
  if (value === ACOUSTIC_PROGRAM_SCHEMA) return;
  if (typeof value === 'string' && /^AcousticProgramV\d+$/.test(value)) {
    throw new AudioParamError(
      'schema',
      'version',
      `bu motor ${ACOUSTIC_PROGRAM_SCHEMA} okur`,
      value,
    );
  }
  throw new AudioParamError('schema', 'type', `"${ACOUSTIC_PROGRAM_SCHEMA}" olmalı`, value);
}

type NodeKind = 'source' | 'exciter' | 'resonator' | 'articulation' | 'effect';
type NodeEntry = SourceEntry | ProcessorEntry | EffectEntry;

/** Tür denetimi `Registry.resolve` içinde çalışır; dönüş tipi çağıranın istediği türe daraltılır. */
function resolveNode<E extends NodeEntry>(
  value: unknown,
  path: string,
  kinds: readonly NodeKind[],
  streamPath: string,
  scope: ResolveScope,
): ResolvedNode<E> {
  const node = checkObject(value, path, ['primitive', 'version', 'params']);
  const entry = PROGRAM_REGISTRY.resolve(node.primitive, node.version, kinds, `${path}.primitive`);
  return {
    entry: entry as E,
    streamPath,
    params: resolveParams(entry, node.params, `${path}.params`, scope),
  };
}

interface ProgramContext {
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly duration: number;
  readonly frames: number;
}

const LAYER_KEYS = [
  'name',
  'source',
  'resonators',
  'routing',
  'articulation',
  'gainDb',
  'pan',
  'startSeconds',
  'durationSeconds',
];

function resolveLayer(
  value: unknown,
  index: number,
  program: ProgramContext,
  scope: ResolveScope,
): ResolvedLayer {
  const path = `layers[${index}]`;
  const o = checkObject(value, path, LAYER_KEYS);
  const name = checkName(o.name, `${path}.name`);
  const stream = `layer:${name}`;
  const kinds = ['source', 'exciter'] as const;
  const source = resolveNode<SourceEntry>(
    o.source,
    `${path}.source`,
    kinds,
    `${stream}/source`,
    scope,
  );
  const rawResonators =
    o.resonators === undefined ? [] : checkArray(o.resonators, `${path}.resonators`);
  if (rawResonators.length > PROGRAM_LIMITS.resonators) {
    const detail = `en çok ${PROGRAM_LIMITS.resonators}`;
    throw new AudioParamError(`${path}.resonators`, 'range', detail, rawResonators.length);
  }
  const resonators = rawResonators.map((node, i) =>
    resolveNode<ProcessorEntry>(
      node,
      `${path}.resonators[${i}]`,
      ['resonator'],
      `${stream}/resonator:${i}`,
      scope,
    ),
  );
  const articulation =
    o.articulation === undefined
      ? null
      : resolveNode<ProcessorEntry>(
          o.articulation,
          `${path}.articulation`,
          ['articulation'],
          `${stream}/articulation`,
          scope,
        );
  if (o.pan !== undefined && program.channels === 1) {
    throw new AudioParamError(`${path}.pan`, 'combination', 'mono programda pan olmaz', o.pan);
  }
  const start = readNumber(o, 'startSeconds', path, { min: 0, max: program.duration }, 0);
  if (!(start < program.duration)) {
    const detail = 'program süresinden küçük olmalı';
    throw new AudioParamError(`${path}.startSeconds`, 'range', detail, start);
  }
  const rest = program.duration - start;
  const length = readNumber(o, 'durationSeconds', path, { above: 0, max: rest }, rest);
  const startFrame = Math.floor(start * program.sampleRate);
  return {
    name,
    source,
    resonators,
    routing: readChoice(o, 'routing', path, ['series', 'parallel'] as const, 'series'),
    articulation,
    gain: Math.pow(10, readNumber(o, 'gainDb', path, { min: -120, max: 24 }, 0) / 20),
    pan: o.pan === undefined ? undefined : checkNumber(o.pan, `${path}.pan`, { min: -1, max: 1 }),
    startSeconds: start,
    startFrame,
    frames: Math.max(
      1,
      Math.min(program.frames - startFrame, Math.round(length * program.sampleRate)),
    ),
  };
}

const MASTER_KEYS = [
  'normalize',
  'peakDbfs',
  'gainDb',
  'fadeInSeconds',
  'fadeOutSeconds',
  'dcBlockHz',
];

function resolveMaster(value: unknown, duration: number): ResolvedMaster {
  const o = value === undefined ? {} : checkObject(value, 'master', MASTER_KEYS);
  const normalize = readChoice(o, 'normalize', 'master', ['peak', 'none'] as const, 'peak');
  if (normalize === 'peak' && o.gainDb !== undefined) {
    const detail = "yalnız normalize: 'none' ile";
    throw new AudioParamError('master.gainDb', 'combination', detail, o.gainDb);
  }
  if (normalize === 'none' && o.peakDbfs !== undefined) {
    const detail = "yalnız normalize: 'peak' ile";
    throw new AudioParamError('master.peakDbfs', 'combination', detail, o.peakDbfs);
  }
  const fadeInSeconds = readNumber(o, 'fadeInSeconds', 'master', { min: 0, max: 5 }, 0);
  const fadeOutSeconds = readNumber(o, 'fadeOutSeconds', 'master', { min: 0, max: 10 }, 0.005);
  if (fadeInSeconds + fadeOutSeconds > duration) {
    const detail = 'kenar sönümleri program süresini aşıyor';
    throw new AudioParamError('master', 'combination', detail, fadeInSeconds + fadeOutSeconds);
  }
  return {
    normalize,
    peakDbfs: readNumber(o, 'peakDbfs', 'master', { min: -60, max: 0 }, -3),
    gainDb: readNumber(o, 'gainDb', 'master', { min: -60, max: 24 }, 0),
    fadeInSeconds,
    fadeOutSeconds,
    dcBlockHz: readNumber(o, 'dcBlockHz', 'master', { min: 1, max: 40 }, 10),
  };
}

const TOP_KEYS = [
  'schema',
  'description',
  'sampleRate',
  'channels',
  'durationSeconds',
  'seed',
  'gestures',
  'modulators',
  'controls',
  'layers',
  'effects',
  'master',
];

function checkDescription(value: unknown): void {
  const limit = PROGRAM_LIMITS.descriptionLength;
  if (value !== undefined && (typeof value !== 'string' || value.length > limit)) {
    throw new AudioParamError('description', 'type', `en çok ${limit} karakterlik metin`, value);
  }
}

/** Kullanılmayan gesture/modülatör ve etkisiz makro bir yazım hatasıdır; sessizce yok sayılmaz. */
function checkUsage(scope: ResolveScope): void {
  for (const name of scope.gestures.keys()) {
    if (!scope.used.gestures.has(name)) {
      const detail = 'hiçbir parametreye bağlı değil';
      throw new AudioParamError(`gestures.${name}`, 'combination', detail, name);
    }
  }
  for (const name of scope.modulators) {
    if (!scope.used.modulators.has(name)) {
      const detail = 'hiçbir parametreyi modüle etmiyor';
      throw new AudioParamError(`modulators.${name}`, 'combination', detail, name);
    }
  }
  for (const control of scope.controls) {
    const effective =
      scope.used.controls.has(control.entry.id) ||
      (control.entry.modulationDepth !== undefined && scope.used.modulators.size > 0);
    if (!effective) {
      const detail = 'bu programda hedefi yok (etkisiz makro)';
      throw new AudioParamError(`${control.path}.control`, 'combination', detail, control.entry.id);
    }
  }
}

/** Programı doğrular ve çözer; DSP tamponu AYRILMAZ. */
export function resolveProgram(value: unknown): ResolvedProgram {
  const o = checkObject(value, '', TOP_KEYS);
  checkSchema(o.schema);
  checkDescription(o.description);
  const sampleRate = checkSampleRate(o.sampleRate, 'sampleRate');
  const channels = o.channels;
  if (channels !== 1 && channels !== 2) {
    throw new AudioParamError('channels', 'type', '1 ya da 2 olmalı', channels);
  }
  const duration = checkNumber(o.durationSeconds, 'durationSeconds', {
    above: 0,
    max: PROGRAM_LIMITS.maxDurationSeconds,
  });
  const seed = checkNumber(o.seed, 'seed', SEED_RULE);
  const frames = Math.max(1, Math.ceil(duration * sampleRate));
  const program: ProgramContext = { sampleRate, channels, duration, frames };
  const base = {
    sampleRate,
    gestures: resolveGestures(o.gestures, PROGRAM_LIMITS.maxDurationSeconds),
    modulators: modulatorNames(o.modulators),
    used: {
      gestures: new Set<string>(),
      modulators: new Set<string>(),
      controls: new Set<string>(),
    },
  };
  const scope: ResolveScope = { ...base, controls: resolveControls(o.controls, base) };
  const modulators = resolveModulators(o.modulators, scope);
  const rawLayers = checkArray(o.layers, 'layers');
  if (rawLayers.length < 1 || rawLayers.length > PROGRAM_LIMITS.layers) {
    const detail = `1…${PROGRAM_LIMITS.layers} katman olmalı`;
    throw new AudioParamError('layers', 'range', detail, rawLayers.length);
  }
  const layers = rawLayers.map((layer, i) => resolveLayer(layer, i, program, scope));
  const names = new Set<string>();
  layers.forEach((layer, i) => {
    if (names.has(layer.name)) {
      const detail = 'katman adı tekil olmalı';
      throw new AudioParamError(`layers[${i}].name`, 'combination', detail, layer.name);
    }
    names.add(layer.name);
  });
  const rawEffects = o.effects === undefined ? [] : checkArray(o.effects, 'effects');
  if (rawEffects.length > PROGRAM_LIMITS.effects) {
    const detail = `en çok ${PROGRAM_LIMITS.effects}`;
    throw new AudioParamError('effects', 'range', detail, rawEffects.length);
  }
  const effects = rawEffects.map((node, i) =>
    resolveNode<EffectEntry>(node, `effects[${i}]`, ['effect'], `effect:${i}`, scope),
  );
  checkUsage(scope);
  const depth = scope.controls.find((c) => c.entry.modulationDepth);
  return {
    sampleRate,
    channels,
    durationSeconds: duration,
    frames,
    seed,
    modulators,
    depthControl: depth?.entry.modulationDepth
      ? { span: depth.entry.modulationDepth.span, value: depth.value }
      : null,
    layers,
    effects,
    master: resolveMaster(o.master, duration),
  };
}
