import { createNoiseSource } from '../../synthesis/noise';
import { StateVariableFilter } from '../../synthesis/svf';
import { choiceOf, numberOf } from '../params';
import type { SourceEntry } from '../registry';
import { runModes } from './resonance';

/**
 * Basınç/patlama ailesi — tek bir gürültü patlaması "patlama motoru"
 * değildir. İki ayrı yapı taşı ve ayrı katmanlar:
 *
 * - `source.pressure-wave`: Friedlander dalgası p(t) = (1 − t/t⁺)·e^(−b·t/t⁺)
 *   (Friedlander 1946; Kinney & Graham "Explosive Shocks in Air"): pozitif
 *   faz t⁺, ardından negatif emme fazı. Şok cephesinin yükselme süresi
 *   (`rise`) TRANSIENT'i, alçak frekans gövde rezonansı (`body`, zemin/yapı
 *   tepkisi) LOW-END'i ayrı ayrı kontrol eder — biri diğerini değiştirmez.
 * - `source.blast`: türbülanslı patlama gürültüsü; bant zamanla kararır ve
 *   seyrek çatırtılar içerir.
 */
export function friedlander(t: number, positive: number, decay: number): number {
  if (t < 0) return 0;
  const x = t / positive;
  return (1 - x) * Math.exp(-decay * x);
}

export const PRESSURE_WAVE: SourceEntry = {
  id: 'source.pressure-wave',
  kind: 'source',
  version: 1,
  description:
    'Friedlander basınç dalgası (pozitif faz + negatif emme) ve ayrı alçak frekans gövde ' +
    'rezonansı. `rise` şok cephesini yumuşatır (transient), `body`/`bodyHz` gövdeyi sürer ' +
    '(low-end); iki eksen bağımsızdır.',
  capabilities: ['pressure-wave', 'impulsive', 'low-end', 'physical'],
  params: {
    positive: {
      type: 'number',
      unit: 's',
      min: 0.001,
      max: 0.25,
      default: 0.02,
      description: 'Pozitif faz süresi t⁺ (büyük patlama → uzun).',
    },
    decay: {
      type: 'number',
      unit: 'ratio',
      min: 0.2,
      max: 6,
      default: 1.5,
      description: 'Friedlander sönüm katsayısı b (küçük → derin negatif faz).',
    },
    rise: {
      type: 'number',
      unit: 's',
      min: 0,
      max: 0.01,
      default: 0.0003,
      description: 'Şok cephesi yükselme süresi (0 ideal şok, geniş bant).',
    },
    body: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      description: 'Alçak frekans gövde rezonansının seviyesi.',
    },
    bodyHz: {
      type: 'number',
      unit: 'Hz',
      min: 20,
      max: 250,
      default: 48,
      belowNyquist: true,
      description: 'Gövde rezonansı frekansı.',
    },
    bodyDecay: {
      type: 'number',
      unit: 's',
      min: 0.05,
      max: 4,
      default: 0.7,
      description: 'Gövde rezonansının T60 süresi.',
    },
  },
  causal: [
    { param: 'positive', dimension: 'low-end', direction: 1, note: 'Uzun pozitif faz, pes.' },
    { param: 'decay', dimension: 'duration', direction: -1, note: 'Emme fazı kısalır.' },
    { param: 'rise', dimension: 'transient', direction: -1, note: 'Yumuşak şok cephesi.' },
    { param: 'body', dimension: 'low-end', direction: 1, note: 'Gövde seviyesi.' },
    { param: 'bodyHz', dimension: 'pitch', direction: 1, note: 'Gövde perdesi.' },
    { param: 'bodyDecay', dimension: 'decay', direction: 1, note: 'Gövde çınlaması.' },
  ],
  determinism: { stochastic: false, substreams: [] },
  resource: { model: 'O(kare)', workPerFrame: () => 8, stateBytes: () => 64 },
  render(out, params, ctx) {
    const positive = numberOf(params, 'positive');
    const decay = numberOf(params, 'decay');
    const rise = numberOf(params, 'rise');
    const sr = ctx.sampleRate;
    const span = Math.min(out.length, Math.ceil((positive * (1 + 12 / decay) + rise) * sr));
    const riseFrames = Math.round(rise * sr);
    for (let i = 0; i < span; i++) {
      out[i] =
        i < riseFrames
          ? 0.5 - 0.5 * Math.cos((Math.PI * i) / riseFrames)
          : friedlander((i - riseFrames) / sr, positive, decay);
    }
    const body = numberOf(params, 'body');
    if (body <= 0) return;
    const drive = new Float32Array(out.length);
    const kick = Math.max(2, Math.round(positive * sr));
    for (let i = 0; i < Math.min(kick, drive.length); i++) {
      drive[i] = (body * Math.sin((Math.PI * i) / kick)) / kick;
    }
    runModes(
      drive,
      out,
      [
        { ratio: 1, decayDivisor: 1, amplitude: 6 },
        { ratio: 1.52, decayDivisor: 1.6, amplitude: 2 },
      ],
      numberOf(params, 'bodyHz'),
      numberOf(params, 'bodyDecay'),
      sr,
      'impulse',
    );
  },
};

export const BLAST: SourceEntry = {
  id: 'source.blast',
  kind: 'source',
  version: 1,
  description:
    'Türbülanslı patlama gürültüsü: anlık atak, üstel sönüm; bant geçiren merkez `brightness`tan ' +
    'başlar ve `darkening` oranında pes tarafa kayar (ateş topunun soğuması), seyrek çatırtılar ' +
    'eklenir. Transient ve gövdeden ayrı katmandır.',
  capabilities: ['blast', 'noise', 'explosion', 'stochastic', 'time-varying'],
  params: {
    decay: {
      type: 'number',
      unit: 's',
      min: 0.05,
      max: 8,
      default: 0.9,
      description: 'Seviyenin −60 dB süresi.',
    },
    brightness: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.6,
      description: 'Başlangıç bant merkezi (150 Hz · 2^(6·b)).',
    },
    darkening: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.6,
      description: 'Sönüm boyunca merkezin kaç oktav (×4) pesleştiği.',
    },
    crackle: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.3,
      description: 'Seyrek çatırtı darbelerinin yoğunluğu.',
    },
    color: {
      type: 'choice',
      choices: ['white', 'pink'],
      default: 'pink',
      description: 'Kaynak gürültünün eğimi.',
    },
  },
  causal: [
    { param: 'decay', dimension: 'decay', direction: 1, note: 'Uzun kuyruk.' },
    { param: 'brightness', dimension: 'brightness', direction: 1, note: 'Tiz başlangıç.' },
    { param: 'darkening', dimension: 'brightness', direction: -1, note: 'Kuyruk kararır.' },
    { param: 'crackle', dimension: 'density', direction: 1, note: 'Daha çok çatırtı.' },
  ],
  determinism: { stochastic: true, substreams: ['blast', 'crackle'] },
  resource: { model: 'O(kare)', workPerFrame: () => 12, stateBytes: () => 64 },
  render(out, params, ctx) {
    const sr = ctx.sampleRate;
    const decay = numberOf(params, 'decay');
    const start = 150 * Math.pow(2, 6 * numberOf(params, 'brightness'));
    const darkening = numberOf(params, 'darkening');
    const crackle = numberOf(params, 'crackle');
    const noise = createNoiseSource(
      choiceOf(params, 'color') === 'white' ? 'noise' : 'pink',
      ctx.seed('blast'),
    );
    const sparks = ctx.random('crackle');
    const filter = new StateVariableFilter(sr);
    const k = Math.log(1000) / (decay * sr);
    for (let i = 0; i < out.length; i++) {
      const progress = Math.min(1, i / (decay * sr));
      const center = start * Math.pow(2, -2 * darkening * progress);
      const envelope = Math.exp(-k * i) * (i < 0.002 * sr ? i / (0.002 * sr) : 1);
      let x = noise.next();
      if (sparks.next() < (crackle * 400 * (1 - progress)) / sr) x += 6 * sparks.bipolar();
      out[i] = envelope * filter.bandpass(x, center, 0.7);
    }
  },
};
