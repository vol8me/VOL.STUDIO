import type { Random } from '@volstudio/core/random';
import { choiceOf, numberOf, sampleAt, signalOf, type ParamSignal } from '../params';
import type { SourceEntry } from '../registry';

/**
 * Deterministik mikro-olay motoru. Zamanlama zaman-yeniden-ölçekleme ile
 * yapılır: birikimli oran Λ(t) = ∫ rate dt her örnekte toplanır ve Λ bir
 * sonraki Exp(1) eşiğini geçtiğinde olay doğar. Böylece zamanla değişen
 * orana sahip Poisson süreci örnek-doğru ve O(kare) üretilir; oran sıfırsa
 * olay yoktur. Olay sayısı `MAX_EVENTS` ile sınırlıdır (bütçe) — sınırı
 * aşan olaylar deterministik olarak kesilir.
 */
export const MAX_EVENTS = 20000;

export interface MicroEvent {
  /** Katman başından örnek indeksi. */
  readonly frame: number;
  /** [−1, 1] boyut sapması (olay türü kendi ölçeğine çevirir). */
  readonly size: number;
  /** Doğrusal genlik çarpanı. */
  readonly gain: number;
}

export interface ScheduleOptions {
  readonly rate: ParamSignal;
  /** 0 → Poisson (üstel aralık), 1 → tam periyodik; arası karışım (ortalama aralık korunur). */
  readonly regularity: number;
  /** 0 → kümesiz; olay başına ortalama 8·clustering ek küme olayı (4–24 ms arayla). */
  readonly clustering: number;
  readonly sizeSpread: number;
  readonly levelSpread: number;
  readonly frames: number;
  readonly sampleRate: number;
}

const exponential = (random: Random) => -Math.log(1 - random.next());

/**
 * Olay zamanlarını ve varyasyonlarını üretir. Aralık (Λ biriminde)
 * r + (1 − r)·Exp(1): ortalama 1, sapma (1 − r) — `regularity` Poisson ile
 * periyodik arasında sürekli bir eksendir. İlk eşik rastgele fazla başlar.
 * Zamanlama ve varyasyon ayrı alt akışlardır; biri diğerini kaydırmaz.
 */
export function scheduleEvents(
  options: ScheduleOptions,
  timing: Random,
  variation: Random,
): MicroEvent[] {
  const { rate, regularity, clustering, frames, sampleRate } = options;
  const events: MicroEvent[] = [];
  const push = (frame: number) => {
    if (events.length >= MAX_EVENTS || frame >= frames) return;
    const size = options.sizeSpread * variation.bipolar();
    const gain = Math.pow(10, (-options.levelSpread * variation.next()) / 20);
    events.push({ frame, size, gain });
  };
  const interval = () => regularity + (1 - regularity) * exponential(timing);
  let accumulated = 0;
  let threshold = regularity * timing.next() + (1 - regularity) * exponential(timing);
  for (let i = 0; i < frames && events.length < MAX_EVENTS; i++) {
    accumulated += sampleAt(rate, i) / sampleRate;
    while (accumulated >= threshold && events.length < MAX_EVENTS) {
      push(i);
      const extra = Math.floor(exponential(timing) * clustering * 8);
      let at = i;
      for (let k = 0; k < extra; k++) {
        at += Math.round((0.004 + 0.02 * timing.next()) * sampleRate);
        push(at);
      }
      threshold += interval();
    }
  }
  return events.sort((a, b) => a.frame - b.frame);
}

/** Olay parametrelerinin ortak tanımı — mikro olay ve kabarcık nüfusu paylaşır. */
export const EVENT_PARAMS = {
  rate: {
    type: 'number',
    unit: 'per-second',
    min: 0,
    max: 2000,
    default: 20,
    automatable: true,
    description: 'Ortalama birincil olay sıklığı (küme olayları hariç).',
  },
  regularity: {
    type: 'number',
    unit: 'normalized',
    min: 0,
    max: 1,
    default: 0,
    description: 'Zamanlama: 0 Poisson (bağımsız), 1 tam periyodik.',
  },
  clustering: {
    type: 'number',
    unit: 'normalized',
    min: 0,
    max: 1,
    default: 0,
    description: 'Kümelenme: olay başına ortalama 8·clustering ek olay (4–24 ms arayla).',
  },
  sizeSpread: {
    type: 'number',
    unit: 'normalized',
    min: 0,
    max: 1,
    default: 0.3,
    description: 'Olaylar arası boyut/perde sapması.',
  },
  levelSpread: {
    type: 'number',
    unit: 'dB',
    min: 0,
    max: 24,
    default: 6,
    description: 'Olaylar arası seviye sapması (en çok bu kadar kısılır).',
  },
} as const;

export const EVENT_CAUSAL = [
  { param: 'rate', dimension: 'density', direction: 1, note: 'Daha çok olay.' },
  { param: 'regularity', dimension: 'irregularity', direction: -1, note: 'Düzenli aralık.' },
  { param: 'clustering', dimension: 'density', direction: 1, note: 'Kalabalık kümeler.' },
  { param: 'sizeSpread', dimension: 'irregularity', direction: 1, note: 'Boyut çeşitliliği.' },
  { param: 'levelSpread', dimension: 'irregularity', direction: 1, note: 'Seviye çeşitliliği.' },
] as const;

/** Maliyet modeli için birincil olay başına ortalama olay sayısı. */
export const clusterFactor = (clustering: number) => 1 + 8 * clustering;

export function scheduleFrom(
  params: Parameters<SourceEntry['render']>[1],
  frames: number,
  sampleRate: number,
  timing: Random,
  variation: Random,
): MicroEvent[] {
  return scheduleEvents(
    {
      rate: signalOf(params, 'rate'),
      regularity: numberOf(params, 'regularity'),
      clustering: numberOf(params, 'clustering'),
      sizeSpread: numberOf(params, 'sizeSpread'),
      levelSpread: numberOf(params, 'levelSpread'),
      frames,
      sampleRate,
    },
    timing,
    variation,
  );
}

/**
 * Tek olayı tampona TOPLAR: sönümlü sinüs `f` Hz, `decay` T60, başlangıçta
 * perde `chirp` oranında kayar. Sınır: olay tamponun sonunda kesilir.
 */
export function addGrain(
  out: Float32Array,
  start: number,
  gain: number,
  frequency: number,
  decaySeconds: number,
  chirp: number,
  sampleRate: number,
): number {
  const length = Math.min(out.length - start, Math.ceil(decaySeconds * sampleRate));
  const k = Math.log(1000) / (decaySeconds * sampleRate);
  let phase = 0;
  for (let n = 0; n < length; n++) {
    const t = n / sampleRate;
    const f = Math.min(frequency * (1 + chirp * t * 20), 0.45 * sampleRate);
    phase += (2 * Math.PI * f) / sampleRate;
    out[start + n] += gain * Math.exp(-k * n) * Math.sin(phase);
  }
  return Math.max(0, length);
}

const GRAIN = {
  click: { frequency: 3500, decay: 0.004, chirp: 0 },
  droplet: { frequency: 1400, decay: 0.03, chirp: 1.5 },
  pop: { frequency: 600, decay: 0.012, chirp: -0.3 },
} as const;

export const MICRO_EVENTS: SourceEntry = {
  id: 'source.micro-events',
  kind: 'source',
  version: 1,
  description:
    'Mikro olay kaynağı: tık/damla/yüzey patlaması tanecikleri oran + dağılım + tohumla ' +
    'zamanlanır (zamanla değişen oranlı Poisson, düzenli ya da kümeli). Her olay kısa, ' +
    'sönümlü ve (damlada) perdesi yükselen bir tanecik; boyut ve seviye tohumla sapar.',
  capabilities: ['events', 'stochastic', 'granular', 'time-varying'],
  params: {
    event: {
      type: 'choice',
      choices: ['click', 'droplet', 'pop'],
      default: 'click',
      description: 'Tanecik türü: kısa parlak tık, perdesi yükselen damla, pes patlama.',
    },
    ...EVENT_PARAMS,
    pitch: {
      type: 'number',
      unit: 'ratio',
      min: 0.25,
      max: 4,
      default: 1,
      description: 'Tanecik frekans çarpanı (türün temel frekansına).',
    },
  },
  causal: [
    ...EVENT_CAUSAL,
    { param: 'pitch', dimension: 'pitch', direction: 1, note: 'Tanecik frekansı.' },
  ],
  determinism: { stochastic: true, substreams: ['timing', 'variation'] },
  resource: {
    model: 'O(kare) + O(olay·tanecik)',
    // Olay başına en çok 30 ms tanecik × ~6 birim/örnek, küme çarpanıyla.
    workPerFrame: (p, automated) =>
      1 + automated.size + Number(p.rate) * clusterFactor(Number(p.clustering)) * 0.18,
    stateBytes: () => 0,
  },
  render(out, params, ctx) {
    const events = scheduleFrom(
      params,
      out.length,
      ctx.sampleRate,
      ctx.random('timing'),
      ctx.random('variation'),
    );
    const grain = GRAIN[choiceOf(params, 'event') as keyof typeof GRAIN];
    const pitch = numberOf(params, 'pitch');
    for (const event of events) {
      const frequency = grain.frequency * pitch * Math.pow(2, event.size);
      addGrain(out, event.frame, event.gain, frequency, grain.decay, grain.chirp, ctx.sampleRate);
    }
  },
};
