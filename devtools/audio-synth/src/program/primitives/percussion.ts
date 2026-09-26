import { downsample2x } from '../../engine/render';
import { qualityProfile } from '../../engine/session';
import { DRUM_MODELS, renderDrum, resolveDrum } from '../../instruments/percussion/drum';
import {
  renderRetro,
  RETRO_WAVEFORMS,
  waveformFields,
  type RetroWaveform,
} from '../../synthesis/retro';
import { renderRetroV1 } from '../../synthesis/retro-v1';
import { getWaveSampleWithPhaseV1 } from '../../synthesis/waveforms-v1';
import type { WaveSampleFn } from '../../synthesis/waveforms';
import { choiceOf, numberOf, sampleAt, signalOf, type NumberParamSpec } from '../params';
import type { SourceEntry } from '../registry';

/**
 * Müzik ve SFX'in paylaştığı iki kaynak: parametrik davul ve retro
 * osilatör. Müzikteki kit parçası ya da retro enstrüman ile akustik
 * programdaki UI/arcade sesi AYNI çekirdeği çalar; ikinci bir sentez yolu
 * yazılmaz. Her ikisinin v1 girdisi `2cd8b45` anlığındaki PolyBLEP
 * çekirdeğine bağlanır; v2 güncel bant sınırlı rezidüeli kullanır.
 */
const unit = (description: string, fallback: number): NumberParamSpec => ({
  type: 'number',
  unit: 'normalized',
  min: 0,
  max: 1,
  default: fallback,
  description,
});

function writeInto(out: Float32Array, source: Float32Array): void {
  out.set(source.subarray(0, Math.min(out.length, source.length)));
}

export const DRUM: SourceEntry = {
  id: 'source.drum',
  kind: 'source',
  version: 2,
  description:
    'Parametrik davul: kick, tom, snare, clap, hat, cymbal ya da perc. Perde zarflı gövde, ' +
    'süzülmüş gürültü, vuruş tıkı ve metalik küme; velocity tınıyı açar, tepe 0.9’a getirilir.',
  capabilities: ['percussion', 'drum', 'pitched', 'noise', 'transient'],
  params: {
    model: {
      type: 'choice',
      choices: DRUM_MODELS,
      default: 'kick',
      description: 'Davul modeli.',
    },
    velocity: unit('Vuruş şiddeti (tını; seviye değil).', 0.8),
    tune: {
      type: 'number',
      unit: 'semitones',
      min: -24,
      max: 24,
      default: 0,
      description: 'Modelin temel perdesine göre kaydırma.',
    },
    decay: unit('Sönüm uzunluğu.', 0.5),
    tone: unit('Parlaklık (tık, gürültü bandı, üst kipler).', 0.5),
    attack: unit('Vuruş sertliği (tık ve perde zarfı).', 0.5),
    noise: {
      type: 'number',
      unit: 'ratio',
      min: 0,
      max: 2,
      default: 1,
      description: 'Modelin gürültü payının çarpanı (1 = modelin kendi payı).',
    },
    drive: unit('Tanh doygunluğu.', 0),
    open: unit('Yalnız hat: 0 kapalı, 1 açık (diğer modellerde etkisiz).', 0),
  },
  causal: [
    { param: 'velocity', dimension: 'brightness', direction: 1, note: 'Tık ve bant açılır.' },
    { param: 'tune', dimension: 'pitch', direction: 1, note: '2^(t/12).' },
    { param: 'decay', dimension: 'decay', direction: 1, note: 'Üstel sönüm sabiti.' },
    { param: 'tone', dimension: 'brightness', direction: 1, note: 'Süzgeç ve üst kipler.' },
    { param: 'attack', dimension: 'transient', direction: 1, note: 'Tık ve perde zarfı.' },
    { param: 'noise', dimension: 'noisiness', direction: 1, note: 'Gürültü bileşeni.' },
    { param: 'drive', dimension: 'distortion', direction: 1, note: 'Tanh.' },
    { param: 'open', dimension: 'decay', direction: 1, note: 'Hat sönümü kapalıdan açığa.' },
  ],
  determinism: { stochastic: true, substreams: ['noise'] },
  resource: { model: 'O(kare·bileşen)', workPerFrame: () => 60, stateBytes: () => 0 },
  probe: { params: { model: 'hat' } },
  render(out, params, ctx) {
    renderDrumInto(out, params, ctx);
  },
};

function renderDrumInto(
  out: Float32Array,
  params: Parameters<SourceEntry['render']>[1],
  ctx: Parameters<SourceEntry['render']>[2],
  wave?: WaveSampleFn,
): void {
  const model = choiceOf(params, 'model');
  const drum = resolveDrum({
    model,
    velocity: numberOf(params, 'velocity'),
    tune: numberOf(params, 'tune'),
    decay: numberOf(params, 'decay'),
    tone: numberOf(params, 'tone'),
    attack: numberOf(params, 'attack'),
    noise: numberOf(params, 'noise'),
    drive: numberOf(params, 'drive'),
    ...(model === 'hat' ? { open: numberOf(params, 'open') } : {}),
    seed: ctx.seed('noise'),
  });
  writeInto(out, renderDrum(drum, ctx.sampleRate, undefined, wave));
}

/** `source.drum` v1 — metalik kümede PolyBLEP kare (dondurulmuş çekirdek). */
export const DRUM_V1: SourceEntry = {
  ...DRUM,
  version: 1,
  description:
    'Parametrik davul (v1, PolyBLEP kare metalik): kick, tom, snare, clap, hat, cymbal ya ' +
    'da perc. Eski programların bit-eşit PCM çıktısı bu sürümle üretilir.',
  render(out, params, ctx) {
    renderDrumInto(out, params, ctx, getWaveSampleWithPhaseV1);
  },
};

/** Arpej kalıpları (yarım ton); çip müziğinin hızlı akor taklidi. */
export const RETRO_ARPEGGIOS: Readonly<Record<string, readonly number[]>> = {
  none: [],
  octave: [0, 12],
  fifth: [0, 7],
  power: [0, 7, 12],
  major: [0, 4, 7],
  minor: [0, 3, 7],
  coin: [0, 5],
};

export const RETRO: SourceEntry = {
  id: 'source.retro',
  kind: 'source',
  version: 2,
  description:
    'Retro/arcade osilatör: darbe (duty), düz ya da 4-bit üçgen, testere, uzun/kısa LFSR, ' +
    '4-bit wavetable; hard sync, arpej, bit ve örnek-tutma. Kenarlar BLEP’li, lo-fi ' +
    'karakter yalnız bits/rate aşamasından gelir. Donanım öykünmesi iddiası yoktur.',
  capabilities: ['pitched', 'periodic', 'retro', 'chip', 'noise', 'blep'],
  params: {
    waveform: {
      type: 'choice',
      choices: RETRO_WAVEFORMS,
      default: 'pulse',
      description: 'Dalga, kip ya da tablo (tek seçim).',
    },
    frequency: {
      type: 'number',
      unit: 'Hz',
      min: 20,
      max: 20000,
      default: 440,
      automatable: true,
      belowNyquist: true,
      description: 'Temel perde (gürültüde LFSR saati perde × 93).',
    },
    duty: {
      type: 'number',
      unit: 'normalized',
      min: 0.05,
      max: 0.95,
      default: 0.25,
      automatable: true,
      description: 'Darbe doluluğu (0.125/0.25/0.5 klasik); yalnız darbede.',
    },
    sync: {
      type: 'number',
      unit: 'ratio',
      min: 1,
      max: 8,
      default: 1,
      description: 'Hard sync oranı (1 kapalı): bağımlı osilatör perde × oran hızında.',
    },
    arpeggio: {
      type: 'choice',
      choices: Object.keys(RETRO_ARPEGGIOS),
      default: 'none',
      description: 'Hızlı arpej kalıbı.',
    },
    arpRate: {
      type: 'number',
      unit: 'Hz',
      min: 1,
      max: 60,
      default: 16,
      description: 'Arpej adım hızı.',
    },
    bits: {
      type: 'number',
      unit: 'bits',
      min: 2,
      max: 24,
      default: 24,
      integer: true,
      description: 'Genlik kuantizasyonu (24 ≈ şeffaf).',
    },
    rate: {
      type: 'number',
      unit: 'Hz',
      min: 1000,
      max: 96000,
      default: 96000,
      description: 'Örnek-tutma oranı (program oranından yüksekse etkisiz).',
    },
  },
  causal: [
    { param: 'frequency', dimension: 'pitch', direction: 1, note: 'f0 doğrudan.' },
    {
      param: 'duty',
      dimension: 'brightness',
      direction: -1,
      note: '0.5’e yaklaştıkça çift harmonikler söner, tını koyulaşır (0.5 üstü simetrik).',
    },
    { param: 'sync', dimension: 'brightness', direction: 1, note: 'Oran × f0 bölgesi öne çıkar.' },
    { param: 'arpRate', dimension: 'density', direction: 1, note: 'Saniyedeki adım.' },
    {
      param: 'bits',
      dimension: 'noisiness',
      direction: -1,
      note: 'Kuantizasyon gürültüsü azalır.',
    },
    { param: 'rate', dimension: 'roughness', direction: -1, note: 'Tutma alias’ı azalır.' },
  ],
  determinism: { stochastic: false, substreams: [] },
  resource: { model: 'O(kare·kenar)', workPerFrame: () => 12, stateBytes: () => 0 },
  probe: { params: { arpeggio: 'fifth', bits: 12, rate: 16000 } },
  render(out, params, ctx) {
    renderRetroInto(out, params, ctx, renderRetro);
  },
};

function renderRetroInto(
  out: Float32Array,
  params: Parameters<SourceEntry['render']>[1],
  ctx: Parameters<SourceEntry['render']>[2],
  renderCore: typeof renderRetro,
): void {
  const frequency = signalOf(params, 'frequency');
  const duty = signalOf(params, 'duty');
  const at = (signal: typeof frequency) => (t: number) =>
    sampleAt(signal, Math.min(out.length - 1, Math.floor(t * ctx.sampleRate)));
  const semitones = RETRO_ARPEGGIOS[choiceOf(params, 'arpeggio')];
  const oversample = qualityProfile().voiceOversample;
  const rendered = renderCore(
    {
      ...waveformFields(choiceOf(params, 'waveform') as RetroWaveform),
      duty: 0.25,
      dutyTrack: at(duty),
      dutyTo: 0.25,
      dutySeconds: 0,
      noiseClockHz: null,
      interpolate: false,
      syncRatio: numberOf(params, 'sync'),
      bits: numberOf(params, 'bits'),
      holdHz: numberOf(params, 'rate'),
    },
    {
      frequencyHz: 440,
      track: at(frequency),
      arpeggio: semitones.length ? { semitones, rateHz: numberOf(params, 'arpRate') } : null,
      sweep: null,
      vibrato: null,
    },
    { attack: 0, decay: 0, sustain: 1, release: 0, steps: 0 },
    {
      seconds: out.length / ctx.sampleRate,
      sampleRate: ctx.sampleRate,
      oversample,
      gain: 1,
      decimate: (buffer) => downsample2x(buffer, ctx.sampleRate * 2, ctx.sampleRate),
    },
  );
  writeInto(out, rendered);
}

/** `source.retro` v1 — iki-örneklik PolyBLEP düzeltmeli dondurulmuş çekirdek. */
export const RETRO_V1: SourceEntry = {
  ...RETRO,
  version: 1,
  description:
    'Retro/arcade osilatör (v1, iki-örneklik PolyBLEP): darbe (duty), düz ya da 4-bit ' +
    'üçgen, testere, uzun/kısa LFSR, 4-bit wavetable; hard sync, arpej, bit ve ' +
    'örnek-tutma. Eski programların bit-eşit PCM çıktısı bu sürümle üretilir.',
  capabilities: ['pitched', 'periodic', 'retro', 'chip', 'noise', 'polyblep'],
  render(out, params, ctx) {
    renderRetroInto(out, params, ctx, renderRetroV1);
  },
};

export const CHIP_AND_DRUM = [DRUM, RETRO, DRUM_V1, RETRO_V1] as const;
