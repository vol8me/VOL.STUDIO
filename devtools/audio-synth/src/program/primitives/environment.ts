import { createNoiseSource } from '../../synthesis/noise';
import { gaussian, OrnsteinUhlenbeck, StateVariableFilter } from '../../synthesis/svf';
import { numberOf, sampleAt, signalOf } from '../params';
import type { SourceEntry } from '../registry';
import { addGrain, scheduleEvents } from './events';
import { addBubble } from './fluid';

/**
 * Çevresel prosedürel dokular: olay nüfusu + stokastik doku + spektral
 * hareket. Kısa döngü tekrarı yoktur: modülasyon çok ölçekli Ornstein–
 * Uhlenbeck süreçlerinden (periyodik değil), olaylar mikro-olay motorundan
 * gelir; ikisi de tohumlu ve deterministiktir. Uzak makine = `source.machine`
 * + alçak geçiren + reverb send; döküntü yatağı = `source.micro-events` ya da
 * `source.friction` (rolling) — ayrı yapı taşı açılmadı.
 */
function multiScale(tau: readonly number[], sampleRate: number, seedUniform: () => number) {
  const g = gaussian(seedUniform);
  const processes = tau.map((t) => new OrnsteinUhlenbeck(t, sampleRate, g));
  return (weights: readonly number[]) =>
    processes.reduce((sum, process, i) => sum + weights[i] * process.next(), 0);
}

export const WIND: SourceEntry = {
  id: 'source.wind',
  kind: 'source',
  version: 1,
  description:
    'Rüzgar: hız → seviye (U³) ve bant merkezi; üç ölçekli (0.4/3/12 sn × ölçek) OU esinti ' +
    'modülasyonu spektral hareket verir; engel ıslıkları Strouhal (0.2·U/d; d = 8/20/45 mm) ' +
    'dar bantlarıdır. Uzun render periyodik değildir.',
  capabilities: ['wind', 'ambience', 'texture', 'stochastic', 'time-varying'],
  params: {
    speed: {
      type: 'number',
      unit: 'm/s',
      min: 0,
      max: 40,
      default: 8,
      automatable: true,
      description: 'Ortalama rüzgar hızı.',
    },
    gustiness: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      description: 'Esinti modülasyonunun derinliği.',
    },
    gustScale: {
      type: 'number',
      unit: 'ratio',
      min: 0.25,
      max: 4,
      default: 1,
      description: 'Esinti zaman ölçeği çarpanı (büyük → yavaş dalgalanma).',
    },
    whistle: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.2,
      description: 'Engel ıslıklarının payı.',
    },
  },
  causal: [
    { param: 'speed', dimension: 'loudness', direction: 1, note: 'U³ ve tiz bant.' },
    { param: 'gustiness', dimension: 'irregularity', direction: 1, note: 'Dalgalanma.' },
    { param: 'gustScale', dimension: 'duration', direction: 1, note: 'Yavaş esinti.' },
    { param: 'whistle', dimension: 'roughness', direction: 1, note: 'Tonal ıslık.' },
  ],
  determinism: { stochastic: true, substreams: ['air', 'gust'] },
  resource: { model: 'O(kare) — 4 SVF + 3 OU', workPerFrame: () => 24, stateBytes: () => 256 },
  render(out, params, ctx) {
    const sr = ctx.sampleRate;
    const speed = signalOf(params, 'speed');
    const gustiness = numberOf(params, 'gustiness');
    const scale = numberOf(params, 'gustScale');
    const whistle = numberOf(params, 'whistle');
    const gustRandom = ctx.random('gust');
    const gust = multiScale([0.4 * scale, 3 * scale, 12 * scale], sr, () => gustRandom.next());
    const noise = createNoiseSource('pink', ctx.seed('air'));
    const body = new StateVariableFilter(sr);
    const edges = [0.008, 0.02, 0.045].map(() => new StateVariableFilter(sr));
    for (let i = 0; i < out.length; i++) {
      const g = gust([0.25, 0.45, 0.3]);
      const u = Math.max(0, sampleAt(speed, i) * (1 + gustiness * 0.6 * g));
      const level = Math.pow(u / 20, 1.5);
      const x = noise.next();
      let y = body.bandpass(x, Math.min(0.45 * sr, 120 + 45 * u), 0.5);
      [0.008, 0.02, 0.045].forEach((d, k) => {
        const f = Math.min(0.45 * sr, Math.max(60, (0.2 * u) / d));
        y += whistle * 0.35 * edges[k].bandpass(x, f, 35) * Math.sqrt(35);
      });
      out[i] = level * y;
    }
  },
};

export const RAIN: SourceEntry = {
  id: 'source.rain',
  kind: 'source',
  version: 1,
  description:
    'Yağmur: damla olay nüfusu (yoğunluk × OU değişkenliği) — sert yüzeyde kısa tık, suda ' +
    'Minnaert kabarcığı (`surface` karışımı) — ve uzak damlaların pembe hışırtı tabanı.',
  capabilities: ['rain', 'ambience', 'texture', 'events', 'fluid', 'stochastic'],
  params: {
    intensity: {
      type: 'number',
      unit: 'per-second',
      min: 5,
      max: 12000,
      default: 600,
      automatable: true,
      description: 'Yakın damla sıklığı.',
    },
    dropSize: {
      type: 'number',
      unit: 'mm',
      min: 0.5,
      max: 5,
      default: 2,
      description: 'Ortalama damla boyutu (tık rengi ve kabarcık yarıçapı).',
    },
    surface: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.4,
      description: '0 sert zemin (tık), 1 su yüzeyi (kabarcık).',
    },
    hiss: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.3,
      description: 'Uzak yağmur hışırtısı tabanı.',
    },
    variability: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.4,
      description: 'Yoğunluğun yavaş (OU) dalgalanması.',
    },
  },
  causal: [
    { param: 'intensity', dimension: 'density', direction: 1, note: 'Daha çok damla.' },
    { param: 'dropSize', dimension: 'pitch', direction: -1, note: 'Büyük damla pes.' },
    { param: 'surface', dimension: 'wetness', direction: 1, note: 'Kabarcıklı su.' },
    { param: 'hiss', dimension: 'noisiness', direction: 1, note: 'Hışırtı tabanı.' },
    { param: 'variability', dimension: 'irregularity', direction: 1, note: 'Dalgalanma.' },
  ],
  determinism: { stochastic: true, substreams: ['timing', 'variation', 'bed', 'swell'] },
  resource: {
    model: 'O(kare) + O(damla·tanecik)',
    workPerFrame: (p) => 10 + 0.4 * Math.min(12000, Number(p.intensity)) * 0.01,
    stateBytes: () => 128,
  },
  render(out, params, ctx) {
    const sr = ctx.sampleRate;
    const intensity = signalOf(params, 'intensity');
    const dropSize = numberOf(params, 'dropSize');
    const surface = numberOf(params, 'surface');
    const hiss = numberOf(params, 'hiss');
    const variability = numberOf(params, 'variability');
    const swellRandom = ctx.random('swell');
    const swell = multiScale([2, 9], sr, () => swellRandom.next());
    const rate = new Float32Array(out.length);
    const modulation = new Float32Array(out.length);
    for (let i = 0; i < out.length; i++) {
      modulation[i] = Math.max(0.05, 1 + variability * 0.5 * swell([0.5, 0.5]));
      rate[i] = sampleAt(intensity, i) * modulation[i];
    }
    const bed = createNoiseSource('pink', ctx.seed('bed'));
    const shaping = new StateVariableFilter(sr);
    for (let i = 0; i < out.length; i++) {
      out[i] = hiss * 0.15 * modulation[i] * shaping.highpass(bed.next(), 900);
    }
    const events = scheduleEvents(
      {
        rate,
        regularity: 0,
        clustering: 0.1,
        sizeSpread: 0.6,
        levelSpread: 18,
        frames: out.length,
        sampleRate: sr,
      },
      ctx.random('timing'),
      ctx.random('variation'),
    );
    const clickHz = 5200 / dropSize;
    for (const event of events) {
      const size = dropSize * Math.pow(2, event.size);
      if (surface < 1) {
        addGrain(
          out,
          event.frame,
          0.35 * (1 - surface) * event.gain,
          Math.min(0.4 * sr, clickHz * Math.pow(2, -event.size)),
          0.003,
          0,
          sr,
        );
      }
      if (surface > 0)
        addBubble(
          out,
          event.frame,
          Math.max(0.3, 0.4 * size),
          1,
          0.1,
          0.12 * surface * event.gain,
          sr,
        );
    }
  },
};

export const FIRE: SourceEntry = {
  id: 'source.fire',
  kind: 'source',
  version: 1,
  description:
    'Yanma: alçak türbülanslı uğultu (OU titreşimli), gaz tıslaması ve güç yasalı çatırtı ' +
    'olayları (Pareto α = 1.8; küçük çok, büyük az) — üçü ayrı ayrı ayarlanır.',
  capabilities: ['fire', 'ambience', 'texture', 'events', 'stochastic'],
  params: {
    intensity: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      automatable: true,
      description: 'Yanma şiddeti: uğultu seviyesi ve çatırtı sıklığı.',
    },
    crackle: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      description: 'Çatırtı yoğunluğu (2…400 /sn).',
    },
    roar: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      description: 'Alçak uğultu seviyesi.',
    },
    hiss: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.3,
      description: 'Gaz tıslaması.',
    },
    flicker: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      description: 'Alev titreşimi (uğultu modülasyon derinliği).',
    },
  },
  causal: [
    { param: 'intensity', dimension: 'loudness', direction: 1, note: 'Şiddet.' },
    { param: 'crackle', dimension: 'density', direction: 1, note: 'Çatırtı.' },
    { param: 'roar', dimension: 'low-end', direction: 1, note: 'Uğultu.' },
    { param: 'hiss', dimension: 'brightness', direction: 1, note: 'Tıslama.' },
    { param: 'flicker', dimension: 'irregularity', direction: 1, note: 'Titreşim.' },
  ],
  determinism: { stochastic: true, substreams: ['roar', 'flicker', 'timing', 'variation', 'size'] },
  resource: {
    model: 'O(kare) + O(olay)',
    workPerFrame: (p) => 16 + 4 * Number(p.crackle),
    stateBytes: () => 128,
  },
  render(out, params, ctx) {
    const sr = ctx.sampleRate;
    const intensity = signalOf(params, 'intensity');
    const crackle = numberOf(params, 'crackle');
    const roar = numberOf(params, 'roar');
    const hiss = numberOf(params, 'hiss');
    const flicker = numberOf(params, 'flicker');
    const flickerRandom = ctx.random('flicker');
    const wobble = multiScale([0.08, 0.6], sr, () => flickerRandom.next());
    const noise = createNoiseSource('noise', ctx.seed('roar'));
    const low = new StateVariableFilter(sr);
    const high = new StateVariableFilter(sr);
    for (let i = 0; i < out.length; i++) {
      const level = sampleAt(intensity, i);
      const f = Math.max(0, 1 + flicker * 0.7 * wobble([0.6, 0.4]));
      const x = noise.next();
      out[i] =
        level *
        (roar * 0.8 * f * low.lowpass(x, 180 + 220 * f) + hiss * 0.12 * high.highpass(x, 3500));
    }
    const rate = new Float32Array(out.length);
    for (let i = 0; i < out.length; i++)
      rate[i] = (2 + 398 * crackle * crackle) * sampleAt(intensity, i);
    const events = scheduleEvents(
      {
        rate,
        regularity: 0,
        clustering: 0.5,
        sizeSpread: 0.7,
        levelSpread: 0,
        frames: out.length,
        sampleRate: sr,
      },
      ctx.random('timing'),
      ctx.random('variation'),
    );
    const sizes = ctx.random('size');
    for (const event of events) {
      const size = Math.min(10, Math.pow(1 - sizes.next(), -1 / 1.8));
      const f = Math.min(0.4 * sr, 1800 * Math.pow(2, event.size) * (1.5 - Math.min(1, size / 6)));
      addGrain(out, event.frame, 0.08 * size, f, 0.002 + 0.004 * Math.min(1, size / 5), -0.2, sr);
    }
  },
};

export const ENVIRONMENT = [WIND, RAIN, FIRE] as const;
