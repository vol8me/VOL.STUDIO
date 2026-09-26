import { createNoiseSource } from '../../synthesis/noise';
import { gaussian, OrnsteinUhlenbeck, StateVariableFilter } from '../../synthesis/svf';
import { numberOf, sampleAt, signalOf } from '../params';
import type { SourceEntry } from '../registry';
import { addBubble } from './fluid';
import { addBurst, addGrain, scheduleEvents } from './events';

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
  version: 2,
  description:
    'Rüzgar: hız → seviye (U³) ve gövde bant merkezi; üç ölçekli (0.4/3/12 sn × ölçek) OU esinti ' +
    'modülasyonu spektral hareket verir; esinti açtıkça ikinci parlak bant (≈1–4 kHz) devreye ' +
    'girer, engel ıslıkları ince cisimlerin Aeolian tonlarıdır (Strouhal 0.2·U/d; d = 1.5/4/12 mm). ' +
    'Uzun render periyodik değildir.',
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
    const bright = new StateVariableFilter(sr);
    const edges = [0.0015, 0.004, 0.012].map(() => new StateVariableFilter(sr));
    for (let i = 0; i < out.length; i++) {
      const g = gust([0.25, 0.45, 0.3]);
      const u = Math.max(0, sampleAt(speed, i) * (1 + gustiness * 0.6 * g));
      const level = Math.pow(u / 20, 1.5);
      const x = noise.next();
      let y = body.bandpass(x, Math.min(0.45 * sr, 160 + 55 * u), 0.55);
      // Esinti türbülansı üst bandı açar — sükunette yalnız alçak uğultu kalır.
      const openness = Math.min(1, Math.max(0, u - 3) / 12);
      y += 0.5 * openness * bright.bandpass(x, Math.min(0.42 * sr, 900 + 260 * u), 0.8);
      [0.0015, 0.004, 0.012].forEach((d, k) => {
        const f = Math.min(0.45 * sr, Math.max(60, (0.2 * u) / d));
        y += whistle * 0.3 * edges[k].bandpass(x, f, 35) * Math.sqrt(35);
      });
      out[i] = 1.3 * level * y;
    }
  },
};

export const RAIN: SourceEntry = {
  id: 'source.rain',
  kind: 'source',
  version: 2,
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
      default: 150,
      automatable: true,
      description: 'Yakın damla sıklığı (tek tek seçilebilir tıklar; uzak yığın `hiss`).',
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
      default: 0.22,
      description: '0 sert zemin (tık), 1 su yüzeyi (kabarcık).',
    },
    hiss: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.2,
      description: 'Uzak yağmur hışırtısı tabanı (orta bant yıkama).',
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
  determinism: {
    stochastic: true,
    substreams: ['timing', 'variation', 'bed', 'swell', 'tick'],
  },
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
    const bedHp = new StateVariableFilter(sr);
    const bedLp = new StateVariableFilter(sr);
    for (let i = 0; i < out.length; i++) {
      // Uzak yığın: orta bant yıkama (600 Hz–5.5 kHz); tiz cızırtı yok.
      const x = bedLp.lowpass(bedHp.highpass(bed.next(), 600), 5500);
      out[i] = hiss * 0.13 * modulation[i] * x;
    }
    const events = scheduleEvents(
      {
        rate,
        regularity: 0,
        clustering: 0.1,
        sizeSpread: 0.6,
        levelSpread: 12,
        frames: out.length,
        sampleRate: sr,
      },
      ctx.random('timing'),
      ctx.random('variation'),
    );
    // Sert yüzey tıkı genişbant darbedir (Franz 1959: keskin darbe + ancak su
    // yüzeyinde Minnaert kabarcığı); tonal sönümlü sinüs damlacık/baloncuk gibi
    // duyulur — bu yüzden `addBurst`.
    const tickHz = 5200 / dropSize;
    const ticks = ctx.random('tick');
    for (const event of events) {
      const size = dropSize * Math.pow(2, event.size);
      if (surface < 1) {
        addBurst(
          out,
          event.frame,
          0.42 * (1 - surface) * event.gain,
          Math.min(0.4 * sr, tickHz * Math.pow(2, -event.size)),
          0.0018 + 0.0015 * Math.max(0, event.size),
          ticks,
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
          0.09 * surface * event.gain,
          sr,
        );
    }
  },
};

export const FIRE: SourceEntry = {
  id: 'source.fire',
  kind: 'source',
  version: 2,
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
      description: 'Çatırtı yoğunluğu (~2…60 /sn; kamp ateşinde seçilebilir şaklar).',
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
      default: 0.22,
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
  determinism: {
    stochastic: true,
    substreams: ['roar', 'flicker', 'timing', 'variation', 'size', 'crackle'],
  },
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
        (roar * 0.8 * f * low.lowpass(x, 180 + 220 * f) + hiss * 0.1 * high.highpass(x, 3500));
    }
    const rate = new Float32Array(out.length);
    for (let i = 0; i < out.length; i++)
      rate[i] = (1.5 + 58 * crackle * crackle) * sampleAt(intensity, i);
    const events = scheduleEvents(
      {
        rate,
        regularity: 0,
        clustering: 0.35,
        sizeSpread: 0.7,
        levelSpread: 6,
        frames: out.length,
        sampleRate: sr,
      },
      ctx.random('timing'),
      ctx.random('variation'),
    );
    const sizes = ctx.random('size');
    const burst = ctx.random('crackle');
    for (const event of events) {
      const size = Math.min(10, Math.pow(1 - sizes.next(), -1 / 1.8));
      // Gerçek çatırtı genişbant basınç darbesidir (Chadwick & James 2011);
      // sönümlü sinüs baloncuk/damla gibi duyulur. Büyük patlama pes, küçük
      // çatırtı tiz: gövde ~700 Hz → ~5 kHz.
      const body = Math.min(0.35 * sr, 700 * Math.pow(2, Math.min(1.6, (size - 1) / 3.8)));
      addBurst(
        out,
        event.frame,
        0.18 * Math.min(size, 7) * event.gain,
        body,
        0.003 + 0.012 * Math.min(1, size / 8),
        burst,
        sr,
        3.5,
      );
      // Büyük patlamalar odun boşluğu rezonansını uyandırır — zayıf, kısa,
      // alçak mod kuyruğu şaklamaya gövde verir (baloncuksuz, genişbantın altında).
      if (size > 2.5)
        addGrain(
          out,
          event.frame,
          0.05 * Math.min(1, size / 8) * event.gain,
          350 + 120 * Math.min(3, size - 2.5),
          0.018 + 0.01 * Math.min(1, size / 8),
          -0.15,
          sr,
        );
    }
  },
};

export const ENVIRONMENT = [WIND, RAIN, FIRE] as const;
