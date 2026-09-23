import { AudioParamError } from '../guard/errors';
import {
  checkArray,
  checkChoice,
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
import { mechanismById } from './ontology';
import type { ModulatorEntry, ProcessorEntry, SourceCheckContext, SourceEntry } from './registry';
import { LAYER_ROLES, type LayerRole } from './roles';
import { resolveBanks, type ResolvedZone, type SampleBankV1 } from './sampleBank';
import { resolveSampleDecls, type SampleDeclV1 } from './samples';
import {
  busNames,
  MASTER_BUS,
  resolveBuses,
  resolveEffectChain,
  resolveSends,
  ROUTING_LIMITS,
  type BusV1,
  type EffectNodeV1,
  type GraphNames,
  type ResolvedBus,
  type ResolvedEffect,
  type ResolvedSend,
  type SendV1,
} from './routing';
import {
  resolveStyle,
  roleGainDb,
  stylePitchFactors,
  type ResolvedStyle,
  type StyleRefV1,
} from './style';

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
  /** Zamana yayılmayan işleme (EQ, dinamik, doygunluk) — artikülasyondan sonra. */
  readonly inserts?: readonly ProgramNodeV1[];
  readonly gainDb?: number;
  readonly pan?: number;
  readonly startSeconds?: number;
  readonly durationSeconds?: number;
  /** SoundGraph rolü (`transient → body → detail → tail → space` …); ses üretmez. */
  readonly role?: LayerRole;
  /** Ontoloji mekanizması (`impact`, `airflow` …); planlayıcının gerekçesi. */
  readonly mechanism?: string;
  readonly rationale?: string;
  /** Katmanın aktığı grup bus'ı; verilmezse master. */
  readonly bus?: string;
  /** Post-fader send'ler (return bus'larına). */
  readonly sends?: readonly SendV1[];
}

export interface MasterLimiterV1 {
  /** Teslim güvenliği tavanı (dBTP) — dinamik efekt `effect.limiter`dan ayrıdır. */
  readonly ceilingDbtp: number;
  readonly lookaheadSeconds?: number;
  readonly releaseSeconds?: number;
}

export interface ProgramMasterV1 {
  readonly normalize?: 'peak' | 'none';
  readonly peakDbfs?: number;
  readonly gainDb?: number;
  readonly fadeInSeconds?: number;
  readonly fadeOutSeconds?: number;
  readonly dcBlockHz?: number;
  readonly limiter?: MasterLimiterV1;
  /**
   * Dikişsiz loop: son X saniye başa güç tamamlayıcı geçişle katlanır; çıktı
   * süresi `durationSeconds − X`, kenar sönümü yoktur (tur sınırında boşluk
   * olmaz). Loop dokuları `loop-seam-v1` QA'sından geçer.
   */
  readonly loop?: { readonly crossfadeSeconds: number };
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
  /** Kayıtlı ses verisi bildirimleri (ad → kütüphane kimliği + içerik özeti). */
  readonly samples?: Readonly<Record<string, SampleDeclV1>>;
  /** Sampler bankaları (bölge haritaları; bölgeler `samples` adlarına başvurur). */
  readonly banks?: Readonly<Record<string, SampleBankV1>>;
  readonly layers: readonly ProgramLayerV1[];
  readonly buses?: Readonly<Record<string, BusV1>>;
  readonly effects?: readonly EffectNodeV1[];
  readonly style?: StyleRefV1;
  readonly master?: ProgramMasterV1;
}

export interface ResolvedLayer {
  readonly name: string;
  readonly source: ResolvedNode<SourceEntry>;
  readonly resonators: readonly ResolvedNode<ProcessorEntry>[];
  readonly routing: 'series' | 'parallel';
  readonly articulation: ResolvedNode<ProcessorEntry> | null;
  readonly inserts: readonly ResolvedEffect[];
  readonly role: LayerRole | null;
  readonly mechanism: string | null;
  readonly rationale: string | null;
  readonly bus: string;
  readonly sends: readonly ResolvedSend[];
  /** Katman kanal sayısı: stereo programda stereo yazabilen kaynak 2, aksi 1. */
  readonly channels: 1 | 2;
  /** Yazılan `gainDb` (+ stilin rol dengesi) doğrusal çarpan olarak. */
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
  readonly limiter: {
    readonly ceilingDbtp: number;
    readonly lookaheadSeconds: number;
    readonly releaseSeconds: number;
  } | null;
  readonly loop: { readonly crossfadeSeconds: number } | null;
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
  /** İşlem sırasında (topolojik) grup/return bus'ları; boşsa bütün katmanlar master'a akar. */
  readonly buses: readonly ResolvedBus[];
  readonly effects: readonly ResolvedEffect[];
  readonly style: ResolvedStyle | null;
  readonly samples: ReadonlyMap<string, SampleDeclV1>;
  readonly banks: ReadonlyMap<string, readonly ResolvedZone[]>;
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

type NodeKind = 'source' | 'exciter' | 'resonator' | 'articulation';
type NodeEntry = SourceEntry | ProcessorEntry;

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
  readonly names: GraphNames;
  readonly style: ResolvedStyle | null;
  readonly check: SourceCheckContext;
}

const LAYER_KEYS = [
  'name',
  'source',
  'resonators',
  'routing',
  'articulation',
  'inserts',
  'gainDb',
  'pan',
  'startSeconds',
  'durationSeconds',
  'role',
  'mechanism',
  'rationale',
  'bus',
  'sends',
];

function layerMeta(o: Record<string, unknown>, path: string) {
  const role = o.role === undefined ? null : checkChoice(o.role, `${path}.role`, LAYER_ROLES);
  let mechanism: string | null = null;
  if (o.mechanism !== undefined) {
    if (typeof o.mechanism !== 'string' || !mechanismById(o.mechanism)) {
      throw new AudioParamError(`${path}.mechanism`, 'unknown-id', 'ontolojide yok', o.mechanism);
    }
    mechanism = o.mechanism;
  }
  if (
    o.rationale !== undefined &&
    (typeof o.rationale !== 'string' || o.rationale.length === 0 || o.rationale.length > 400)
  ) {
    throw new AudioParamError(
      `${path}.rationale`,
      'type',
      'en çok 400 karakter metin',
      o.rationale,
    );
  }
  return { role, mechanism, rationale: o.rationale ?? null };
}

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
  const styled: ResolveScope = { ...scope, extraFactors: stylePitchFactors(program.style) };
  const source = resolveNode<SourceEntry>(
    o.source,
    `${path}.source`,
    kinds,
    `${stream}/source`,
    styled,
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
      styled,
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
  const issue = source.entry.check?.(source.params, program.check) ?? null;
  if (issue) throw new AudioParamError(`${path}.source`, 'combination', issue, source.entry.id);
  const stereo =
    program.channels === 2 &&
    source.entry.renderStereo !== undefined &&
    (source.entry.stereoFor?.(source.params, program.check) ?? true);
  if (stereo && o.pan !== undefined) {
    const detail = 'stereo kaynaklı katman pan almaz (yerleşim kaynağın kendisindedir)';
    throw new AudioParamError(`${path}.pan`, 'combination', detail, o.pan);
  }
  const start = readNumber(o, 'startSeconds', path, { min: 0, max: program.duration }, 0);
  if (!(start < program.duration)) {
    const detail = 'program süresinden küçük olmalı';
    throw new AudioParamError(`${path}.startSeconds`, 'range', detail, start);
  }
  const rest = program.duration - start;
  const length = readNumber(o, 'durationSeconds', path, { above: 0, max: rest }, rest);
  const startFrame = Math.floor(start * program.sampleRate);
  const meta = layerMeta(o, path);
  const bus = o.bus === undefined ? MASTER_BUS : checkName(o.bus, `${path}.bus`);
  if (bus !== MASTER_BUS && !program.names.buses.has(bus)) {
    throw new AudioParamError(`${path}.bus`, 'unknown-id', 'tanımlı bus ya da master', bus);
  }
  const gainDb =
    readNumber(o, 'gainDb', path, { min: -120, max: 24 }, 0) + roleGainDb(program.style, meta.role);
  return {
    name,
    source,
    resonators,
    routing: readChoice(o, 'routing', path, ['series', 'parallel'] as const, 'series'),
    articulation,
    inserts: resolveEffectChain(o.inserts, `${path}.inserts`, scope, program.names, {
      streamPrefix: `${stream}/insert:`,
      allowTimeBased: false,
      allowSidechain: false,
      limit: ROUTING_LIMITS.inserts,
    }),
    ...meta,
    bus,
    channels: stereo ? 2 : 1,
    sends: resolveSends(
      o.sends,
      `${path}.sends`,
      program.names,
      null,
      program.style?.controls.spaceDb ?? 0,
    ),
    gain: Math.pow(10, gainDb / 20),
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
  'limiter',
  'loop',
];

function resolveMasterLoop(value: unknown, duration: number): ResolvedMaster['loop'] {
  if (value === undefined) return null;
  const o = checkObject(value, 'master.loop', ['crossfadeSeconds']);
  const max = Math.min(5, duration / 2);
  const crossfadeSeconds = checkNumber(o.crossfadeSeconds, 'master.loop.crossfadeSeconds', {
    min: 0.005,
    max,
  });
  return { crossfadeSeconds };
}

function resolveMasterLimiter(value: unknown): ResolvedMaster['limiter'] {
  if (value === undefined) return null;
  const path = 'master.limiter';
  const o = checkObject(value, path, ['ceilingDbtp', 'lookaheadSeconds', 'releaseSeconds']);
  if (o.ceilingDbtp === undefined) {
    throw new AudioParamError(`${path}.ceilingDbtp`, 'required', 'tavan zorunlu', undefined);
  }
  return {
    ceilingDbtp: checkNumber(o.ceilingDbtp, `${path}.ceilingDbtp`, { min: -24, max: 0 }),
    lookaheadSeconds: readNumber(o, 'lookaheadSeconds', path, { min: 0.0005, max: 0.02 }, 0.005),
    releaseSeconds: readNumber(o, 'releaseSeconds', path, { min: 0.005, max: 2 }, 0.08),
  };
}

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
  const loop = resolveMasterLoop(o.loop, duration);
  if (loop && ((o.fadeInSeconds ?? 0) !== 0 || (o.fadeOutSeconds ?? 0) !== 0)) {
    const detail = 'loop programında kenar sönümü olmaz (tur sınırında boşluk bırakır)';
    throw new AudioParamError(
      'master.loop',
      'combination',
      detail,
      o.fadeOutSeconds ?? o.fadeInSeconds,
    );
  }
  const fadeInSeconds = readNumber(o, 'fadeInSeconds', 'master', { min: 0, max: 5 }, 0);
  const fadeOutSeconds = readNumber(
    o,
    'fadeOutSeconds',
    'master',
    { min: 0, max: 10 },
    loop ? 0 : 0.005,
  );
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
    limiter: resolveMasterLimiter(o.limiter),
    loop,
  };
}

/** Programın ÇIKTI süresi (loop katlamasında `durationSeconds − crossfade`). */
export function outputSeconds(program: ResolvedProgram): number {
  const fold = program.master.loop
    ? Math.round(program.master.loop.crossfadeSeconds * program.sampleRate)
    : 0;
  return (program.frames - fold) / program.sampleRate;
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
  'samples',
  'banks',
  'layers',
  'buses',
  'effects',
  'style',
  'master',
];

/** Katman adlarını çözümden ÖNCE toplar (sidechain ve send hedefleri için). */
function layerNames(raw: readonly unknown[]): Set<string> {
  const names = new Set<string>();
  for (const layer of raw) {
    const name = (layer as { name?: unknown } | null)?.name;
    if (typeof name === 'string') names.add(name);
  }
  return names;
}

function checkDescription(value: unknown): void {
  const limit = PROGRAM_LIMITS.descriptionLength;
  if (value !== undefined && (typeof value !== 'string' || value.length > limit)) {
    throw new AudioParamError('description', 'type', `en çok ${limit} karakterlik metin`, value);
  }
}

/** Kullanılmayan gesture/modülatör/sample/banka ve etkisiz makro bir yazım hatasıdır; sessizce yok sayılmaz. */
function checkUsage(scope: ResolveScope): void {
  for (const name of scope.banks?.keys() ?? []) {
    if (!scope.used.banks?.has(name)) {
      const detail = 'hiçbir sampler bu bankaya başvurmuyor';
      throw new AudioParamError(`banks.${name}`, 'combination', detail, name);
    }
  }
  for (const name of scope.samples?.keys() ?? []) {
    if (!scope.used.samples?.has(name)) {
      const detail = 'hiçbir parametre bu sample’a başvurmuyor';
      throw new AudioParamError(`samples.${name}`, 'combination', detail, name);
    }
  }
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
  const rawLayers = checkArray(o.layers, 'layers');
  const names: GraphNames = { layers: layerNames(rawLayers), buses: busNames(o.buses) };
  const style = resolveStyle(o.style, channels);
  const program: Omit<ProgramContext, 'check'> = {
    sampleRate,
    channels,
    duration,
    frames,
    names,
    style,
  };
  const samples = resolveSampleDecls(o.samples);
  const usedSamples = new Set<string>();
  const banks = resolveBanks(o.banks, samples, usedSamples);
  const base = {
    sampleRate,
    gestures: resolveGestures(o.gestures, PROGRAM_LIMITS.maxDurationSeconds),
    modulators: modulatorNames(o.modulators),
    samples,
    banks,
    used: {
      gestures: new Set<string>(),
      modulators: new Set<string>(),
      controls: new Set<string>(),
      samples: usedSamples,
      banks: new Set<string>(),
    },
  };
  const scope: ResolveScope = { ...base, controls: resolveControls(o.controls, base) };
  const modulators = resolveModulators(o.modulators, scope);
  if (rawLayers.length < 1 || rawLayers.length > PROGRAM_LIMITS.layers) {
    const detail = `1…${PROGRAM_LIMITS.layers} katman olmalı`;
    throw new AudioParamError('layers', 'range', detail, rawLayers.length);
  }
  const context: ProgramContext = { ...program, check: { channels, samples, banks } };
  const layers = rawLayers.map((layer, i) => resolveLayer(layer, i, context, scope));
  const seen = new Set<string>();
  layers.forEach((layer, i) => {
    if (seen.has(layer.name)) {
      const detail = 'katman adı tekil olmalı';
      throw new AudioParamError(`layers[${i}].name`, 'combination', detail, layer.name);
    }
    seen.add(layer.name);
  });
  const effects = resolveEffectChain(o.effects, 'effects', scope, names, {
    streamPrefix: 'effect:',
    allowTimeBased: true,
    allowSidechain: true,
    limit: PROGRAM_LIMITS.effects,
  });
  const buses = resolveBuses(o.buses, scope, names, layers, style?.controls.spaceDb ?? 0);
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
    buses,
    effects,
    style,
    samples,
    banks,
    master: resolveMaster(o.master, duration),
  };
}
