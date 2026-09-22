import { addVoice, createMix } from '../arrange/mix';
import { masterChannels } from '../engine/master';
import { assertRenderBudget, type RenderBudget, type RenderCost } from '../guard/budget';
import { checkNumber } from '../guard/read';
import { clampToSpec, type ResolvedGesture, type ResolvedSignal } from './bindings';
import { renderGesture } from './curves';
import type { ParamSignal, ResolvedParams } from './params';
import { applyLaw } from './primitives/controls';
import { deriveSeed, substream } from './random';
import type { CostParams, NodeContext, ProgramEntry } from './registry';
import {
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
}

const isSignal = (value: ResolvedValue): value is ResolvedSignal => typeof value === 'object';

function costView(node: ResolvedNode<ProgramEntry>): {
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
    }
  }
  return { params, automated };
}

function nodeCost(node: ResolvedNode<ProgramEntry>, frames: number, sampleRate: number) {
  const { params, automated } = costView(node);
  let buffers = 0;
  let perFrame = node.entry.resource.workPerFrame(params, automated);
  for (const value of Object.values(node.params)) {
    if (!isSignal(value)) continue;
    buffers += 1 + value.controls.filter((c) => typeof c.value !== 'number').length;
    perFrame += 1 + value.controls.length + 2 * value.modulations.length;
  }
  return {
    work: frames * perFrame,
    bytes: node.entry.resource.stateBytes(params, sampleRate) + buffers * frames * FLOAT32_BYTES,
  };
}

function layerNodes(layer: ResolvedLayer): ResolvedNode<ProgramEntry>[] {
  return [layer.source, ...layer.resonators, ...(layer.articulation ? [layer.articulation] : [])];
}

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
    const cost = nodeCost(modulator, frames, sampleRate);
    work += cost.work;
    modulatorBytes += cost.bytes + frames * FLOAT32_BYTES;
  }
  let heaviestLayer = 0;
  for (const layer of program.layers) {
    const parallel = layer.routing === 'parallel' && layer.resonators.length > 0 ? 2 : 0;
    let bytes = (1 + parallel) * layer.frames * FLOAT32_BYTES;
    for (const node of layerNodes(layer)) {
      const cost = nodeCost(node, layer.frames, sampleRate);
      work += cost.work;
      bytes += cost.bytes;
    }
    work += layer.frames * channels;
    heaviestLayer = Math.max(heaviestLayer, bytes);
  }
  let effectBytes = 0;
  for (const effect of program.effects) {
    const cost = nodeCost(effect, frames, sampleRate);
    work += cost.work * channels;
    effectBytes = Math.max(effectBytes, cost.bytes);
  }
  return {
    peakBytes: channels * frames * FLOAT32_BYTES + modulatorBytes + heaviestLayer + effectBytes,
    workUnits: work,
  };
}

interface SharedSignals {
  readonly sampleRate: number;
  readonly modulators: ReadonlyMap<string, Float32Array>;
  /** `control.instability`: modülasyon derinliği çarpanı (program zamanı). */
  readonly depthFactor: Float32Array | number;
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
): NodeContext {
  return {
    sampleRate,
    frames,
    random: (label) => substream(seed, `${streamPath}/${label}`),
    seed: (label) => deriveSeed(seed, `${streamPath}/${label}`),
  };
}

function renderLayer(layer: ResolvedLayer, seed: number, shared: SharedSignals): Float32Array {
  const { sampleRate } = shared;
  const signals: SignalContext = { ...shared, frames: layer.frames, offset: layer.startFrame };
  const run = <E extends ProgramEntry>(node: ResolvedNode<E>) => ({
    params: materialize(node, signals),
    ctx: contextFor(seed, node.streamPath, sampleRate, layer.frames),
  });
  const buffer = new Float32Array(layer.frames);
  const source = run(layer.source);
  layer.source.entry.render(buffer, source.params, source.ctx);
  if (layer.routing === 'parallel' && layer.resonators.length > 0) {
    const dry = buffer.slice();
    buffer.fill(0);
    const scratch = new Float32Array(layer.frames);
    for (const node of layer.resonators) {
      scratch.set(dry);
      const { params, ctx } = run(node);
      node.entry.process(scratch, params, ctx);
      for (let i = 0; i < buffer.length; i++) buffer[i] += scratch[i];
    }
  } else {
    for (const node of layer.resonators) {
      const { params, ctx } = run(node);
      node.entry.process(buffer, params, ctx);
    }
  }
  if (layer.articulation) {
    const { params, ctx } = run(layer.articulation);
    layer.articulation.entry.process(buffer, params, ctx);
  }
  return buffer;
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

interface Prepared {
  readonly program: ResolvedProgram;
  readonly seed: number;
  readonly cost: RenderCost;
  readonly shared: SharedSignals;
}

/** Doğrula → bütçe → modülatör tamponları. Katman render'ı bunun üstüne kurulur. */
function prepare(value: unknown, options: ProgramRenderOptions): Prepared {
  const program = resolveProgram(value);
  const seed =
    options.seed === undefined
      ? program.seed
      : checkNumber(options.seed, 'seed', { min: 0, max: 0xffff_ffff, integer: true });
  const cost = estimateProgramCost(program);
  assertRenderBudget(cost, 'renderProgram', options.budget);
  const { sampleRate, frames } = program;
  const modulators = new Map<string, Float32Array>();
  const plain: SignalContext = { sampleRate, frames, offset: 0, modulators, depthFactor: 1 };
  for (const node of program.modulators) {
    const out = new Float32Array(frames);
    node.entry.render(
      out,
      materialize(node, plain),
      contextFor(seed, node.streamPath, sampleRate, frames),
    );
    modulators.set(node.streamPath.slice('modulator:'.length), out);
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
  return { program, seed, cost, shared: { sampleRate, modulators, depthFactor } };
}

/**
 * Programı doğrular, maliyetini bütçeye karşı sınar ve ÖYLE render eder.
 * Katmanlar kanonik mix veriyolunda toplanır, seviye tek master
 * çekirdeğinde verilir.
 */
export function renderProgram(value: unknown, options: ProgramRenderOptions = {}): ProgramRender {
  const { program, seed, cost, shared } = prepare(value, options);
  const { sampleRate, frames } = program;
  const mix = createMix(program.durationSeconds, sampleRate, program.channels);
  for (const layer of program.layers) {
    const buffer = renderLayer(layer, seed, shared);
    addVoice(
      mix,
      { channels: [buffer], sampleRate, duration: layer.frames / sampleRate },
      layer.startSeconds,
      { gain: layer.gain, pan: layer.pan },
    );
  }
  const effectSignals: SignalContext = { ...shared, frames, offset: 0 };
  for (const effect of program.effects) {
    const params = materialize(effect, effectSignals);
    const ctx = contextFor(seed, effect.streamPath, sampleRate, frames);
    effect.entry.process(mix.channels, params, ctx);
  }
  assertFinite(mix.channels, 'renderProgram');
  const { master } = program;
  masterChannels(mix.channels, sampleRate, {
    level:
      master.normalize === 'peak'
        ? { mode: 'peak', target: Math.pow(10, master.peakDbfs / 20) }
        : { mode: 'none', gain: Math.pow(10, master.gainDb / 20) },
    dcBlockHz: master.dcBlockHz,
    fadeInSeconds: master.fadeInSeconds,
    fadeOutSeconds: master.fadeOutSeconds,
    fadeOutCurve: 'cosine',
  });
  return { channels: [...mix.channels], sampleRate, duration: program.durationSeconds, seed, cost };
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
  const { program, seed, shared } = prepare(value, options);
  const out = new Map<string, Float32Array>();
  for (const layer of program.layers) {
    const buffer = renderLayer(layer, seed, shared);
    assertFinite([buffer], `katman ${layer.name}`);
    out.set(layer.name, buffer);
  }
  return out;
}
