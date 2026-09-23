import { addVoice, createMix, type Mix } from '../arrange/mix';
import type { NodeContext, ProgramEntry } from './registry';
import type { ResolvedParams } from './params';
import { MASTER_BUS, type ResolvedEffect, type SidechainRef } from './routing';
import type { ResolvedLayer, ResolvedNode, ResolvedProgram } from './schema';

/**
 * SoundGraph'ın toplama adımı: katmanlar kendi bus'larına (ya da master'a)
 * ve send hedeflerine kanonik `addVoice` ile yerleşir; bus'lar topolojik
 * sırayla işlenip çıkışlarına ve return'lerine toplanır; en son master
 * zinciri çalışır. Bus'u olmayan bir program yalnız master'a yerleşir ve
 * efekt zinciri geçmişle aynı yolu izler — mevcut PCM değişmez.
 */
export interface NodeRun {
  readonly params: ResolvedParams;
  readonly ctx: NodeContext;
}

export interface MixdownHooks {
  /** Katmanı (1 ya da 2 kanal) render eder; insert'ler dahil. */
  readonly renderLayer: (layer: ResolvedLayer) => Float32Array[];
  /** Tam program süresindeki bir düğümü (efekt) çalıştırmaya hazırlar. */
  readonly prepare: (
    node: ResolvedNode<ProgramEntry>,
    sidechain?: readonly Float32Array[],
  ) => NodeRun;
}

function sidechainNames(program: ResolvedProgram): Set<string> {
  const names = new Set<string>();
  const visit = (effects: readonly ResolvedEffect[]) => {
    for (const effect of effects) {
      if (effect.sidechain?.kind === 'layer') names.add(effect.sidechain.name);
    }
  };
  visit(program.effects);
  for (const bus of program.buses) visit(bus.effects);
  return names;
}

function sumInto(target: readonly Float32Array[], source: readonly Float32Array[], gain: number) {
  target.forEach((channel, ch) => {
    const from = source[ch];
    for (let i = 0; i < channel.length; i++) channel[i] += from[i] * gain;
  });
}

export function runEffects(
  effects: readonly ResolvedEffect[],
  channels: readonly Float32Array[],
  hooks: MixdownHooks,
  resolveSidechain: (ref: SidechainRef | null) => readonly Float32Array[] | undefined,
): void {
  for (const effect of effects) {
    const { params, ctx } = hooks.prepare(effect, resolveSidechain(effect.sidechain));
    effect.entry.process(channels, params, ctx);
  }
}

export function mixdown(program: ResolvedProgram, hooks: MixdownHooks): Mix {
  const { sampleRate, durationSeconds, channels } = program;
  const mix = createMix(durationSeconds, sampleRate, channels);
  const buses = new Map(
    program.buses.map((bus) => [bus.name, createMix(durationSeconds, sampleRate, channels)]),
  );
  const keyed = sidechainNames(program);
  const layerKeys = new Map<string, Float32Array[]>();
  for (const layer of program.layers) {
    const buffers = hooks.renderLayer(layer);
    const voice = { channels: buffers, sampleRate, duration: layer.frames / sampleRate };
    const target = layer.bus === MASTER_BUS ? mix : (buses.get(layer.bus) as Mix);
    addVoice(target, voice, layer.startSeconds, { gain: layer.gain, pan: layer.pan });
    for (const send of layer.sends) {
      addVoice(buses.get(send.bus) as Mix, voice, layer.startSeconds, {
        gain: layer.gain * send.gain,
        pan: layer.pan,
      });
    }
    if (keyed.has(layer.name)) {
      const key = createMix(durationSeconds, sampleRate, channels);
      addVoice(key, voice, layer.startSeconds, { gain: layer.gain, pan: layer.pan });
      layerKeys.set(layer.name, [...key.channels]);
    }
  }
  const outputs = new Map<string, readonly Float32Array[]>();
  const sidechain = (ref: SidechainRef | null) =>
    ref === null ? undefined : ref.kind === 'bus' ? outputs.get(ref.name) : layerKeys.get(ref.name);
  for (const bus of program.buses) {
    const own = (buses.get(bus.name) as Mix).channels;
    runEffects(bus.effects, own, hooks, sidechain);
    if (bus.gain !== 1)
      for (const channel of own) for (let i = 0; i < channel.length; i++) channel[i] *= bus.gain;
    outputs.set(bus.name, own);
    const output = bus.output === MASTER_BUS ? mix : (buses.get(bus.output) as Mix);
    sumInto(output.channels, own, 1);
    for (const send of bus.sends) sumInto((buses.get(send.bus) as Mix).channels, own, send.gain);
  }
  runEffects(program.effects, mix.channels, hooks, sidechain);
  return mix;
}
