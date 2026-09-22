import { Reverb } from '../../effects/reverb';
import { Envelope } from '../../synthesis/envelope';
import { BiquadFilter } from '../../synthesis/filter';
import { createNoiseSource } from '../../synthesis/noise';
import { getWaveSampleWithPhase } from '../../synthesis/waveforms';
import type { Curve, FilterType } from '../../types';
import { choiceOf, numberOf, sampleAt, signalOf, type NumberParamSpec } from '../params';
import type { EffectEntry, ProcessorEntry, SourceEntry } from '../registry';

/**
 * Dalga 1 ilkelleri: mevcut, ölçülmüş motor parçalarının program yüzeyine
 * bağlanmış hâli. Yeni DSP yazmazlar; registry'nin gerçek bir
 * implementasyona bağlı olduğunu ve programın kanonik yol olduğunu kanıtlarlar.
 */
const DETERMINISTIC = { stochastic: false, substreams: [] } as const;

const frequencyParam = (description: string, fallback: number): NumberParamSpec => ({
  type: 'number',
  unit: 'Hz',
  min: 20,
  max: 20000,
  default: fallback,
  automatable: true,
  belowNyquist: true,
  description,
});

const seconds = (description: string, fallback: number, max = 10): NumberParamSpec => ({
  type: 'number',
  unit: 's',
  min: 0,
  max,
  default: fallback,
  description,
});

const unit = (description: string, fallback: number): NumberParamSpec => ({
  type: 'number',
  unit: 'normalized',
  min: 0,
  max: 1,
  default: fallback,
  description,
});

type TonalWave = 'sine' | 'triangle' | 'sawtooth' | 'square';

export const OSCILLATOR: SourceEntry = {
  id: 'source.oscillator',
  kind: 'source',
  version: 1,
  description:
    'Faz biriktirmeli periyodik osilatör (sinüs tablosu, bant sınırlı üçgen tablosu, ' +
    'PolyBLEP testere/kare). Program oranında çalışır; iç aşırı örnekleme yoktur.',
  capabilities: ['pitched', 'periodic', 'polyblep'],
  params: {
    waveform: {
      type: 'choice',
      choices: ['sine', 'triangle', 'sawtooth', 'square'],
      default: 'sine',
      description: 'Dalga biçimi; kenarlı biçimler PolyBLEP ile düzeltilir.',
    },
    frequency: frequencyParam('Temel frekans.', 440),
  },
  causal: [{ param: 'frequency', dimension: 'pitch', direction: 1, note: 'f0 doğrudan.' }],
  determinism: DETERMINISTIC,
  resource: {
    model: 'O(kare)',
    workPerFrame: () => 3,
    stateBytes: () => 0,
  },
  render(out, params, ctx) {
    const wave = choiceOf(params, 'waveform') as TonalWave;
    const frequency = signalOf(params, 'frequency');
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const inc = sampleAt(frequency, i) / ctx.sampleRate;
      out[i] = getWaveSampleWithPhase(wave, phase, 0.5, inc);
      phase += inc;
      if (phase >= 1) phase -= 1;
    }
  },
};

export const NOISE: SourceEntry = {
  id: 'source.noise',
  kind: 'source',
  version: 1,
  description:
    'Seed’li gürültü kaynağı: beyaz, pembe (Kellet) ya da kahverengi (sızıntılı integral).',
  capabilities: ['noise', 'broadband', 'stochastic'],
  params: {
    color: {
      type: 'choice',
      choices: ['white', 'pink', 'brown'],
      default: 'white',
      description: 'Spektral eğim: düz, −3 dB/oct, −6 dB/oct.',
    },
  },
  causal: [],
  determinism: { stochastic: true, substreams: ['noise'] },
  resource: { model: 'O(kare)', workPerFrame: () => 3, stateBytes: () => 0 },
  render(out, params, ctx) {
    const color = choiceOf(params, 'color');
    const type = color === 'pink' ? 'pink' : color === 'brown' ? 'brown' : 'noise';
    const source = createNoiseSource(type, ctx.seed('noise'));
    for (let i = 0; i < out.length; i++) out[i] = source.next();
  },
};

export const BIQUAD: ProcessorEntry = {
  id: 'resonator.biquad',
  kind: 'resonator',
  version: 1,
  description:
    'RBJ biquad (alçak/yüksek/bant geçiren, çentik). Bant geçiren tepe kazancı Q, ' +
    'geçiş bandı kazancı 1. Otomasyonlu frekansta katsayılar %0.1 değişimde yenilenir.',
  capabilities: ['filter', 'resonant', 'time-varying'],
  params: {
    mode: {
      type: 'choice',
      choices: ['lowpass', 'highpass', 'bandpass', 'notch'],
      default: 'lowpass',
      description: 'Süzgeç tepkisi.',
    },
    frequency: frequencyParam('Kesim ya da merkez frekansı.', 1000),
    q: {
      type: 'number',
      unit: 'Q',
      min: 0.1,
      max: 40,
      default: 0.707,
      description: 'Kalite çarpanı; 0.707 Butterworth.',
    },
  },
  causal: [
    {
      param: 'frequency',
      dimension: 'brightness',
      direction: 1,
      note: 'Alçak/bant geçirende kesim yükseldikçe tiz enerji artar.',
    },
    {
      param: 'q',
      dimension: 'bandwidth',
      direction: -1,
      note: 'Q arttıkça geçiş bandı daralır, rezonans tepesi yükselir.',
    },
  ],
  determinism: DETERMINISTIC,
  resource: {
    model: 'O(kare)',
    workPerFrame: (_p, automated) => (automated.has('frequency') ? 8 : 2),
    stateBytes: () => 0,
  },
  process(buffer, params, ctx) {
    const filter = new BiquadFilter(
      ctx.sampleRate,
      choiceOf(params, 'mode') as FilterType,
      numberOf(params, 'q'),
    );
    const frequency = signalOf(params, 'frequency');
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = filter.process(buffer[i], sampleAt(frequency, i));
    }
  },
};

export const ENVELOPE: ProcessorEntry = {
  id: 'articulation.envelope',
  kind: 'articulation',
  version: 1,
  description:
    'AHDSR genlik zarfı (motorun `Envelope`u). Toplam süre katmanı aşarsa önce sustain, ' +
    'sonra bütün aşamalar orantılı kısalır.',
  capabilities: ['amplitude', 'deterministic'],
  params: {
    attack: seconds('Sıfırdan tepeye çıkış.', 0.005),
    hold: seconds('Tepede tutma.', 0),
    decay: seconds('Tepeden sustain seviyesine iniş.', 0.2),
    sustainLevel: unit('Sustain seviyesi (tepeye oran).', 0.6),
    sustain: seconds('Sustain süresi.', 0, 600),
    release: seconds('Sustain seviyesinden sıfıra iniş.', 0.2),
    curve: {
      type: 'choice',
      choices: ['linear', 'exponential', 'cosine'],
      default: 'exponential',
      description: 'Aşama eğrisi; `exponential` doygun (1 − 10^(−3t)) eğridir.',
    },
  },
  causal: [
    { param: 'attack', dimension: 'attack-time', direction: 1, note: 'Başlangıç yumuşar.' },
    { param: 'hold', dimension: 'duration', direction: 1, note: 'Tepe uzar.' },
    { param: 'decay', dimension: 'decay', direction: 1, note: 'İlk sönüm uzar.' },
    { param: 'sustainLevel', dimension: 'loudness', direction: 1, note: 'Gövde seviyesi.' },
    { param: 'sustain', dimension: 'duration', direction: 1, note: 'Gövde uzar.' },
    { param: 'release', dimension: 'release-time', direction: 1, note: 'Kuyruk uzar.' },
  ],
  determinism: DETERMINISTIC,
  resource: { model: 'O(kare)', workPerFrame: () => 3, stateBytes: () => 0 },
  process(buffer, params, ctx) {
    const envelope = new Envelope(
      {
        attack: numberOf(params, 'attack'),
        hold: numberOf(params, 'hold'),
        decay: numberOf(params, 'decay'),
        sustainLevel: numberOf(params, 'sustainLevel'),
        sustain: numberOf(params, 'sustain'),
        release: numberOf(params, 'release'),
        curve: choiceOf(params, 'curve') as Curve,
      },
      buffer.length / ctx.sampleRate,
    );
    for (let i = 0; i < buffer.length; i++) buffer[i] *= envelope.value(i / ctx.sampleRate);
  },
};

export const REVERB: EffectEntry = {
  id: 'effect.reverb',
  kind: 'effect',
  version: 1,
  description:
    'Schroeder/Freeverb tabanlı RT60 reverb: kafes allpass, enerji-normalize wet, wet DC ' +
    'engelleyici. Kuyruk program süresine sığmalı; sığmayan kuyruk kesilir.',
  capabilities: ['space', 'stereo', 'tail'],
  params: {
    decay: {
      type: 'number',
      unit: 's',
      min: 0.05,
      max: 30,
      default: 1.2,
      description: 'RT60: alçak frekans kuyruğunun 60 dB düşme süresi.',
    },
    roomSize: unit('Yankı yoğunluğu/modal aralık; RT60’ı değiştirmez.', 0.5),
    damp: unit('Tizlerin ek sönümü.', 0.5),
    preDelay: seconds('Ön gecikme.', 0, 0.5),
    amount: unit('Wet oranı (enerji-normalize).', 0.25),
  },
  causal: [
    { param: 'decay', dimension: 'decay', direction: 1, note: 'RT60 doğrudan.' },
    { param: 'roomSize', dimension: 'density', direction: -1, note: 'Uzun comb, seyrek yankı.' },
    { param: 'damp', dimension: 'brightness', direction: -1, note: 'Kuyruk koyulaşır.' },
    { param: 'preDelay', dimension: 'width', direction: 1, note: 'Kuru/ıslak ayrışır.' },
    { param: 'amount', dimension: 'wetness', direction: 1, note: 'Wet oranı.' },
  ],
  determinism: DETERMINISTIC,
  resource: {
    model: 'O(kare) + comb durumu',
    workPerFrame: () => 8,
    // İki kanal × sekiz comb (en uzun oda ölçeğinde ≈0.53 sn) + allpass + ön gecikme.
    stateBytes: (params, sampleRate) => 4 * sampleRate * (2 * Number(params.preDelay) + 1.2),
  },
  process(channels, params, ctx) {
    const reverb = new Reverb(
      {
        decay: numberOf(params, 'decay'),
        roomSize: numberOf(params, 'roomSize'),
        damp: numberOf(params, 'damp'),
        preDelay: numberOf(params, 'preDelay'),
        amount: numberOf(params, 'amount'),
      },
      ctx.sampleRate,
    );
    const [left, right] = channels;
    if (!right) {
      for (let i = 0; i < left.length; i++) left[i] = reverb.process(left[i]);
      return;
    }
    for (let i = 0; i < left.length; i++) {
      const [l, r] = reverb.processStereo(left[i], right[i]);
      left[i] = l;
      right[i] = r;
    }
  },
};

export const WAVE1_PRIMITIVES = [OSCILLATOR, NOISE, BIQUAD, ENVELOPE, REVERB] as const;
