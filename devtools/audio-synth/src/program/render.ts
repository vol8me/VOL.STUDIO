import { masterChannels } from '../engine/master';
import type { RenderCache } from '../engine/renderCache';
import {
  renderSession,
  withRenderSession,
  type RenderQuality,
  type RenderSession,
} from '../engine/session';
import { limitTruePeak } from '../effects/limiter';
import { assertRenderBudget, type RenderBudget, type RenderCost } from '../guard/budget';
import { checkNumber } from '../guard/read';
import { clampToSpec, type ResolvedGesture, type ResolvedSignal } from './bindings';
import { renderGesture } from './curves';
import type { ParamSignal, ResolvedParams } from './params';
import { applyLaw } from './primitives/controls';
import { mixdown } from './mixdown';
import { deriveSeed, substream } from './random';
import type {
  CostParams,
  NodeContext,
  ProcessorEntry,
  ProgramEntry,
  SourceEntry,
} from './registry';
import type { ResolvedZone } from './sampleBank';
import { sampleAccess, type SampleAccess, type SampleResolver } from './samples';
import {
  layerStageKeys,
  layerStages,
  programKeys,
  programRootKey,
  type LayerStage,
  type ProgramKeys,
} from './renderKeys';
import { applyStyleChain } from './style';
import { applyTreatment, treatmentFrames } from './treatment';
import {
  masterFrames,
  resolveProgram,
  type ResolvedLayer,
  type ResolvedNode,
  type ResolvedProgram,
  type ResolvedValue,
} from './schema';

/**
 * Program render sürümü. Aynı program + tohum + bu sürüm + düğüm sürümleri
 * aynı PCM'i verir. Render yolunda çıktıyı değiştiren bir değişiklik bu
 * sayıyı artırır; manifest onu kaydeder.
 */
export const PROGRAM_RENDERER_VERSION = 1;

const FLOAT32_BYTES = 4;
const MASTER_WORK_PER_FRAME = 6;

export interface ProgramRender {
  readonly channels: Float32Array[];
  readonly sampleRate: number;
  readonly duration: number;
  readonly seed: number;
  readonly cost: RenderCost;
}

export interface ProgramRenderOptions {
  /** Programın tohumunu ezer (aday araması); verilmezse `program.seed`. */
  readonly seed?: number;
  readonly budget?: RenderBudget;
  /** Programın `samples` bildirimlerini veriye çeviren çözücü (protokol ya da test). */
  readonly samples?: SampleResolver;
  /** Verilmezse dıştaki render oturumunun kalitesi; o da yoksa `final`. */
  readonly quality?: RenderQuality;
  /** Aşama ve program önbelleği; `null` dıştaki oturumun önbelleğini kapatır. */
  readonly cache?: RenderCache | null;
}

const isSignal = (value: ResolvedValue): value is ResolvedSignal => typeof value === 'object';

/**
 * Sample başvurusu olan düğümde (`<ad>.frames` / `<ad>.channels`) bildirimden
 * program oranına göre boyut eklenir; maliyet veri yüklenmeden hesaplanır.
 */
function sampleSizes(
  node: ResolvedNode<ProgramEntry>,
  key: string,
  value: string,
  program: ResolvedProgram,
): Record<string, number> {
  const spec = node.entry.params[key];
  if (spec?.type !== 'sample') return {};
  const decls =
    spec.of === 'bank'
      ? (program.banks.get(value) ?? []).map((z) => program.samples.get(z.sample))
      : [program.samples.get(value)];
  let frames = 0;
  let channels = 1;
  for (const decl of decls) {
    if (!decl) continue;
    frames = Math.max(frames, Math.ceil((decl.frames * program.sampleRate) / decl.sampleRate));
    channels = Math.max(channels, decl.channels);
  }
  return { [`${key}.frames`]: frames, [`${key}.channels`]: channels };
}

function costView(
  node: ResolvedNode<ProgramEntry>,
  program: ResolvedProgram,
): {
  params: CostParams;
  automated: Set<string>;
} {
  const params: Record<string, number | string> = {};
  const automated = new Set<string>();
  for (const [key, value] of Object.entries(node.params)) {
    if (isSignal(value)) {
      automated.add(key);
      params[key] = value.spec.max;
    } else {
      params[key] = value;
      if (typeof value === 'string') Object.assign(params, sampleSizes(node, key, value, program));
    }
  }
  return { params, automated };
}

function nodeCost(
  node: ResolvedNode<ProgramEntry>,
  frames: number,
  sampleRate: number,
  program: ResolvedProgram,
) {
  const { params, automated } = costView(node, program);
  let buffers = 0;
  let perFrame = node.entry.resource.workPerFrame(params, automated);
  for (const value of Object.values(node.params)) {
    if (!isSignal(value)) continue;
    buffers += 1 + value.controls.filter((c) => typeof c.value !== 'number').length;
    perFrame += 1 + value.controls.length + 2 * value.modulations.length;
  }
  const scratch = node.entry.resource.bytesPerFrame?.(params) ?? 0;
  return {
    work: frames * perFrame,
    bytes:
      node.entry.resource.stateBytes(params, sampleRate) +
      buffers * frames * FLOAT32_BYTES +
      scratch * frames,
  };
}

function layerNodes(layer: ResolvedLayer): ResolvedNode<ProgramEntry>[] {
  return [
    layer.source,
    ...layer.resonators,
    ...(layer.articulation ? [layer.articulation] : []),
    ...layer.inserts,
  ];
}

/** Stil zincirinin kanal-örneği başına iş birimi: kesimler, transient, 4× doygunluk, dinamik, indirgeme. */
const STYLE_WORK_PER_FRAME = 140;
/** Master true-peak sınırlayıcısı: 4× ara değer + ölçüm turları. */
const LIMITER_WORK_PER_FRAME = 60;
const LIMITER_BYTES_PER_FRAME = 32;

/**
 * Ayırmadan ÖNCE maliyet: mix tamponu + modülatör tamponları + en ağır
 * katmanın tamponları/durumu (katmanlar sırayla işlenir) + efekt durumu.
 * İş: düğümlerin kare başına birimleri + sinyal çözümü + mix + master.
 */
export function estimateProgramCost(program: ResolvedProgram): RenderCost {
  const { sampleRate, frames, channels } = program;
  let work = frames * (MASTER_WORK_PER_FRAME + 1) * channels;
  let modulatorBytes = 0;
  for (const modulator of program.modulators) {
    const cost = nodeCost(modulator, frames, sampleRate, program);
    work += cost.work;
    modulatorBytes += cost.bytes + frames * FLOAT32_BYTES;
  }
  let heaviestLayer = 0;
  for (const layer of program.layers) {
    const width = layerChannels(layer, channels);
    const parallel = layer.routing === 'parallel' && layer.resonators.length > 0 ? 2 : 0;
    let bytes = (1 + parallel) * width * layer.frames * FLOAT32_BYTES;
    for (const node of layerNodes(layer)) {
      const cost = nodeCost(node, layer.frames, sampleRate, program);
      work += cost.work * width;
      bytes += cost.bytes * width;
    }
    work += layer.frames * channels * (1 + layer.sends.length);
    heaviestLayer = Math.max(heaviestLayer, bytes);
  }
  let effectBytes = 0;
  const effects = [...program.effects, ...program.buses.flatMap((bus) => bus.effects)];
  for (const effect of effects) {
    const cost = nodeCost(effect, frames, sampleRate, program);
    work += cost.work * channels;
    effectBytes = Math.max(effectBytes, cost.bytes * channels);
  }
  const keyed = effects.filter((e) => e.sidechain?.kind === 'layer').length;
  const graphBuffers = program.buses.length + keyed;
  work += frames * channels * program.buses.reduce((sum, bus) => sum + 2 + bus.sends.length, 0);
  if (program.style) work += frames * channels * STYLE_WORK_PER_FRAME;
  let limiterBytes = 0;
  if (program.master.limiter) {
    work += frames * channels * LIMITER_WORK_PER_FRAME;
    limiterBytes = frames * channels * LIMITER_BYTES_PER_FRAME;
  }
  let sampleBytes = 0;
  for (const decl of program.samples.values())
    sampleBytes += decl.frames * decl.channels * FLOAT32_BYTES;
  const treatment = treatmentCost(program);
  return {
    peakBytes:
      (1 + graphBuffers) * channels * frames * FLOAT32_BYTES +
      modulatorBytes +
      heaviestLayer +
      Math.max(effectBytes, limiterBytes) +
      sampleBytes +
      treatment.bytes,
    workUnits: work + treatment.work,
  };
}

/** İşleme katmanı: kendi tamponu (loop'ta iki tur) + zincir düğümleri + sınırlayıcı. */
function treatmentCost(program: ResolvedProgram): { work: number; bytes: number } {
  const treatment = program.treatment;
  if (!treatment) return { work: 0, bytes: 0 };
  const width = treatment.channels;
  const frames = treatmentFrames(
    treatment,
    masterFrames(program),
    program.sampleRate,
    program.master.loop !== null,
  );
  let work = frames * width;
  let state = 0;
  for (const node of treatment.chain) {
    const cost = nodeCost(node, frames, program.sampleRate, program);
    work += cost.work * width;
    state = Math.max(state, cost.bytes * width);
  }
  if (treatment.ceilingDbtp !== null) {
    work += frames * width * LIMITER_WORK_PER_FRAME;
    state = Math.max(state, frames * width * LIMITER_BYTES_PER_FRAME);
  }
  return { work, bytes: frames * width * FLOAT32_BYTES + state };
}

interface SharedSignals {
  readonly sampleRate: number;
  readonly modulators: ReadonlyMap<string, Float32Array>;
  /** `control.instability`: modülasyon derinliği çarpanı (program zamanı). */
  readonly depthFactor: Float32Array | number;
  readonly samples?: SampleAccess;
  readonly banks?: ReadonlyMap<string, readonly ResolvedZone[]>;
}

interface SignalContext extends SharedSignals {
  readonly frames: number;
  /** Katmanın program içindeki ilk örneği — modülatörler program zamanındadır. */
  readonly offset: number;
}

function gestureBuffer(gesture: ResolvedGesture, frames: number, sampleRate: number): Float32Array {
  const out = new Float32Array(frames);
  renderGesture(gesture.points, gesture.curve, out, sampleRate);
  return out;
}

/**
 * Taban (sabit ya da gesture) → makro çarpanları → modülasyon → aralık
 * kırpma. Sıra sabittir: makro fiziksel parametreyi taşır, modülasyon onun
 * ETRAFINDA salınır, en son aralık kırpılır.
 */
function renderSignal(value: ResolvedSignal, ctx: SignalContext): Float32Array {
  const out =
    typeof value.base === 'number'
      ? new Float32Array(ctx.frames).fill(value.base)
      : gestureBuffer(value.base, ctx.frames, ctx.sampleRate);
  for (const control of value.controls) {
    const { law, span } = control;
    if (typeof control.value === 'number') {
      const c = control.value;
      for (let i = 0; i < out.length; i++) out[i] = applyLaw(law, span, out[i], c);
    } else {
      const c = gestureBuffer(control.value, ctx.frames, ctx.sampleRate);
      for (let i = 0; i < out.length; i++) out[i] = applyLaw(law, span, out[i], c[i]);
    }
  }
  const { depthFactor, offset } = ctx;
  for (const modulation of value.modulations) {
    const m = ctx.modulators.get(modulation.by) as Float32Array;
    for (let i = 0; i < out.length; i++) {
      const scale = typeof depthFactor === 'number' ? depthFactor : depthFactor[offset + i];
      const x = modulation.depth * scale * m[offset + i];
      out[i] = modulation.additive ? out[i] + x : out[i] * (1 + x);
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = clampToSpec(out[i], value.spec, ctx.sampleRate);
  return out;
}

function materialize(node: ResolvedNode<ProgramEntry>, ctx: SignalContext): ResolvedParams {
  const params: Record<string, ParamSignal | string> = {};
  for (const [key, value] of Object.entries(node.params)) {
    params[key] = isSignal(value) ? renderSignal(value, ctx) : value;
  }
  return params;
}

function contextFor(
  seed: number,
  streamPath: string,
  sampleRate: number,
  frames: number,
  shared?: SharedSignals,
  sidechain?: readonly Float32Array[],
): NodeContext {
  const banks = shared?.banks;
  return {
    sampleRate,
    frames,
    random: (label) => substream(seed, `${streamPath}/${label}`),
    seed: (label) => deriveSeed(seed, `${streamPath}/${label}`),
    ...(shared?.samples ? { sample: shared.samples } : {}),
    ...(banks ? { bank: (name: string) => banks.get(name) ?? [] } : {}),
    ...(sidechain ? { sidechain } : {}),
  };
}

/** Katman kanal sayısı çözümde belirlenir (stereo kaynak + stereo program). */
function layerChannels(layer: ResolvedLayer, _programChannels: 1 | 2): 1 | 2 {
  return layer.channels;
}

type NodeRunner = <E extends ProgramEntry>(
  node: ResolvedNode<E>,
) => { params: ResolvedParams; ctx: NodeContext };

function parallelBlock(
  buffer: Float32Array,
  nodes: readonly ResolvedNode<ProcessorEntry>[],
  run: NodeRunner,
): void {
  const dry = buffer.slice();
  buffer.fill(0);
  const scratch = new Float32Array(buffer.length);
  for (const node of nodes) {
    scratch.set(dry);
    const { params, ctx } = run(node);
    node.entry.process(scratch, params, ctx);
    for (let i = 0; i < buffer.length; i++) buffer[i] += scratch[i];
  }
}

/**
 * Bir aşamayı bütün kanallara uygular. Kanal başına zincir düğümü her
 * çağrıda taze parametre ve alt akış alır; kanallar birbirinden bağımsız
 * olduğu için aşama sırasıyla işlemek kanal sırasıyla işlemekle aynı PCM'i verir.
 */
function applyStage(stage: LayerStage, buffers: Float32Array[], run: NodeRunner): void {
  switch (stage.kind) {
    case 'source': {
      const source = run(stage.node);
      if (buffers.length === 2) {
        const stereo = stage.node.entry.renderStereo as NonNullable<SourceEntry['renderStereo']>;
        stereo(buffers[0], buffers[1], source.params, source.ctx);
      } else {
        stage.node.entry.render(buffers[0], source.params, source.ctx);
      }
      return;
    }
    case 'parallel':
      for (const buffer of buffers) parallelBlock(buffer, stage.nodes, run);
      return;
    case 'insert': {
      const { params, ctx } = run(stage.node);
      stage.node.entry.process(buffers, params, ctx);
      return;
    }
    default:
      for (const buffer of buffers) {
        const { params, ctx } = run(stage.node);
        stage.node.entry.process(buffer, params, ctx);
      }
  }
}

/**
 * Katmanı render eder. Önbellek varsa önbellekte bulunan EN DERİN aşamadan
 * devam eder; yalnız o aşamadan sonrakiler hesaplanır ve yazılır.
 */
function renderLayer(
  layer: ResolvedLayer,
  seed: number,
  shared: SharedSignals,
  keys: ProgramKeys | null,
): Float32Array[] {
  const { sampleRate } = shared;
  const signals: SignalContext = { ...shared, frames: layer.frames, offset: layer.startFrame };
  const run: NodeRunner = (node) => ({
    params: materialize(node, signals),
    ctx: contextFor(seed, node.streamPath, sampleRate, layer.frames, shared),
  });
  const stages = layerStages(layer);
  const cache = renderSession().cache;
  const stageKeys = cache && keys ? layerStageKeys(layer, keys) : null;
  let buffers: Float32Array[] | undefined;
  let next = 0;
  if (cache && stageKeys) {
    for (let i = stageKeys.length - 1; i >= 0 && !buffers; i--) {
      buffers = cache.read(stageKeys[i]);
      if (buffers) next = i + 1;
    }
  }
  buffers ??= Array.from({ length: layer.channels }, () => new Float32Array(layer.frames));
  for (let i = next; i < stages.length; i++) {
    applyStage(stages[i], buffers, run);
    if (cache && stageKeys) cache.write(stageKeys[i], buffers);
  }
  return buffers;
}

function assertFinite(channels: readonly Float32Array[], label: string): void {
  channels.forEach((channel, ch) => {
    for (let i = 0; i < channel.length; i++) {
      if (!Number.isFinite(channel[i])) {
        throw new Error(`${label}: kanal ${ch}, örnek ${i} sonlu değil — yapı taşı kararsız`);
      }
    }
  });
}

interface Resolved {
  readonly program: ResolvedProgram;
  readonly seed: number;
  readonly cost: RenderCost;
}

/** Doğrula → bütçe. Hiçbir tampon ayrılmaz ve önbelleğe bakılmaz. */
function resolveForRender(value: unknown, options: ProgramRenderOptions): Resolved {
  const program = resolveProgram(value);
  const seed =
    options.seed === undefined
      ? program.seed
      : checkNumber(options.seed, 'seed', { min: 0, max: 0xffff_ffff, integer: true });
  const cost = estimateProgramCost(program);
  assertRenderBudget(cost, 'renderProgram', options.budget);
  return { program, seed, cost };
}

/** Modülatör tamponları (önbellekten ya da render'la), derinlik çarpanı ve sample erişimi. */
function sharedSignals(
  { program, seed }: Resolved,
  samples: SampleAccess | undefined,
  keys: ProgramKeys | null,
): SharedSignals {
  const { sampleRate, frames } = program;
  const cache = renderSession().cache;
  const modulators = new Map<string, Float32Array>();
  const plain: SignalContext = { sampleRate, frames, offset: 0, modulators, depthFactor: 1 };
  for (const node of program.modulators) {
    const name = node.streamPath.slice('modulator:'.length);
    const key = keys?.modulators.get(name);
    const cached = cache && key ? cache.read(key) : undefined;
    if (cached) {
      modulators.set(name, cached[0]);
      continue;
    }
    const out = new Float32Array(frames);
    node.entry.render(
      out,
      materialize(node, plain),
      contextFor(seed, node.streamPath, sampleRate, frames),
    );
    if (cache && key) cache.write(key, [out]);
    modulators.set(name, out);
  }
  const control = program.depthControl;
  let depthFactor: Float32Array | number = 1;
  if (control) {
    const scale = (c: number) => applyLaw('octaves', control.span, 1, c);
    depthFactor =
      typeof control.value === 'number'
        ? scale(control.value)
        : gestureBuffer(control.value, frames, sampleRate).map(scale);
  }
  const banks = program.banks.size > 0 ? program.banks : undefined;
  return {
    sampleRate,
    modulators,
    depthFactor,
    ...(samples ? { samples } : {}),
    ...(banks ? { banks } : {}),
  };
}

/**
 * Önbellek varken bildirilen her sample önbelleğe bakmadan ÖNCE yüklenir:
 * kütüphanedeki sürüm değişmiş ya da dosya kaybolmuşsa hata, önbelleksiz
 * render'la aynı biçimde çıkar ve eski bir PCM sessizce dönmez.
 */
function samplesFor(
  program: ResolvedProgram,
  options: ProgramRenderOptions,
): SampleAccess | undefined {
  const samples = sampleAccess(program.samples, options.samples);
  if (samples && renderSession().cache) for (const name of program.samples.keys()) samples(name);
  return samples;
}

function sessionOf(options: ProgramRenderOptions): Partial<RenderSession> {
  return {
    ...(options.quality ? { quality: options.quality } : {}),
    ...(options.cache !== undefined ? { cache: options.cache } : {}),
  };
}

function applyMaster(program: ResolvedProgram, channels: readonly Float32Array[]): void {
  const { master, sampleRate } = program;
  const level =
    master.normalize === 'peak'
      ? ({ mode: 'peak', target: Math.pow(10, master.peakDbfs / 20) } as const)
      : ({ mode: 'none', gain: Math.pow(10, master.gainDb / 20) } as const);
  const fades = {
    fadeInSeconds: master.fadeInSeconds,
    fadeOutSeconds: master.fadeOutSeconds,
    fadeOutCurve: 'cosine',
  } as const;
  if (!master.limiter) {
    masterChannels(channels, sampleRate, { level, dcBlockHz: master.dcBlockHz, ...fades });
    return;
  }
  masterChannels(channels, sampleRate, { level, dcBlockHz: master.dcBlockHz });
  limitTruePeak(channels, sampleRate, {
    ceilingDb: master.limiter.ceilingDbtp,
    lookaheadSeconds: master.limiter.lookaheadSeconds,
    releaseSeconds: master.limiter.releaseSeconds,
  });
  masterChannels(channels, sampleRate, { level: { mode: 'none' }, ...fades });
}

/**
 * Loop katlaması: çıktı [0, L), L = kare − X. İlk X örnek, kuyruk devamı
 * x[L+i] ile baş x[i] arasında ilintiye uyarlı güç tamamlayıcı geçiştir
 * (Fink–Holters–Zölzer; `loopSamples` ile aynı yasa): son örnekten başa
 * dönüş x[L−1] → ≈x[L] devamıdır, süreksizlik yoktur.
 */
function foldLoop(
  channels: readonly Float32Array[],
  sampleRate: number,
  seconds: number,
): Float32Array[] {
  const fade = Math.round(seconds * sampleRate);
  const length = channels[0].length - fade;
  return channels.map((x) => {
    let cross = 0;
    let tail = 0;
    let head = 0;
    for (let i = 0; i < fade; i++) {
      cross += x[length + i] * x[i];
      tail += x[length + i] ** 2;
      head += x[i] ** 2;
    }
    const denom = Math.sqrt(tail * head);
    const r = denom > 0 ? Math.min(1, Math.max(0, cross / denom)) : 0;
    const out = x.slice(0, length);
    for (let i = 0; i < fade; i++) {
      const angle = (Math.PI / 2) * ((i + 0.5) / fade);
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      out[i] = (x[length + i] * cos + x[i] * sin) / Math.sqrt(1 + 2 * r * sin * cos);
    }
    return out;
  });
}

function finish(
  program: ResolvedProgram,
  seed: number,
  cost: RenderCost,
  channels: Float32Array[],
): ProgramRender {
  const duration =
    program.master.loop || program.treatment
      ? channels[0].length / program.sampleRate
      : program.durationSeconds;
  return { channels, sampleRate: program.sampleRate, duration, seed, cost };
}

function renderInSession(value: unknown, options: ProgramRenderOptions): ProgramRender {
  const resolved = resolveForRender(value, options);
  const { program, seed, cost } = resolved;
  const { sampleRate, frames } = program;
  const { quality, cache } = renderSession();
  const samples = samplesFor(program, options);
  const rootKey = cache ? programRootKey(value, seed, quality, PROGRAM_RENDERER_VERSION) : null;
  const cached = cache && rootKey ? cache.read(rootKey) : undefined;
  if (cached) return finish(program, seed, cost, cached);
  const keys = cache ? programKeys(program, seed, quality, PROGRAM_RENDERER_VERSION) : null;
  const shared = sharedSignals(resolved, samples, keys);
  const effectSignals: SignalContext = { ...shared, frames, offset: 0 };
  const mix = mixdown(program, {
    renderLayer: (layer) => renderLayer(layer, seed, shared, keys),
    prepare: (node, sidechain) => ({
      params: materialize(node, effectSignals),
      ctx: contextFor(seed, node.streamPath, sampleRate, frames, shared, sidechain),
    }),
  });
  assertFinite(mix.channels, 'renderProgram');
  if (program.style) applyStyleChain(mix.channels, sampleRate, program.style.controls);
  applyMaster(program, mix.channels);
  const loop = program.master.loop;
  const mastered = loop
    ? foldLoop(mix.channels, sampleRate, loop.crossfadeSeconds)
    : [...mix.channels];
  const treatment = program.treatment;
  const channels = treatment
    ? applyTreatment(treatment, mastered, sampleRate, loop !== null, (node, buffers) => {
        const length = buffers[0].length;
        const signals: SignalContext = { ...shared, frames: length, offset: 0 };
        const ctx = contextFor(seed, node.streamPath, sampleRate, length, shared);
        node.entry.process(buffers, materialize(node, signals), ctx);
      })
    : mastered;
  if (cache && rootKey) cache.write(rootKey, channels);
  return finish(program, seed, cost, channels);
}

/**
 * Programı doğrular, maliyetini bütçeye karşı sınar ve ÖYLE render eder.
 * Katmanlar kanonik mix veriyolunda toplanır, seviye tek master
 * çekirdeğinde verilir. Önbellek varsa değişmeyen aşamalar ondan gelir;
 * PCM önbellekli ve önbelleksiz render'da birebir aynıdır.
 */
export function renderProgram(value: unknown, options: ProgramRenderOptions = {}): ProgramRender {
  return withRenderSession(sessionOf(options), () => renderInSession(value, options));
}

/**
 * Katmanları mix'e girmeden (kazanç/pan/efekt/master ÖNCESİ) ayrı ayrı
 * döndürür — bir katmanın başka katman ya da modülatör eklenince bit
 * düzeyinde değişmediğini ve tek bir yapı taşının ölçümünü sınamak için.
 */
export function renderProgramLayers(
  value: unknown,
  options: ProgramRenderOptions = {},
): Map<string, Float32Array> {
  return withRenderSession(sessionOf(options), () => {
    const resolved = resolveForRender(value, options);
    const { program, seed } = resolved;
    const { quality, cache } = renderSession();
    const keys = cache ? programKeys(program, seed, quality, PROGRAM_RENDERER_VERSION) : null;
    const shared = sharedSignals(resolved, samplesFor(program, options), keys);
    const out = new Map<string, Float32Array>();
    for (const layer of program.layers) {
      const buffers = renderLayer(layer, seed, shared, keys);
      assertFinite(buffers, `katman ${layer.name}`);
      out.set(layer.name, buffers[0]);
    }
    return out;
  });
}
