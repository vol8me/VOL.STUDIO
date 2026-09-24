import type { ModelVoiceV1, PlacedVoiceV1 } from '../arrange/render';
import { cacheKey } from '../engine/renderCache';
import { downsample2x } from '../engine/render';
import { qualityProfile } from '../engine/session';
import { AudioParamError } from '../guard/errors';
import { drumSeconds, renderDrum } from '../instruments/percussion/drum';
import { getPreset } from '../presets';
import { monoOf } from '../program/primitives/sampling';
import { selectZone } from '../program/sampleBank';
import type { SampleAccess } from '../program/samples';
import { renderRetro } from '../synthesis/retro';
import { renderZone } from '../synthesis/zone';
import type { SynthParams } from '../types';
import {
  ACCENT_VELOCITY_BOOST,
  GHOST_VELOCITY_SCALE,
  LEGATO_OVERLAP_SECONDS,
  MUTE_BRIGHTNESS,
  MUTE_LENGTH_RATIO,
  SLIDE_SECONDS,
  STACCATO_MIN_SECONDS,
  STACCATO_RATIO,
} from './articulation';
import {
  builtinInstrument,
  DEFAULT_VELOCITY,
  type ResolvedInstrumentV1,
  type ResolvedSourceV1,
} from './instrumentResolve';
import type { MusicScoreV1, ScoreEventV1 } from './score';
import { midiToHz } from './tonal';
import { frequencyOf } from './tuning';

/**
 * Score olayını kaynağın sesine çevirir. Besteci kaynağı bilmez: velocity,
 * artikülasyon ve kapı süresi burada TEK yerde yorumlanır, kaynak yalnız
 * "şu perdede, şu sürede, şu şiddette çal" isteğini alır.
 *
 * Komşu bilgisi (legato'nun bir sonraki notası, slide'ın önceki perdesi,
 * boğma grubunun sonraki vuruşu) SCORE'un tamamından okunur, çağıranın
 * verdiği alt kümeden değil: stem ya da segment ayrı render edildiğinde de
 * her olay aynı sesi verir.
 */
export interface VoiceContext {
  readonly samples?: SampleAccess;
}

type Source = Exclude<ResolvedSourceV1, { kind: 'layer' }>;

interface Plan {
  readonly event: ScoreEventV1;
  readonly instrument: ResolvedInstrumentV1;
  readonly frequencyHz: number;
  readonly beatSeconds: number;
  readonly notatedSeconds: number;
  readonly velocity: number;
  /** Velocity tepkisinin seviye çarpanı; velocity yazılmadıysa tam 1. */
  readonly level: number;
  readonly has: (articulation: string) => boolean;
  readonly next: ScoreEventV1 | undefined;
  readonly previous: ScoreEventV1 | undefined;
  /** Şeritte aynı enstrümanın olay sırası (sampler round-robin). */
  readonly order: number;
  readonly atSeconds: number;
  readonly sampleRate: number;
}

const dbToGain = (db: number) => Math.pow(10, db / 20);

function instrumentOf(
  score: MusicScoreV1,
  id: string,
  memo: Map<string, ResolvedInstrumentV1>,
): ResolvedInstrumentV1 {
  let found = memo.get(id);
  if (!found) {
    found = score.instruments?.[id] ?? builtinInstrument(id);
    memo.set(id, found);
  }
  return found;
}

function neighbours(score: MusicScoreV1) {
  const lanes = new Map<string, ScoreEventV1[]>();
  for (const event of score.events) {
    const list = lanes.get(event.lane) ?? [];
    list.push(event);
    lanes.set(event.lane, list);
  }
  const index = new Map<string, { list: ScoreEventV1[]; at: number }>();
  for (const list of lanes.values()) {
    list.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
    list.forEach((event, at) => index.set(event.id, { list, at }));
  }
  return index;
}

function planOf(
  score: MusicScoreV1,
  event: ScoreEventV1,
  instrument: ResolvedInstrumentV1,
  place: { list: ScoreEventV1[]; at: number },
): Plan {
  const beat = 60 / score.bpm;
  const articulations = event.articulations ?? [];
  const has = (a: string) => articulations.includes(a as never);
  let velocity = event.velocity ?? DEFAULT_VELOCITY;
  let touched = event.velocity !== undefined;
  if (has('accent')) {
    velocity = Math.min(1, velocity + ACCENT_VELOCITY_BOOST);
    touched = true;
  } else if (has('ghost')) {
    velocity *= GHOST_VELOCITY_SCALE;
    touched = true;
  }
  const { list, at } = place;
  return {
    event,
    instrument,
    frequencyHz: frequencyOf(event.midi, event.cents, score.tuning),
    beatSeconds: beat,
    notatedSeconds: event.beats * beat,
    velocity,
    level: touched ? dbToGain(instrument.velocity.rangeDb * (velocity - DEFAULT_VELOCITY)) : 1,
    has,
    next: list.slice(at + 1).find((other) => other.beat > event.beat),
    previous: at > 0 ? list[at - 1] : undefined,
    order: list.slice(0, at).filter((other) => other.instrument === event.instrument).length,
    atSeconds: event.beat * beat,
    sampleRate: score.sampleRate,
  };
}

/** Kaynağın doğal (kapıdan bağımsız) uzunluğu: `let-ring` bunu kullanır. */
function naturalSeconds(plan: Plan, source: Source, context: VoiceContext): number {
  switch (source.kind) {
    case 'preset':
      return source.typicalSeconds;
    case 'retro':
      return plan.notatedSeconds;
    case 'drum-kit':
      return drumSeconds({ ...piece(plan, source).drum, velocity: plan.velocity, seed: 0 });
    case 'sampler': {
      const zone = zoneOf(plan, source);
      if (zone.loop || !context.samples) return plan.notatedSeconds;
      const data = context.samples(zone.sample);
      const ratio = samplerRatio(plan, zone);
      return (data.channels[0].length / data.sampleRate - zone.startSeconds) / ratio;
    }
  }
}

/** Kapı: notanın ÇALINAN süresi. Artikülasyonsuz notada yazılı süredir. */
function gateOf(plan: Plan, source: Source, context: VoiceContext): number {
  const notated = plan.notatedSeconds;
  let gate = notated;
  if (plan.has('staccato')) gate = Math.max(STACCATO_MIN_SECONDS, notated * STACCATO_RATIO);
  else if (plan.has('legato') && plan.next) {
    const gap = plan.next.beat - plan.event.beat;
    if (gap <= plan.event.beats + 1e-9) gate = gap * plan.beatSeconds + LEGATO_OVERLAP_SECONDS;
  } else if (plan.has('let-ring')) gate = Math.max(notated, naturalSeconds(plan, source, context));
  if (plan.has('mute')) gate *= MUTE_LENGTH_RATIO;
  return gate;
}

function glideOf(plan: Plan, gate: number) {
  if (!plan.has('slide') || !plan.previous) return null;
  return {
    semitones: plan.previous.midi - plan.event.midi,
    seconds: Math.min(SLIDE_SECONDS, gate * 0.5),
  };
}

function presetVoice(
  plan: Plan,
  source: Extract<Source, { kind: 'preset' }>,
  gate: number,
  gain: number,
): PlacedVoiceV1 {
  const params: SynthParams = getPreset(source.preset, plan.frequencyHz, gate);
  const brightness = plan.instrument.velocity.brightness;
  let cutoffScale = 1;
  if (brightness > 0 && plan.level !== 1) {
    cutoffScale *= Math.pow(2, 2 * brightness * (plan.velocity - DEFAULT_VELOCITY));
  }
  if (plan.has('mute')) cutoffScale *= MUTE_BRIGHTNESS;
  if (cutoffScale !== 1) {
    params.lowpass = params.lowpass
      ? { ...params.lowpass, cutoff: Math.max(40, params.lowpass.cutoff * cutoffScale) }
      : { cutoff: Math.max(40, 8 * plan.frequencyHz * cutoffScale), poles: 2, type: 'lowpass' };
  }
  const glide = glideOf(plan, gate);
  if (glide) params.glide = glide;
  return {
    params,
    atSeconds: plan.atSeconds,
    gain,
    ...(plan.event.pan === undefined ? {} : { pan: plan.event.pan }),
  };
}

function piece(plan: Plan, source: Extract<Source, { kind: 'drum-kit' }>) {
  const found = source.pieces.find((p) => p.midi === plan.event.midi);
  if (!found) {
    throw new AudioParamError(
      `score.${plan.event.id}`,
      'range',
      'kitte bu tuşa parça yok',
      plan.event.midi,
    );
  }
  return found;
}

function zoneOf(plan: Plan, source: Extract<Source, { kind: 'sampler' }>) {
  const pick = selectZone(source.zones, plan.event.midi, plan.velocity, plan.order);
  if (!pick) {
    throw new AudioParamError(
      `score.${plan.event.id}`,
      'range',
      `${source.bank} bankasında nota ${plan.event.midi}, velocity ${plan.velocity} için bölge yok`,
      plan.event.midi,
    );
  }
  return pick.zone;
}

function samplerRatio(plan: Plan, zone: { rootKey: number; tuneCents: number }): number {
  return (plan.frequencyHz / midiToHz(zone.rootKey)) * Math.pow(2, zone.tuneCents / 1200);
}

function model(key: unknown, render: () => Float32Array[]): ModelVoiceV1 {
  return { key: cacheKey(key), render };
}

function drumVoice(
  plan: Plan,
  source: Extract<Source, { kind: 'drum-kit' }>,
  gain: number,
): PlacedVoiceV1 {
  const hit = piece(plan, source);
  const drum = { ...hit.drum, velocity: plan.velocity, seed: plan.event.seed ?? 0 };
  const natural = drumSeconds(drum);
  let gate: number | undefined;
  const next = plan.next;
  const choked =
    hit.choke !== null &&
    !plan.has('let-ring') &&
    next !== undefined &&
    source.pieces.find((p) => p.midi === next.midi)?.choke === hit.choke;
  if (choked) gate = (next.beat - plan.event.beat) * plan.beatSeconds;
  if (plan.has('mute')) gate = Math.min(gate ?? natural, natural * MUTE_LENGTH_RATIO);
  if (gate !== undefined && gate >= natural) gate = undefined;
  const oversample = qualityProfile().voiceOversample;
  return {
    model: model(
      {
        backend: 'drum-kit',
        version: 1,
        drum,
        gate: gate ?? null,
        rate: plan.sampleRate,
        oversample,
      },
      () => [renderDrum(drum, plan.sampleRate, gate)],
    ),
    atSeconds: plan.atSeconds,
    gain: gain * hit.gain,
    ...(plan.event.pan === undefined ? {} : { pan: plan.event.pan }),
  };
}

function retroVoice(
  plan: Plan,
  source: Extract<Source, { kind: 'retro' }>,
  gate: number,
  gain: number,
): PlacedVoiceV1 {
  const glide = glideOf(plan, gate);
  const pitch = {
    frequencyHz: plan.frequencyHz,
    arpeggio: source.arpeggio,
    sweep: glide ?? source.sweep,
    vibrato: source.vibrato,
  };
  const oversample = qualityProfile().voiceOversample;
  const rate = plan.sampleRate;
  return {
    model: model(
      {
        backend: 'retro',
        version: 1,
        osc: source.osc,
        envelope: source.envelope,
        pitch,
        gain: source.gain,
        gate,
        rate,
        oversample,
      },
      () => [
        renderRetro(source.osc, pitch, source.envelope, {
          seconds: gate,
          sampleRate: rate,
          oversample,
          gain: source.gain,
          decimate: (buffer) => downsample2x(buffer, rate * 2, rate),
        }),
      ],
    ),
    atSeconds: plan.atSeconds,
    gain,
    ...(plan.event.pan === undefined ? {} : { pan: plan.event.pan }),
  };
}

function samplerVoice(
  plan: Plan,
  source: Extract<Source, { kind: 'sampler' }>,
  gate: number,
  gain: number,
  context: VoiceContext,
): PlacedVoiceV1 {
  const zone = zoneOf(plan, source);
  const ratio = samplerRatio(plan, zone);
  const release = plan.instrument.releaseSeconds;
  const rate = plan.sampleRate;
  const length = Math.max(1, Math.ceil((gate + release) * rate));
  const render = () => {
    if (!context.samples) {
      throw new AudioParamError(
        `samples.${zone.sample}`,
        'required',
        'müzik render’ı sample çözücüsü ister',
        zone.sample,
      );
    }
    const data = context.samples(zone.sample);
    const body = renderZone(zone, monoOf(data), data.sampleRate, ratio, rate, length, length);
    const out = body.length > length ? body.slice(0, length) : body;
    const gateFrames = Math.floor(gate * rate);
    const fade = Math.max(1, out.length - gateFrames);
    const scale = dbToGain(zone.gainDb);
    for (let i = 0; i < out.length; i++) {
      out[i] *= i < gateFrames ? scale : scale * Math.max(0, 1 - (i - gateFrames) / fade);
    }
    return [out];
  };
  return {
    model: model(
      {
        backend: 'sampler',
        version: 1,
        sample: source.samples[zone.sample],
        zone,
        ratio,
        gate,
        release,
        rate,
      },
      render,
    ),
    atSeconds: plan.atSeconds,
    gain,
    ...(plan.event.pan === undefined ? {} : { pan: plan.event.pan }),
  };
}

function sourceVoice(
  plan: Plan,
  source: Source,
  gain: number,
  context: VoiceContext,
): PlacedVoiceV1 {
  switch (source.kind) {
    case 'preset':
      return presetVoice(plan, source, gateOf(plan, source, context), gain);
    case 'drum-kit':
      return drumVoice(plan, source, gain);
    case 'retro':
      return retroVoice(plan, source, gateOf(plan, source, context), gain);
    case 'sampler':
      return samplerVoice(plan, source, gateOf(plan, source, context), gain, context);
  }
}

/** Olayların sesleri; katmanlı enstrüman velocity aralığına düşen her katmandan bir ses verir. */
export function planVoices(
  score: MusicScoreV1,
  events: readonly ScoreEventV1[],
  context: VoiceContext = {},
): PlacedVoiceV1[] {
  const memo = new Map<string, ResolvedInstrumentV1>();
  const index = neighbours(score);
  const voices: PlacedVoiceV1[] = [];
  for (const event of events) {
    const instrument = instrumentOf(score, event.instrument, memo);
    const place = index.get(event.id) ?? { list: [event], at: 0 };
    const plan = planOf(score, event, instrument, place);
    const base = event.gain * plan.level;
    const { source } = instrument;
    if (source.kind !== 'layer') {
      voices.push(sourceVoice(plan, source, base, context));
      continue;
    }
    for (const layer of source.layers) {
      if (plan.velocity < layer.velocityLow || plan.velocity > layer.velocityHigh) continue;
      voices.push(sourceVoice(plan, layer.source, base * layer.gain, context));
    }
  }
  return voices;
}

/**
 * Olayın render'da kaplayacağı en uzun süre (bütçe için üst sınır):
 * artikülasyonsuz preset notasında yazılı süre, diğerlerinde kapı + kuyruk.
 */
export function voiceSecondsBound(
  score: MusicScoreV1,
  event: ScoreEventV1,
  memo: Map<string, ResolvedInstrumentV1>,
): number {
  const beat = 60 / score.bpm;
  const instrument = instrumentOf(score, event.instrument, memo);
  const notated = event.beats * beat;
  if (instrument.source.kind === 'preset' && !event.articulations) return notated;
  const plan = planOf(score, event, instrument, { list: [event], at: 0 });
  const sources =
    instrument.source.kind === 'layer'
      ? instrument.source.layers.map((layer) => layer.source)
      : [instrument.source];
  return Math.max(
    notated,
    ...sources.map((source) =>
      source.kind === 'drum-kit'
        ? drumSeconds({ ...piece(plan, source).drum, velocity: plan.velocity, seed: 0 })
        : source.kind === 'retro'
        ? gateOf(plan, source, {}) + source.envelope.release
        : source.kind === 'preset'
        ? Math.max(notated, source.typicalSeconds)
        : notated + instrument.releaseSeconds + LEGATO_OVERLAP_SECONDS,
    ),
  );
}
