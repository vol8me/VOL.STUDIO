import type { Random } from '@volstudio/core/random';
import { numberOf, sampleAt, signalOf } from '../params';
import type { ModulatorEntry } from '../registry';

/**
 * Korelasyonlu stokastik modülasyon. Her modülatör programda ADIYLA tanımlanır
 * ve `modulator:<ad>/<etiket>` alt akışını kullanır: yeni bir modülatör ya da
 * stokastik katman eklemek mevcut akışların dizisini kaydırmaz. Aynı
 * modülatöre bağlanan parametreler aynı sinyali görür (korelasyonlu).
 * Çıkış normalize ve sınırlıdır: [−1, 1].
 */
function gaussian(random: Random): number {
  const u = Math.max(1e-12, random.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random.next());
}

const rate = (description: string, min: number, max: number, fallback: number) =>
  ({
    type: 'number',
    unit: 'per-second',
    min,
    max,
    default: fallback,
    description,
  }) as const;

export const DRIFT: ModulatorEntry = {
  id: 'modulator.drift',
  kind: 'modulator',
  version: 1,
  description:
    'Yumuşak sürüklenme: `rate` sıklığındaki rastgele düğümler arasında smoothstep ara ' +
    'değer (C1). Yavaş perde/tını kayması için.',
  capabilities: ['stochastic', 'smooth', 'bounded'],
  params: { rate: rate('Düğüm sıklığı.', 0.01, 20, 0.5) },
  causal: [{ param: 'rate', dimension: 'irregularity', direction: 1, note: 'Daha hızlı kayma.' }],
  determinism: { stochastic: true, substreams: ['knots'] },
  resource: { model: 'O(kare)', workPerFrame: () => 2, stateBytes: () => 0 },
  render(out, params, ctx) {
    const knots = ctx.random('knots');
    const step = ctx.sampleRate / numberOf(params, 'rate');
    let a = knots.bipolar();
    let b = knots.bipolar();
    let next = step;
    for (let i = 0; i < out.length; i++) {
      while (i >= next) {
        a = b;
        b = knots.bipolar();
        next += step;
      }
      const u = 1 - (next - i) / step;
      out[i] = a + (b - a) * u * u * (3 - 2 * u);
    }
  },
};

export const WALK: ModulatorEntry = {
  id: 'modulator.walk',
  kind: 'modulator',
  version: 1,
  description:
    'Ortalamaya dönen rastgele yürüyüş (Ornstein–Uhlenbeck, Euler–Maruyama): durağan ' +
    'standart sapma ≈ volatility/2; çıkış tanh ile [−1, 1] içinde tutulur.',
  capabilities: ['stochastic', 'mean-reverting', 'bounded'],
  params: {
    reversion: rate('Ortalamaya dönüş hızı θ (1/sn).', 0.05, 50, 2),
    volatility: {
      type: 'number',
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
      description: 'Durağan sapma (tanh öncesi).',
    },
  },
  causal: [
    {
      param: 'reversion',
      dimension: 'irregularity',
      direction: 1,
      note: 'Kısa korelasyon süresi.',
    },
    { param: 'volatility', dimension: 'irregularity', direction: 1, note: 'Büyük sapma.' },
  ],
  determinism: { stochastic: true, substreams: ['walk'] },
  resource: { model: 'O(kare)', workPerFrame: () => 8, stateBytes: () => 0 },
  render(out, params, ctx) {
    const random = ctx.random('walk');
    const theta = numberOf(params, 'reversion');
    const target = numberOf(params, 'volatility') / 2;
    const dt = 1 / ctx.sampleRate;
    const sigma = target * Math.sqrt(2 * theta);
    let x = 0;
    for (let i = 0; i < out.length; i++) {
      x += -theta * x * dt + sigma * Math.sqrt(dt) * gaussian(random);
      out[i] = Math.tanh(x);
    }
  },
};

export const SAMPLE_GLIDE: ModulatorEntry = {
  id: 'modulator.sample-glide',
  kind: 'modulator',
  version: 1,
  description:
    'Örnekle-kaydır: `rate` sıklığında yeni rastgele hedef; değer hedefe `glide` zaman ' +
    'sabitiyle üstel yaklaşır (basamak yok).',
  capabilities: ['stochastic', 'stepped', 'bounded'],
  params: {
    rate: rate('Yeni hedef sıklığı.', 0.05, 50, 4),
    glide: {
      type: 'number',
      unit: 's',
      min: 0.001,
      max: 2,
      default: 0.05,
      description: 'Yaklaşma zaman sabiti.',
    },
  },
  causal: [
    { param: 'rate', dimension: 'irregularity', direction: 1, note: 'Daha sık sıçrama.' },
    { param: 'glide', dimension: 'irregularity', direction: -1, note: 'Yavaş geçiş.' },
  ],
  determinism: { stochastic: true, substreams: ['targets'] },
  resource: { model: 'O(kare)', workPerFrame: () => 2, stateBytes: () => 0 },
  render(out, params, ctx) {
    const targets = ctx.random('targets');
    const step = ctx.sampleRate / numberOf(params, 'rate');
    const alpha = 1 - Math.exp(-1 / (numberOf(params, 'glide') * ctx.sampleRate));
    let target = targets.bipolar();
    let value = target;
    let next = step;
    for (let i = 0; i < out.length; i++) {
      if (i >= next) {
        target = targets.bipolar();
        next += step;
      }
      value += alpha * (target - value);
      out[i] = value;
    }
  },
};

/**
 * Döngü eşzamanlı rastgele sapma: her döngü başında yeni N(0, 1)/3 değeri
 * (±1'de kırpılır) çekilir ve döngü boyunca tutulur; `smoothing` basamağı
 * döngü kesri kadar yumuşatır. Frekansa bağlanınca jitter, genliğe
 * bağlanınca shimmer ölçüsüdür (ses biliminde döngüden döngüye sapma).
 */
function cycleRandom(
  out: Float32Array,
  cycleRate: ReturnType<typeof signalOf>,
  smoothing: number,
  random: Random,
  sampleRate: number,
): void {
  let phase = 1;
  let target = 0;
  let value = 0;
  for (let i = 0; i < out.length; i++) {
    const hz = sampleAt(cycleRate, i);
    if (phase >= 1) {
      phase -= Math.floor(phase);
      target = Math.max(-1, Math.min(1, gaussian(random) / 3));
    }
    const alpha = smoothing === 0 ? 1 : 1 - Math.exp(-hz / (smoothing * sampleRate));
    value += alpha * (target - value);
    out[i] = value;
    phase += hz / sampleRate;
  }
}

const cycleParams = {
  cycleRate: {
    type: 'number',
    unit: 'per-second',
    min: 1,
    max: 2000,
    default: 120,
    automatable: true,
    description: 'Döngü sıklığı — perdeyi izlemesi için perde gesture’ına bağlanabilir.',
  },
  smoothing: {
    type: 'number',
    unit: 'normalized',
    min: 0,
    max: 1,
    default: 0.3,
    description: 'Döngüler arası geçişin yumuşaklığı (0 → basamak).',
  },
} as const;

function cycleModulator(id: string, description: string, target: string): ModulatorEntry {
  return {
    id,
    kind: 'modulator',
    version: 1,
    description,
    capabilities: ['stochastic', 'cycle-synchronous', 'bounded'],
    params: cycleParams,
    causal: [
      {
        param: 'cycleRate',
        dimension: 'irregularity',
        direction: 1,
        note: `Daha sık ${target} sapması.`,
      },
      { param: 'smoothing', dimension: 'roughness', direction: -1, note: 'Yumuşak geçiş.' },
    ],
    determinism: { stochastic: true, substreams: ['cycles'] },
    resource: { model: 'O(kare)', workPerFrame: () => 3, stateBytes: () => 0 },
    render(out, params, ctx) {
      cycleRandom(
        out,
        signalOf(params, 'cycleRate'),
        numberOf(params, 'smoothing'),
        ctx.random('cycles'),
        ctx.sampleRate,
      );
    },
  };
}

export const JITTER = cycleModulator(
  'modulator.jitter',
  'Jitter: döngüden döngüye perde sapması. Bir frekans parametresine küçük derinlikle ' +
    '(ör. 0.005–0.02) bağlanır.',
  'perde',
);

export const SHIMMER = cycleModulator(
  'modulator.shimmer',
  'Shimmer: döngüden döngüye genlik sapması. `articulation.amplitude.level` gibi bir ' +
    'seviye parametresine bağlanır.',
  'genlik',
);

export const MODULATORS = [DRIFT, WALK, SAMPLE_GLIDE, JITTER, SHIMMER] as const;
