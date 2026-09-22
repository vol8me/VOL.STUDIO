import type { Random } from '@volstudio/core/random';
import { numberOf, signalOf } from '../params';
import type { CostParams, SourceEntry } from '../registry';
import { clusterFactor, EVENT_CAUSAL, EVENT_PARAMS, scheduleEvents, scheduleFrom } from './events';

/**
 * Kabarcık akustiği — yaklaşımlar ve geçerlik alanı:
 *
 * - Minnaert rezonansı: f₀ = (1/2πR)·√(3γp₀/ρ). Hava (γ = 1.4), deniz
 *   seviyesi (p₀ = 101325 Pa), su (ρ = 998 kg/m³) → f₀·R ≈ 3.29 m/s
 *   (R = 1 mm → ≈ 3.3 kHz). Yüzey gerilimi ve ısıl etkiler ihmal edilir;
 *   R ≲ 0.1 mm'de gerçek frekans bundan yüksektir — aralık 0.1–20 mm.
 * - Sönüm ve yükselen perde: van den Doel (2005, "Physically based models
 *   for liquid sounds"): d = 0.13·f₀ + 0.0072·f₀^1.5 (1/sn; viskoz +
 *   ışınım + ısıl sönümün uydurması), f(t) = f₀·(1 + ξ·d·t), ξ ≈ 0.1.
 *   `damping` bu d'yi ölçekler (viskozite benzeri kontrol).
 * - Genlik ∝ √(R / 1 mm): büyük kabarcık daha yüksek — FİZİKSEL DEĞİL,
 *   nüfus karışımı için seçilmiş sezgisel ölçek.
 */
const MINNAERT = Math.sqrt((3 * 1.4 * 101325) / 998) / (2 * Math.PI);
const MAX_BUBBLE_SECONDS = 2;

export function minnaertFrequency(radiusMm: number): number {
  return MINNAERT / (radiusMm * 1e-3);
}

export function bubbleDamping(frequency: number, scale: number): number {
  return scale * (0.13 * frequency + 0.0072 * Math.pow(frequency, 1.5));
}

/** Kabarcığın −60 dB'ye inme süresi (sn), `MAX_BUBBLE_SECONDS` ile sınırlı. */
export function bubbleSeconds(radiusMm: number, damping: number): number {
  return Math.min(
    MAX_BUBBLE_SECONDS,
    Math.log(1000) / bubbleDamping(minnaertFrequency(radiusMm), damping),
  );
}

/** Tek kabarcığı `out[start…]`a TOPLAR; Nyquist'i aşan kısım susturulur. */
export function addBubble(
  out: Float32Array,
  start: number,
  radiusMm: number,
  damping: number,
  rise: number,
  gain: number,
  sampleRate: number,
): void {
  const f0 = minnaertFrequency(radiusMm);
  const d = bubbleDamping(f0, damping);
  const length = Math.min(
    out.length - start,
    Math.ceil(bubbleSeconds(radiusMm, damping) * sampleRate),
  );
  const amplitude = gain * Math.sqrt(radiusMm);
  let phase = 0;
  for (let n = 0; n < length; n++) {
    const t = n / sampleRate;
    const f = f0 * (1 + rise * d * t);
    if (f >= 0.45 * sampleRate) break;
    phase += (2 * Math.PI * f) / sampleRate;
    out[start + n] += amplitude * Math.exp(-d * t) * Math.sin(phase);
  }
}

const radius = {
  type: 'number',
  unit: 'mm',
  min: 0.1,
  max: 20,
  default: 2,
  description: 'Kabarcık yarıçapı (Minnaert: f₀ ≈ 3.29/R Hz·m).',
} as const;
const damping = {
  type: 'number',
  unit: 'ratio',
  min: 0.25,
  max: 8,
  default: 1,
  description: 'Sönüm çarpanı (viskozite benzeri): van den Doel d’sini ölçekler.',
} as const;
const rise = {
  type: 'number',
  unit: 'ratio',
  min: 0,
  max: 0.5,
  default: 0.1,
  description: 'Yükselen perde katsayısı ξ: f(t) = f₀(1 + ξ·d·t).',
} as const;

const bubbleCausal = [
  { param: 'radius', dimension: 'pitch', direction: -1, note: 'Minnaert: f₀ ∝ 1/R.' },
  { param: 'damping', dimension: 'decay', direction: -1, note: 'Kuyruk kısalır.' },
  { param: 'rise', dimension: 'pitch', direction: 1, note: 'Perde yukarı kayar.' },
] as const;

const grainWork = (p: CostParams) =>
  bubbleSeconds(
    Number(p.radius) * Math.pow(2, 1.5 * Number(p.sizeSpread ?? 0)),
    Number(p.damping),
  ) * 8;

export const BUBBLE: SourceEntry = {
  id: 'source.bubble',
  kind: 'source',
  version: 1,
  description:
    'Tek kabarcık (katman başında): Minnaert rezonansında, van den Doel sönümüyle azalan ve ' +
    'yükselirken perdesi artan sinüs. Yaklaşım ve geçerlik alanı DESIGN "Biyolojik yapı taşları".',
  capabilities: ['fluid', 'pitched', 'physical'],
  params: { radius, damping, rise },
  causal: bubbleCausal,
  determinism: { stochastic: false, substreams: [] },
  resource: { model: 'O(kabarcık süresi)', workPerFrame: () => 2, stateBytes: () => 0 },
  render(out, params, ctx) {
    addBubble(
      out,
      0,
      numberOf(params, 'radius'),
      numberOf(params, 'damping'),
      numberOf(params, 'rise'),
      1,
      ctx.sampleRate,
    );
  },
};

export const BUBBLES: SourceEntry = {
  id: 'source.bubbles',
  kind: 'source',
  version: 1,
  description:
    'Kabarcık nüfusu: mikro-olay motoruyla zamanlanan kabarcıklar; her birinin yarıçapı ' +
    'medyan etrafında 2^(±1.5·sizeSpread) içinde tohumla sapar.',
  capabilities: ['fluid', 'events', 'stochastic', 'time-varying'],
  params: { ...EVENT_PARAMS, radius, damping, rise },
  causal: [...EVENT_CAUSAL, ...bubbleCausal],
  determinism: { stochastic: true, substreams: ['timing', 'variation'] },
  resource: {
    model: 'O(kare) + O(olay·kabarcık süresi)',
    workPerFrame: (p) => 2 + Number(p.rate) * clusterFactor(Number(p.clustering)) * grainWork(p),
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
    const median = numberOf(params, 'radius');
    const d = numberOf(params, 'damping');
    const r = numberOf(params, 'rise');
    for (const event of events) {
      const size = Math.min(20, Math.max(0.1, median * Math.pow(2, 1.5 * event.size)));
      addBubble(out, event.frame, size, d, r, event.gain, ctx.sampleRate);
    }
  },
};

function glugs(
  out: Float32Array,
  pulses: readonly number[],
  random: Random,
  params: Parameters<SourceEntry['render']>[1],
  sampleRate: number,
): void {
  const median = numberOf(params, 'radius');
  const d = numberOf(params, 'damping');
  const r = numberOf(params, 'rise');
  const count = numberOf(params, 'bubblesPerPulse');
  for (const start of pulses) {
    addBubble(out, start, Math.min(20, median * 3), d, r * 0.5, 1, sampleRate);
    for (let k = 0; k < count; k++) {
      const at = start + Math.round((0.005 + 0.06 * random.next()) * sampleRate);
      if (at >= out.length) continue;
      const size = Math.min(20, Math.max(0.1, median * Math.pow(2, random.bipolar())));
      addBubble(out, at, size, d, r, 0.3 + 0.7 * random.next(), sampleRate);
    }
  }
}

export const GURGLE: SourceEntry = {
  id: 'source.gurgle',
  kind: 'source',
  version: 1,
  description:
    'Akışkan nabzı/fokurtu: düzenliye yakın basınç nabızları; her nabız büyük bir “glug” ' +
    'kabarcığı ve ardından 5–65 ms içinde küçük kabarcık kümesi bırakır.',
  capabilities: ['fluid', 'events', 'stochastic', 'rhythmic'],
  params: {
    pulseRate: {
      type: 'number',
      unit: 'per-second',
      min: 0.2,
      max: 12,
      default: 3,
      automatable: true,
      description: 'Nabız sıklığı.',
    },
    bubblesPerPulse: {
      type: 'number',
      unit: 'count',
      min: 0,
      max: 32,
      default: 6,
      integer: true,
      description: 'Nabız başına küçük kabarcık.',
    },
    radius,
    damping,
    rise,
  },
  causal: [
    { param: 'pulseRate', dimension: 'density', direction: 1, note: 'Sık nabız.' },
    { param: 'bubblesPerPulse', dimension: 'density', direction: 1, note: 'Kalabalık küme.' },
    ...bubbleCausal,
  ],
  determinism: { stochastic: true, substreams: ['pulses', 'pulse-variation', 'cluster'] },
  resource: {
    model: 'O(kare) + O(nabız·kabarcık)',
    workPerFrame: (p) =>
      2 +
      Number(p.pulseRate) *
        (1 + Number(p.bubblesPerPulse)) *
        bubbleSeconds(Number(p.radius) * 3, Number(p.damping)) *
        8,
    stateBytes: () => 0,
  },
  render(out, params, ctx) {
    const pulseRate = signalOf(params, 'pulseRate');
    const pulses = scheduleEvents(
      {
        rate: pulseRate,
        regularity: 0.7,
        clustering: 0,
        sizeSpread: 0,
        levelSpread: 0,
        frames: out.length,
        sampleRate: ctx.sampleRate,
      },
      ctx.random('pulses'),
      ctx.random('pulse-variation'),
    ).map((e) => e.frame);
    glugs(out, pulses, ctx.random('cluster'), params, ctx.sampleRate);
  },
};

export const FLUIDS = [BUBBLE, BUBBLES, GURGLE] as const;
