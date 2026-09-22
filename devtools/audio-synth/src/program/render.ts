import { addVoice, createMix } from '../arrange/mix';
import { masterChannels } from '../engine/master';
import { assertRenderBudget, type RenderBudget, type RenderCost } from '../guard/budget';
import { checkNumber } from '../guard/read';
import { renderGesture } from './curves';
import type { ParamSignal, ResolvedParams } from './params';
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

function isGesture(value: ResolvedValue): value is Exclude<ResolvedValue, number | string> {
  return typeof value === 'object';
}

function costView(node: ResolvedNode<ProgramEntry>): {
  params: CostParams;
  automated: Set<string>;
} {
  const params: Record<string, number | string> = {};
  const automated = new Set<string>();
  for (const [key, value] of Object.entries(node.params)) {
    if (isGesture(value)) {
      automated.add(key);
      params[key] = Math.max(...value.points.map(([, v]) => v));
    } else {
      params[key] = value;
    }
  }
  return { params, automated };
}

function nodeCost(node: ResolvedNode<ProgramEntry>, frames: number, sampleRate: number) {
  const { params, automated } = costView(node);
  return {
    work: frames * (node.entry.resource.workPerFrame(params, automated) + automated.size),
    bytes:
      node.entry.resource.stateBytes(params, sampleRate) + automated.size * frames * FLOAT32_BYTES,
  };
}

function layerNodes(layer: ResolvedLayer): ResolvedNode<ProgramEntry>[] {
  return [layer.source, ...layer.resonators, ...(layer.articulation ? [layer.articulation] : [])];
}

/**
 * Ayırmadan ÖNCE maliyet: mix tamponu + katmanlar sırayla işlendiği için
 * en ağır katmanın tamponları ve durumu + efekt durumları. İş: bütün
 * düğümlerin kare başına birimleri + mix toplamı + master.
 */
export function estimateProgramCost(program: ResolvedProgram): RenderCost {
  const { sampleRate, frames, channels } = program;
  let work = frames * (MASTER_WORK_PER_FRAME + 1) * channels;
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
    peakBytes: channels * frames * FLOAT32_BYTES + heaviestLayer + effectBytes,
    workUnits: work,
  };
}

function materialize(
  node: ResolvedNode<ProgramEntry>,
  frames: number,
  sampleRate: number,
): ResolvedParams {
  const params: Record<string, ParamSignal | string> = {};
  for (const [key, value] of Object.entries(node.params)) {
    if (isGesture(value)) {
      const curve = new Float32Array(frames);
      renderGesture(value.points, value.curve, curve, sampleRate);
      params[key] = curve;
    } else {
      params[key] = value;
    }
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

function renderLayer(layer: ResolvedLayer, seed: number, sampleRate: number): Float32Array {
  const run = <E extends ProgramEntry>(node: ResolvedNode<E>) => ({
    params: materialize(node, layer.frames, sampleRate),
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

function assertFinite(channels: readonly Float32Array[]): void {
  channels.forEach((channel, ch) => {
    for (let i = 0; i < channel.length; i++) {
      if (!Number.isFinite(channel[i])) {
        throw new Error(`renderProgram: kanal ${ch}, örnek ${i} sonlu değil — yapı taşı kararsız`);
      }
    }
  });
}

/**
 * Programı doğrular, maliyetini bütçeye karşı sınar ve ÖYLE render eder.
 * Katmanlar kanonik mix veriyolunda toplanır, seviye tek master
 * çekirdeğinde verilir.
 */
export function renderProgram(value: unknown, options: ProgramRenderOptions = {}): ProgramRender {
  const program = resolveProgram(value);
  const seed =
    options.seed === undefined
      ? program.seed
      : checkNumber(options.seed, 'seed', { min: 0, max: 0xffff_ffff, integer: true });
  const cost = estimateProgramCost(program);
  assertRenderBudget(cost, 'renderProgram', options.budget);

  const { sampleRate, frames } = program;
  const mix = createMix(program.durationSeconds, sampleRate, program.channels);
  for (const layer of program.layers) {
    const buffer = renderLayer(layer, seed, sampleRate);
    addVoice(
      mix,
      { channels: [buffer], sampleRate, duration: layer.frames / sampleRate },
      layer.startSeconds,
      { gain: layer.gain, pan: layer.pan },
    );
  }
  program.effects.forEach((effect) => {
    const params = materialize(effect, frames, sampleRate);
    effect.entry.process(
      mix.channels,
      params,
      contextFor(seed, effect.streamPath, sampleRate, frames),
    );
  });
  assertFinite(mix.channels);
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
