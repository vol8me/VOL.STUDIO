import { AudioParamError } from '../guard/errors';
import {
  checkArray,
  checkChoice,
  checkNumber,
  checkObject,
  checkSampleRate,
  joinPath,
  readChoice,
  readNumber,
  type NumberRule,
  type ParamObject,
} from '../guard/read';
import { PROGRAM_REGISTRY } from './catalog';
import type { GesturePoint } from './curves';
import type { NumberParamSpec, ParamSpec } from './params';
import type { CurveEntry, EffectEntry, ProcessorEntry, SourceEntry } from './registry';

export const ACOUSTIC_PROGRAM_SCHEMA = 'AcousticProgramV1';

/** Programın yapısal sınırları; kaynak bütçesi bunların ÜSTÜNE ayrıca uygulanır. */
export const PROGRAM_LIMITS = {
  layers: 32,
  resonators: 8,
  effects: 8,
  gestures: 64,
  gesturePoints: 512,
  maxDurationSeconds: 600,
  descriptionLength: 2000,
} as const;

export interface GestureBindingV1 {
  readonly gesture: string;
}
export type ParamValueV1 = number | string | GestureBindingV1;

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
 * makine-okunur kaynağı değildir.
 */
export interface AcousticProgramV1 {
  readonly schema: typeof ACOUSTIC_PROGRAM_SCHEMA;
  readonly description?: string;
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly durationSeconds: number;
  readonly seed: number;
  readonly gestures?: Readonly<Record<string, GestureV1>>;
  readonly layers: readonly ProgramLayerV1[];
  readonly effects?: readonly ProgramNodeV1[];
  readonly master?: ProgramMasterV1;
}

export interface ResolvedGesture {
  readonly name: string;
  readonly curve: CurveEntry;
  readonly points: readonly GesturePoint[];
}

export type ResolvedValue = number | string | ResolvedGesture;

export interface ResolvedNode<E> {
  readonly entry: E;
  /** Alt akış etiketinin kökü: katman ADIYLA kurulur, sırayla değil. */
  readonly streamPath: string;
  readonly params: Readonly<Record<string, ResolvedValue>>;
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

export interface ResolvedProgram {
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly durationSeconds: number;
  /** `ceil(süre · oran)` — mix tamponunun uzunluğu. */
  readonly frames: number;
  readonly seed: number;
  readonly layers: readonly ResolvedLayer[];
  readonly effects: readonly ResolvedNode<EffectEntry>[];
  readonly master: ResolvedMaster;
}

const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
const SEED_RULE: NumberRule = { min: 0, max: 0xffff_ffff, integer: true };

function checkName(value: unknown, path: string): string {
  if (typeof value !== 'string' || !NAME.test(value)) {
    throw new AudioParamError(path, 'type', `ad ${NAME.source} kalıbına uymalı`, value);
  }
  return value;
}

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

interface ResolveScope {
  readonly sampleRate: number;
  readonly durationSeconds: number;
  readonly gestures: ReadonlyMap<string, ResolvedGesture>;
  readonly used: Set<string>;
}

function numberRule(spec: NumberParamSpec): NumberRule {
  return { min: spec.min, max: spec.max, integer: spec.integer };
}

function checkNyquist(value: number, spec: NumberParamSpec, path: string, scope: ResolveScope) {
  if (spec.belowNyquist && !(value < scope.sampleRate / 2)) {
    throw new AudioParamError(
      path,
      'range',
      `örnek oranının yarısından (${scope.sampleRate / 2} Hz) küçük olmalı`,
      value,
    );
  }
}

function resolveNumber(
  value: unknown,
  spec: NumberParamSpec,
  path: string,
  scope: ResolveScope,
): number | ResolvedGesture {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const binding = checkObject(value, path, ['gesture']);
    if (!spec.automatable) {
      throw new AudioParamError(path, 'combination', 'bu parametre otomasyon almaz', value);
    }
    const name = checkName(binding.gesture, `${path}.gesture`);
    const gesture = scope.gestures.get(name);
    if (!gesture) throw new AudioParamError(`${path}.gesture`, 'unknown-id', 'tanımsız', name);
    gesture.points.forEach(([, v], i) => {
      const pointPath = `gestures.${name}.points[${i}][1]→${path}`;
      checkNumber(v, pointPath, numberRule(spec));
      checkNyquist(v, spec, pointPath, scope);
    });
    scope.used.add(name);
    return gesture;
  }
  const number = checkNumber(value, path, numberRule(spec));
  checkNyquist(number, spec, path, scope);
  return number;
}

function resolveParam(value: unknown, spec: ParamSpec, path: string, scope: ResolveScope) {
  if (spec.type === 'choice')
    return value === undefined ? spec.default : checkChoice(value, path, spec.choices);
  return resolveNumber(value === undefined ? spec.default : value, spec, path, scope);
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
  const paramsPath = `${path}.params`;
  const raw: ParamObject =
    node.params === undefined
      ? {}
      : checkObject(node.params, paramsPath, Object.keys(entry.params));
  const params: Record<string, ResolvedValue> = {};
  for (const [key, spec] of Object.entries(entry.params)) {
    params[key] = resolveParam(raw[key], spec, joinPath(paramsPath, key), scope);
  }
  return { entry: entry as E, streamPath, params };
}

function resolveGestures(value: unknown, durationLimit: number): Map<string, ResolvedGesture> {
  const out = new Map<string, ResolvedGesture>();
  if (value === undefined) return out;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AudioParamError('gestures', 'type', 'ad → gesture nesnesi olmalı', value);
  }
  const record = value as ParamObject;
  const names = Object.keys(record);
  if (names.length > PROGRAM_LIMITS.gestures) {
    throw new AudioParamError(
      'gestures',
      'range',
      `en çok ${PROGRAM_LIMITS.gestures} gesture`,
      names.length,
    );
  }
  for (const name of names.sort()) {
    const path = `gestures.${checkName(name, `gestures.${name}`)}`;
    const spec = checkObject(record[name], path, ['curve', 'version', 'points']);
    const curve = PROGRAM_REGISTRY.resolve(spec.curve, spec.version, ['curve'], `${path}.curve`);
    const rawPoints = checkArray(spec.points, `${path}.points`);
    if (rawPoints.length < 1 || rawPoints.length > PROGRAM_LIMITS.gesturePoints) {
      throw new AudioParamError(
        `${path}.points`,
        'range',
        `1…${PROGRAM_LIMITS.gesturePoints} nokta olmalı`,
        rawPoints.length,
      );
    }
    let previous = 0;
    const points = rawPoints.map((raw, i): GesturePoint => {
      const pointPath = `${path}.points[${i}]`;
      const pair = checkArray(raw, pointPath);
      if (pair.length !== 2)
        throw new AudioParamError(pointPath, 'type', '[saniye, değer] olmalı', raw);
      const t = checkNumber(pair[0], `${pointPath}[0]`, { min: previous, max: durationLimit });
      previous = t;
      return [t, checkNumber(pair[1], `${pointPath}[1]`)];
    });
    for (let i = 1; i < points.length; i++) {
      if (points[i][0] === points[i - 1][0]) continue;
      const issue = curve.segmentIssue(points[i - 1][1], points[i][1]);
      if (issue)
        throw new AudioParamError(`${path}.points[${i}]`, 'combination', issue, points[i][1]);
    }
    out.set(name, { name, curve, points });
  }
  return out;
}

function resolveLayer(value: unknown, index: number, program: ProgramContext, scope: ResolveScope) {
  const path = `layers[${index}]`;
  const o = checkObject(value, path, [
    'name',
    'source',
    'resonators',
    'routing',
    'articulation',
    'gainDb',
    'pan',
    'startSeconds',
    'durationSeconds',
  ]);
  const name = checkName(o.name, `${path}.name`);
  const stream = `layer:${name}`;
  const source = resolveNode<SourceEntry>(
    o.source,
    `${path}.source`,
    ['source', 'exciter'],
    `${stream}/source`,
    scope,
  );
  const rawResonators =
    o.resonators === undefined ? [] : checkArray(o.resonators, `${path}.resonators`);
  if (rawResonators.length > PROGRAM_LIMITS.resonators) {
    throw new AudioParamError(
      `${path}.resonators`,
      'range',
      `en çok ${PROGRAM_LIMITS.resonators}`,
      rawResonators.length,
    );
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
    throw new AudioParamError(
      `${path}.startSeconds`,
      'range',
      'program süresinden küçük olmalı',
      start,
    );
  }
  const length = readNumber(
    o,
    'durationSeconds',
    path,
    { above: 0, max: program.duration - start },
    program.duration - start,
  );
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

interface ProgramContext {
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly duration: number;
  readonly frames: number;
}

function resolveMaster(value: unknown, duration: number): ResolvedMaster {
  const o =
    value === undefined
      ? {}
      : checkObject(value, 'master', [
          'normalize',
          'peakDbfs',
          'gainDb',
          'fadeInSeconds',
          'fadeOutSeconds',
          'dcBlockHz',
        ]);
  const normalize = readChoice(o, 'normalize', 'master', ['peak', 'none'] as const, 'peak');
  if (normalize === 'peak' && o.gainDb !== undefined) {
    throw new AudioParamError(
      'master.gainDb',
      'combination',
      "yalnız normalize: 'none' ile",
      o.gainDb,
    );
  }
  if (normalize === 'none' && o.peakDbfs !== undefined) {
    throw new AudioParamError(
      'master.peakDbfs',
      'combination',
      "yalnız normalize: 'peak' ile",
      o.peakDbfs,
    );
  }
  const fadeInSeconds = readNumber(o, 'fadeInSeconds', 'master', { min: 0, max: 5 }, 0);
  const fadeOutSeconds = readNumber(o, 'fadeOutSeconds', 'master', { min: 0, max: 10 }, 0.005);
  if (fadeInSeconds + fadeOutSeconds > duration) {
    throw new AudioParamError(
      'master',
      'combination',
      'kenar sönümleri program süresini aşıyor',
      fadeInSeconds + fadeOutSeconds,
    );
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

/** Programı doğrular ve çözer; DSP tamponu AYRILMAZ. */
export function resolveProgram(value: unknown): ResolvedProgram {
  const o = checkObject(value, '', [
    'schema',
    'description',
    'sampleRate',
    'channels',
    'durationSeconds',
    'seed',
    'gestures',
    'layers',
    'effects',
    'master',
  ]);
  checkSchema(o.schema);
  if (
    o.description !== undefined &&
    (typeof o.description !== 'string' || o.description.length > PROGRAM_LIMITS.descriptionLength)
  ) {
    throw new AudioParamError(
      'description',
      'type',
      `en çok ${PROGRAM_LIMITS.descriptionLength} karakterlik metin`,
      o.description,
    );
  }
  const sampleRate = checkSampleRate(o.sampleRate, 'sampleRate');
  const channels = o.channels;
  if (channels !== 1 && channels !== 2)
    throw new AudioParamError('channels', 'type', '1 ya da 2 olmalı', channels);
  const duration = checkNumber(o.durationSeconds, 'durationSeconds', {
    above: 0,
    max: PROGRAM_LIMITS.maxDurationSeconds,
  });
  const seed = checkNumber(o.seed, 'seed', SEED_RULE);
  const program: ProgramContext = {
    sampleRate,
    channels,
    duration,
    frames: Math.max(1, Math.ceil(duration * sampleRate)),
  };
  const scope: ResolveScope = {
    sampleRate,
    durationSeconds: duration,
    gestures: resolveGestures(o.gestures, PROGRAM_LIMITS.maxDurationSeconds),
    used: new Set(),
  };
  const rawLayers = checkArray(o.layers, 'layers');
  if (rawLayers.length < 1 || rawLayers.length > PROGRAM_LIMITS.layers) {
    throw new AudioParamError(
      'layers',
      'range',
      `1…${PROGRAM_LIMITS.layers} katman olmalı`,
      rawLayers.length,
    );
  }
  const layers = rawLayers.map((layer, i) => resolveLayer(layer, i, program, scope));
  const names = new Set<string>();
  layers.forEach((layer, i) => {
    if (names.has(layer.name))
      throw new AudioParamError(
        `layers[${i}].name`,
        'combination',
        'katman adı tekil olmalı',
        layer.name,
      );
    names.add(layer.name);
  });
  const rawEffects = o.effects === undefined ? [] : checkArray(o.effects, 'effects');
  if (rawEffects.length > PROGRAM_LIMITS.effects) {
    throw new AudioParamError(
      'effects',
      'range',
      `en çok ${PROGRAM_LIMITS.effects}`,
      rawEffects.length,
    );
  }
  const effects = rawEffects.map((node, i) =>
    resolveNode<EffectEntry>(node, `effects[${i}]`, ['effect'], `effect:${i}`, scope),
  );
  for (const name of scope.gestures.keys()) {
    if (!scope.used.has(name))
      throw new AudioParamError(
        `gestures.${name}`,
        'combination',
        'hiçbir parametreye bağlı değil',
        name,
      );
  }
  return {
    sampleRate,
    channels,
    durationSeconds: duration,
    frames: program.frames,
    seed,
    layers,
    effects,
    master: resolveMaster(o.master, duration),
  };
}
