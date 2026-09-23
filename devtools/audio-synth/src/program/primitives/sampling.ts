import { decomposeTransient } from '../../analysis/decompose';
import { AudioParamError } from '../../guard/errors';
import { loopSamples, resample } from '../../synthesis/sample';
import { shiftAndStretch, type StretchMethod } from '../../synthesis/stretch';
import { choiceOf, numberOf, sampleAt, signalOf } from '../params';
import type { NodeContext, SourceEntry } from '../registry';
import { selectZone, type ResolvedZone } from '../sampleBank';
import type { SampleData } from '../samples';
import { scheduleEvents } from './events';

/**
 * Kayıttan kaynaklar: sample, sampler bankası ve granular bulut. Prosedürel
 * kaynaklarla AYNI katman/graph/publish sözleşmesindedir; oyun tarafı
 * kaynağın türünü bilmez. Veri `ctx.sample(ad)` ile çözülür (içerik özetiyle
 * sabit); program oranına Kaiser sinc ile yeniden örneklenir.
 */
function dataOf(ctx: NodeContext, name: string): SampleData {
  if (!ctx.sample)
    throw new AudioParamError(`samples.${name}`, 'required', 'sample çözücüsü yok', name);
  return ctx.sample(name);
}

/** Programın kanal düzenine göre: mono istenirse kanalların ortalaması. */
function monoOf(data: SampleData): Float32Array {
  if (data.channels.length === 1) return data.channels[0];
  const [l, r] = data.channels;
  return Float32Array.from(l, (v, i) => 0.5 * (v + r[i]));
}

function toRate(x: Float32Array, from: number, to: number): Float32Array {
  return from === to ? x : resample(x, from / to);
}

function writeInto(out: Float32Array, source: Float32Array): void {
  out.set(source.subarray(0, Math.min(out.length, source.length)));
}

function componentOf(x: Float32Array, component: string, sampleRate: number): Float32Array {
  if (component === 'full') return x;
  const parts = decomposeTransient(x, sampleRate);
  if (parts.status === 'failed') {
    throw new AudioParamError(
      'component',
      'combination',
      `ayrıştırma başarısız: ${parts.reason}`,
      component,
    );
  }
  return component === 'transient' ? parts.transient : parts.body;
}

function sampleChannel(
  x: Float32Array,
  data: SampleData,
  params: Parameters<SourceEntry['render']>[1],
  ctx: NodeContext,
): Float32Array {
  const start = Math.min(x.length - 1, Math.floor(numberOf(params, 'start') * x.length));
  const part = componentOf(x.subarray(start), choiceOf(params, 'component'), data.sampleRate);
  const atRate = toRate(part, data.sampleRate, ctx.sampleRate);
  return shiftAndStretch(
    atRate,
    numberOf(params, 'pitch'),
    numberOf(params, 'stretch'),
    choiceOf(params, 'method') as StretchMethod,
    ctx.sampleRate,
  );
}

const sampleRef = {
  type: 'sample',
  description: 'Programın `samples` bildirimindeki kayıt adı.',
} as const;

export const SAMPLE: SourceEntry = {
  id: 'source.sample',
  kind: 'source',
  version: 1,
  description:
    'Kayıt oynatıcı: başlangıç ofseti, bileşen (tam | transient | gövde — HPSS ayrıştırması, ' +
    'başarısızlıkta hata), BAĞIMSIZ perde (yarım ton) ve süre (oran) — wsola (transient), ' +
    'phase-vocoder (tonal) ya da resample (bağlı). Stereo kayıt stereo programda stereo kalır.',
  capabilities: ['sampled', 'hybrid', 'playback'],
  params: {
    sample: sampleRef,
    start: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 0.95,
      default: 0,
      description: 'Başlangıç ofseti (kayıt uzunluğuna oran).',
    },
    component: {
      type: 'choice',
      choices: ['full', 'transient', 'body'],
      default: 'full',
      description: 'Tamamı ya da HPSS ile ayrılmış transient/gövde bileşeni.',
    },
    pitch: {
      type: 'number',
      unit: 'semitones',
      min: -24,
      max: 24,
      default: 0,
      description: 'Perde kaydırma (süreden bağımsız; resample yönteminde bağlı).',
    },
    stretch: {
      type: 'number',
      unit: 'ratio',
      min: 0.25,
      max: 4,
      default: 1,
      description: 'Süre oranı (perdeden bağımsız; resample yönteminde bağlı).',
    },
    method: {
      type: 'choice',
      choices: ['phase-vocoder', 'wsola', 'resample'],
      default: 'phase-vocoder',
      description: 'phase-vocoder tonal, wsola transient ağırlıklı, resample klasik bağlı hız.',
    },
  },
  causal: [
    { param: 'start', dimension: 'duration', direction: -1, note: 'Kalan kayıt kısalır.' },
    { param: 'pitch', dimension: 'pitch', direction: 1, note: '2^(p/12).' },
    { param: 'stretch', dimension: 'duration', direction: 1, note: 'Süre oranı.' },
  ],
  determinism: { stochastic: false, substreams: [] },
  resource: {
    model: 'O(kayıt·(sinc + STFT))',
    workPerFrame: () => 60,
    stateBytes: () => 0,
    bytesPerFrame: () => 32,
  },
  probe: { params: { pitch: 3, stretch: 1.2 } },
  stereoFor: (params, context) => context.samples.get(String(params.sample))?.channels === 2,
  render(out, params, ctx) {
    const data = dataOf(ctx, choiceOf(params, 'sample'));
    writeInto(out, sampleChannel(monoOf(data), data, params, ctx));
  },
  renderStereo(left, right, params, ctx) {
    const data = dataOf(ctx, choiceOf(params, 'sample'));
    writeInto(left, sampleChannel(data.channels[0], data, params, ctx));
    writeInto(right, sampleChannel(data.channels[1] ?? data.channels[0], data, params, ctx));
  },
};

const RELEASE_SECONDS = 0.03;

/**
 * Bölgeyi çalar: başlangıç ofseti, perde (klasik sampler yeniden örneklemesi),
 * loop, bırakma. Velocity katmanı seçer VE katman içinde genliği
 * (0.3 + 0.7·v) ile ölçekler.
 */
function playZone(
  out: Float32Array,
  zone: ResolvedZone,
  data: SampleData,
  note: number,
  velocity: number,
  ctx: NodeContext,
) {
  const source = monoOf(data);
  const ratio = Math.pow(2, (note - zone.rootKey) / 12 + zone.tuneCents / 1200);
  const factor = (data.sampleRate / ctx.sampleRate) * ratio;
  const toOut = (seconds: number) => Math.round((seconds * data.sampleRate) / factor);
  const start = Math.round(zone.startSeconds * data.sampleRate);
  const body = resample(source.subarray(start), factor);
  let rendered: Float32Array;
  if (zone.loop && body.length < out.length) {
    const loopStart = toOut(zone.loop.startSeconds - zone.startSeconds);
    const loopEnd = toOut(zone.loop.endSeconds - zone.startSeconds);
    const head = body.subarray(0, loopStart);
    const fade = toOut(zone.loop.crossfadeSeconds);
    const cycle = loopSamples(
      body.slice(loopStart, loopEnd),
      out.length - head.length,
      true,
      fade > 0,
      fade,
    );
    rendered = new Float32Array(out.length);
    rendered.set(head);
    rendered.set(cycle, head.length);
  } else {
    rendered = body;
  }
  const gain = Math.pow(10, zone.gainDb / 20) * (0.3 + 0.7 * velocity);
  const length = Math.min(out.length, rendered.length);
  const release = Math.min(length, Math.round(RELEASE_SECONDS * ctx.sampleRate));
  for (let i = 0; i < length; i++) {
    const tail = i >= length - release && length === out.length ? (length - i) / release : 1;
    out[i] = gain * rendered[i] * tail;
  }
}

export const SAMPLER: SourceEntry = {
  id: 'source.sampler',
  kind: 'source',
  version: 1,
  description:
    'Sampler: programa gömülü `SampleBankV1`den nota + velocity + olay sırasıyla bölge seçer ' +
    '(anahtar aralığı, velocity katmanı, round-robin `olay mod n`), bölgenin başlangıç ' +
    'ofsetini, loop bölgesini, akort ve kazancını uygular. Seçim gerekçesi manifest’e yazılır.',
  capabilities: ['sampled', 'sampler', 'pitched', 'playback'],
  params: {
    bank: {
      type: 'sample',
      of: 'bank',
      description: 'Programın `banks` bildirimindeki banka adı.',
    },
    note: {
      type: 'number',
      unit: 'count',
      min: 0,
      max: 127,
      default: 60,
      integer: true,
      description: 'MIDI nota (anahtar eşlemesi ve perde).',
    },
    velocity: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.8,
      description: 'Velocity (katman seçimi).',
    },
    event: {
      type: 'number',
      unit: 'count',
      min: 0,
      max: 1_000_000,
      default: 0,
      integer: true,
      description: 'Olay sırası (round-robin seçimi: olay mod aday sayısı).',
    },
  },
  causal: [
    { param: 'note', dimension: 'pitch', direction: 1, note: 'Kök nota farkı kadar.' },
    { param: 'velocity', dimension: 'loudness', direction: 1, note: 'Katman + (0.3 + 0.7·v).' },
    { param: 'event', dimension: 'irregularity', direction: 1, note: 'Round-robin.' },
  ],
  determinism: { stochastic: false, substreams: [] },
  resource: {
    model: 'O(kare·sinc)',
    workPerFrame: () => 40,
    stateBytes: () => 0,
    bytesPerFrame: () => 16,
  },
  probe: { params: { velocity: 0.9 } },
  check(params, context) {
    const zones = context.banks.get(String(params.bank)) ?? [];
    const pick = selectZone(
      zones,
      Number(params.note),
      Number(params.velocity),
      Number(params.event),
    );
    return pick
      ? null
      : `nota ${String(params.note)} / velocity ${String(params.velocity)} için bölge yok`;
  },
  render(out, params, ctx) {
    const zones = ctx.bank?.(choiceOf(params, 'bank')) ?? [];
    const note = numberOf(params, 'note');
    const velocity = numberOf(params, 'velocity');
    const pick = selectZone(zones, note, velocity, numberOf(params, 'event'));
    if (!pick) throw new AudioParamError('note', 'combination', 'bölge yok', note);
    playZone(out, pick.zone, dataOf(ctx, pick.zone.sample), note, velocity, ctx);
  },
};

const WINDOWS = ['hann', 'tukey', 'gaussian'] as const;

function grainWindow(kind: string, u: number): number {
  if (kind === 'gaussian')
    return Math.exp(-0.5 * ((u - 0.5) / 0.15) ** 2) * (u > 0 && u < 1 ? 1 : 0);
  if (kind === 'tukey') {
    const edge = 0.25;
    if (u < edge) return 0.5 - 0.5 * Math.cos((Math.PI * u) / edge);
    if (u > 1 - edge) return 0.5 - 0.5 * Math.cos((Math.PI * (1 - u)) / edge);
    return 1;
  }
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * u);
}

/** Tanecik başına 4 noktalı Hermite okuma (kesirli adım; `pitch` oranı). */
function hermite(x: Float32Array, position: number): number {
  const i = Math.floor(position);
  const t = position - i;
  const at = (k: number) => x[Math.min(x.length - 1, Math.max(0, k))];
  const [y0, y1, y2, y3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
  const c1 = 0.5 * (y2 - y0);
  const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  return ((c3 * t + c2) * t + c1) * t + y1;
}

function renderGrains(
  outs: readonly Float32Array[],
  params: Parameters<SourceEntry['render']>[1],
  ctx: NodeContext,
) {
  const data = dataOf(ctx, choiceOf(params, 'sample'));
  const source = toRate(monoOf(data), data.sampleRate, ctx.sampleRate);
  const n = outs[0].length;
  const grainFrames = Math.max(8, Math.round(numberOf(params, 'grainSeconds') * ctx.sampleRate));
  const position = signalOf(params, 'position');
  const spread = numberOf(params, 'spread');
  const pitch = numberOf(params, 'pitch');
  const pitchSpread = numberOf(params, 'pitchSpread');
  const stereo = numberOf(params, 'stereoSpread');
  const window = choiceOf(params, 'window');
  const events = scheduleEvents(
    {
      rate: numberOf(params, 'density'),
      regularity: numberOf(params, 'regularity'),
      clustering: 0,
      sizeSpread: 1,
      levelSpread: 0,
      frames: n,
      sampleRate: ctx.sampleRate,
    },
    ctx.random('timing'),
    ctx.random('variation'),
  );
  const jitter = ctx.random('grain');
  const density = Math.max(1, numberOf(params, 'density') * (grainFrames / ctx.sampleRate));
  const level = 1 / Math.sqrt(density);
  for (const event of events) {
    const ratio = Math.pow(2, (pitch + pitchSpread * event.size) / 12);
    const span = grainFrames * ratio;
    const center = Math.min(
      1,
      Math.max(0, sampleAt(position, event.frame) + spread * jitter.bipolar()),
    );
    const from = center * Math.max(0, source.length - span - 2);
    const pan = outs.length === 2 ? 0.5 + 0.5 * stereo * jitter.bipolar() : 0.5;
    const gains =
      outs.length === 2 ? [Math.cos((Math.PI / 2) * pan), Math.sin((Math.PI / 2) * pan)] : [1];
    const length = Math.min(grainFrames, n - event.frame);
    for (let j = 0; j < length; j++) {
      const value =
        level * grainWindow(window, j / grainFrames) * hermite(source, from + j * ratio);
      outs.forEach((out, ch) => (out[event.frame + j] += gains[ch] * value));
    }
  }
}

export const GRANULAR: SourceEntry = {
  id: 'source.granular',
  kind: 'source',
  version: 1,
  description:
    'Granular/sample bulutu: tanecik konumu (gesture alır), konum dağılımı, süre, yoğunluk, ' +
    'düzenlilik, perde ve perde dağılımı, pencere, stereo yerleşim; tanecikler tohumlu ve ' +
    'deterministik, en çok 20000 tanecik (olay motoru tavanı), ayrı tampon ayrılmaz.',
  capabilities: ['granular', 'sampled', 'texture', 'stochastic', 'time-varying'],
  params: {
    sample: sampleRef,
    position: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.3,
      automatable: true,
      description: 'Kayıt içinde tanecik merkezi (0 baş, 1 son).',
    },
    spread: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.1,
      description: 'Konum dağılımı.',
    },
    grainSeconds: {
      type: 'number',
      unit: 's',
      min: 0.005,
      max: 0.5,
      default: 0.08,
      description: 'Tanecik süresi.',
    },
    density: {
      type: 'number',
      unit: 'per-second',
      min: 1,
      max: 2000,
      default: 40,
      description: 'Tanecik sıklığı.',
    },
    regularity: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.3,
      description: '0 Poisson, 1 periyodik tanecik aralığı.',
    },
    pitch: {
      type: 'number',
      unit: 'semitones',
      min: -24,
      max: 24,
      default: 0,
      description: 'Tanecik perdesi.',
    },
    pitchSpread: {
      type: 'number',
      unit: 'semitones',
      min: 0,
      max: 24,
      default: 1,
      description: 'Tanecik başına perde dağılımı (±).',
    },
    window: {
      type: 'choice',
      choices: WINDOWS,
      default: 'hann',
      description: 'Tanecik penceresi (hepsi uçlarda sıfır: tıksız).',
    },
    stereoSpread: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      description:
        'Stereo programda tanecik başına eşit güçlü yerleşim genişliği (> 0 → stereo katman).',
    },
  },
  causal: [
    { param: 'position', dimension: 'brightness', direction: 1, note: 'Kaydın başka bölgesi.' },
    { param: 'spread', dimension: 'irregularity', direction: 1, note: 'Dağınık bulut.' },
    { param: 'grainSeconds', dimension: 'duration', direction: 1, note: 'Uzun tanecik.' },
    { param: 'density', dimension: 'density', direction: 1, note: 'Yoğun bulut.' },
    { param: 'regularity', dimension: 'irregularity', direction: -1, note: 'Düzenli aralık.' },
    { param: 'pitch', dimension: 'pitch', direction: 1, note: '2^(p/12).' },
    { param: 'pitchSpread', dimension: 'roughness', direction: 1, note: 'Perde bulutu.' },
    { param: 'stereoSpread', dimension: 'width', direction: 1, note: 'Geniş yerleşim.' },
  ],
  determinism: { stochastic: true, substreams: ['timing', 'variation', 'grain'] },
  resource: {
    model: 'O(tanecik·süre)',
    workPerFrame: (p) => 4 + 1.2 * Math.min(2000, Number(p.density)) * Number(p.grainSeconds) * 8,
    stateBytes: () => 0,
    bytesPerFrame: () => 8,
  },
  probe: { channels: 2 },
  stereoFor: (params) => Number(params.stereoSpread) > 0,
  render(out, params, ctx) {
    renderGrains([out], params, ctx);
  },
  renderStereo(left, right, params, ctx) {
    renderGrains([left, right], params, ctx);
  },
};

export const SAMPLING = [SAMPLE, SAMPLER, GRANULAR] as const;
