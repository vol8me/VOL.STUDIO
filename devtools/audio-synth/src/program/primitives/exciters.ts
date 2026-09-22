import { createNoiseSource } from '../../synthesis/noise';
import { choiceOf, numberOf, sampleAt, signalOf } from '../params';
import type { ProcessorEntry, SourceEntry } from '../registry';
import { runModes } from './resonance';

/**
 * Exciter'lar enerjiyi verir, rengi rezonatör verir: aynı exciter modal,
 * boşluk ya da formant rezonatörüyle yeniden birleşir. Seviyeler birim
 * tepe ölçeğindedir; katman kazancı ve master seviyeyi ayrıca verir.
 */
const DETERMINISTIC = { stochastic: false, substreams: [] } as const;

export const IMPACT: SourceEntry = {
  id: 'exciter.impact',
  kind: 'exciter',
  version: 1,
  description:
    'Tek vuruş: temas süresi boyunca yükselen-kosinüs kuvvet darbesi (kısa temas → geniş ' +
    'bant, sert tokmak). `roughness` temas penceresine tohumlu gürültü katar (pürüzlü yüzey).',
  capabilities: ['impulsive', 'broadband', 'stochastic'],
  params: {
    contactTime: {
      type: 'number',
      unit: 's',
      min: 0.0001,
      max: 0.05,
      default: 0.002,
      description: 'Temas süresi; darbe spektrumu ≈ 1/contactTime civarında söner.',
    },
    roughness: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.2,
      description: 'Temas penceresindeki gürültü payı.',
    },
  },
  causal: [
    { param: 'contactTime', dimension: 'brightness', direction: -1, note: 'Uzun temas, yumuşak.' },
    { param: 'roughness', dimension: 'noisiness', direction: 1, note: 'Pürüzlü temas.' },
  ],
  determinism: { stochastic: true, substreams: ['grain'] },
  resource: { model: 'O(temas)', workPerFrame: () => 1, stateBytes: () => 0 },
  render(out, params, ctx) {
    const length = Math.max(2, Math.round(numberOf(params, 'contactTime') * ctx.sampleRate));
    const roughness = numberOf(params, 'roughness');
    const grain = ctx.random('grain');
    for (let i = 0; i < Math.min(length, out.length); i++) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / length);
      out[i] = window * (1 - roughness + roughness * grain.bipolar());
    }
  },
};

/**
 * Burkulan zar (timbal benzeri): her tetik gerilimle belirlenen frekansta
 * sönümlü bir tık üretir; tetik hızı otomasyon alır. Tıklar ortak bir
 * faz döndürücüden geçtiği için üst üste binen tetikler süreklidir.
 */
export const MEMBRANE: SourceEntry = {
  id: 'exciter.membrane',
  kind: 'exciter',
  version: 1,
  description:
    'Burkulan zar tetik dizisi (timbal/lastik zar): her tetik 300·2^(4·tension) Hz’de ' +
    'buckleDecay sürede sönen bir tık; rate tetik hızıdır (otomasyon alır).',
  capabilities: ['impulsive', 'periodic', 'time-varying'],
  params: {
    rate: {
      type: 'number',
      unit: 'per-second',
      min: 0.5,
      max: 400,
      default: 30,
      automatable: true,
      description: 'Tetik hızı.',
    },
    tension: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      automatable: true,
      description: 'Zar gerilimi → tık frekansı 300…4800 Hz.',
    },
    buckleDecay: {
      type: 'number',
      unit: 's',
      min: 0.0005,
      max: 0.05,
      default: 0.004,
      description: 'Tek tıkın T60 süresi.',
    },
  },
  causal: [
    { param: 'rate', dimension: 'density', direction: 1, note: 'Daha sık tetik.' },
    { param: 'tension', dimension: 'brightness', direction: 1, note: 'Tık frekansı yükselir.' },
    { param: 'buckleDecay', dimension: 'decay', direction: 1, note: 'Tık uzar.' },
  ],
  determinism: DETERMINISTIC,
  resource: {
    model: 'O(kare)',
    workPerFrame: (_p, automated) => (automated.has('tension') ? 14 : 6),
    stateBytes: () => 64,
  },
  render(out, params, ctx) {
    const rate = signalOf(params, 'rate');
    const tension = signalOf(params, 'tension');
    const pulses = new Float32Array(out.length);
    let phase = 1;
    for (let i = 0; i < out.length; i++) {
      if (phase >= 1) {
        phase -= 1;
        pulses[i] = 1;
      }
      phase += sampleAt(rate, i) / ctx.sampleRate;
    }
    const frequency =
      typeof tension === 'number'
        ? 300 * Math.pow(2, 4 * tension)
        : tension.map((t) => 300 * Math.pow(2, 4 * t));
    runModes(
      pulses,
      out,
      [{ ratio: 1, decayDivisor: 1, amplitude: 1 }],
      frequency,
      numberOf(params, 'buckleDecay'),
      ctx.sampleRate,
      'impulse',
    );
  },
};

export const TURBULENCE: SourceEntry = {
  id: 'exciter.turbulence',
  kind: 'exciter',
  version: 1,
  description:
    'Akış gürültüsü: basınç otomasyonu seviyeyi p^1.5 ile sürer (türbülans gürültüsü akış ' +
    'hızıyla hızla artar); brightness tek kutuplu alçak geçireni 200…12800 Hz arasında kaydırır.',
  capabilities: ['noise', 'breath', 'time-varying', 'stochastic'],
  params: {
    pressure: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      automatable: true,
      description: 'Akış basıncı.',
    },
    brightness: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      automatable: true,
      description: 'Gürültü bandının üst sınırı (log ölçek).',
    },
    color: {
      type: 'choice',
      choices: ['white', 'pink'],
      default: 'white',
      description: 'Kaynak gürültünün eğimi.',
    },
  },
  causal: [
    { param: 'pressure', dimension: 'loudness', direction: 1, note: 'p^1.5.' },
    { param: 'brightness', dimension: 'brightness', direction: 1, note: 'Kesim yükselir.' },
  ],
  determinism: { stochastic: true, substreams: ['turbulence'] },
  resource: {
    model: 'O(kare)',
    workPerFrame: (_p, automated) => 4 + 2 * automated.size,
    stateBytes: () => 0,
  },
  render(out, params, ctx) {
    const noise = createNoiseSource(
      choiceOf(params, 'color') === 'pink' ? 'pink' : 'noise',
      ctx.seed('turbulence'),
    );
    const pressure = signalOf(params, 'pressure');
    const brightness = signalOf(params, 'brightness');
    let lowpassed = 0;
    for (let i = 0; i < out.length; i++) {
      const cutoff = 200 * Math.pow(2, 6 * sampleAt(brightness, i));
      const alpha =
        1 - Math.exp((-2 * Math.PI * Math.min(cutoff, 0.45 * ctx.sampleRate)) / ctx.sampleRate);
      lowpassed += alpha * (noise.next() - lowpassed);
      out[i] = Math.pow(sampleAt(pressure, i), 1.5) * lowpassed;
    }
  },
};

export const AMPLITUDE: ProcessorEntry = {
  id: 'articulation.amplitude',
  kind: 'articulation',
  version: 1,
  description:
    'Gesture ile sürülen genlik (dB): basınç/nefes/artikülasyon eğrisi ya da shimmer ' +
    'modülasyonu buraya bağlanır. Zarf şekli ayrı bir düğüm değil, eğrinin kendisidir.',
  capabilities: ['amplitude', 'time-varying'],
  params: {
    level: {
      type: 'number',
      unit: 'dB',
      min: -80,
      max: 12,
      default: 0,
      automatable: true,
      description: 'Anlık kazanç.',
    },
  },
  causal: [{ param: 'level', dimension: 'loudness', direction: 1, note: 'dB doğrudan.' }],
  determinism: DETERMINISTIC,
  resource: {
    model: 'O(kare)',
    workPerFrame: (_p, automated) => (automated.size > 0 ? 4 : 1),
    stateBytes: () => 0,
  },
  process(buffer, params) {
    const level = signalOf(params, 'level');
    if (typeof level === 'number') {
      const gain = Math.pow(10, level / 20);
      for (let i = 0; i < buffer.length; i++) buffer[i] *= gain;
      return;
    }
    for (let i = 0; i < buffer.length; i++) buffer[i] *= Math.pow(10, level[i] / 20);
  },
};

export const EXCITERS = [IMPACT, MEMBRANE, TURBULENCE] as const;
