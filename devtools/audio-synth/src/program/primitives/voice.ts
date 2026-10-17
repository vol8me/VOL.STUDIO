import type { Random } from '@volstudio/core/random';
import { numberOf, sampleAt, signalOf } from '../params';
import type { SourceEntry } from '../registry';

/**
 * Glottal-benzeri ses kaynağı. Darbe dizisi BLIT'tir (Stilson & Smith 1996,
 * bant sınırlı darbe dizisi): periyot P = fs/f₀ örnekte, M = 2⌊P/2⌋ + 1 tek
 * sayı harmonikli Dirichlet çekirdeği y = sin(πMφ) / (P·sin(πφ)). En yüksek
 * harmonik (M−1)/2·f₀ < fs/2 olduğundan sabit perdede alias yoktur; saf
 * testere gibi katlanmaz. Tilt (tek kutuplu alçak geçiren) glottal akış +
 * ışınım eğimini, `tension` ise bu eğimin köşesini taşır.
 *
 * Döngü eşzamanlı düzensizlik: jitter periyodu sarmada, shimmer ve
 * alt-harmonik genliği ile M değişimi yarım periyotta (darbeler arasında,
 * çekirdeğin küçük olduğu yerde) uygulanır. Formant rezonatörü AYRI bir
 * düğümdür (`resonator.formant`); kaynak onu içermez.
 */
function gaussian(random: Random): number {
  const u = Math.max(1e-12, random.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random.next());
}

function dirichlet(phase: number, harmonics: number, period: number): number {
  const denominator = Math.sin(Math.PI * phase);
  if (Math.abs(denominator) < 1e-9) return harmonics / period;
  return Math.sin(Math.PI * harmonics * phase) / (period * denominator);
}

const unit = (description: string, fallback: number, automatable = false) =>
  ({
    type: 'number',
    unit: 'normalized',
    min: 0,
    max: 1,
    default: fallback,
    automatable,
    description,
  }) as const;

export const GLOTTAL: SourceEntry = {
  id: 'source.glottal',
  kind: 'source',
  version: 1,
  description:
    'Glottal-benzeri kaynak: BLIT darbe dizisi (alias yok) + gerilim ayarlı spektral eğim, ' +
    'döngü eşzamanlı jitter/shimmer, alt-harmonik (dönüşümlü döngü zayıflaması) ve açılma ' +
    'fazına kilitli nefes gürültüsü. Perde gesture alır; formant ayrı düğümdür.',
  capabilities: ['pitched', 'voiced', 'band-limited', 'stochastic', 'time-varying'],
  params: {
    frequency: {
      type: 'number',
      unit: 'Hz',
      min: 40,
      max: 2000,
      default: 220,
      automatable: true,
      belowNyquist: true,
      description: 'Temel frekans f₀.',
    },
    tension: unit('Ses kıvrımı gerilimi: eğim köşesi 200·2^(5·tension) Hz.', 0.5, true),
    jitter: {
      type: 'number',
      unit: 'ratio',
      min: 0,
      max: 0.05,
      default: 0.005,
      description: 'Döngüden döngüye periyot sapmasının göreli standart sapması.',
    },
    shimmer: {
      type: 'number',
      unit: 'dB',
      min: 0,
      max: 3,
      default: 0.3,
      description: 'Döngüden döngüye genlik sapmasının standart sapması.',
    },
    subharmonic: unit('Dönüşümlü döngü zayıflaması (periyot ikilenmesi → f₀/2).', 0, true),
    breath: unit('Açılma fazına kilitli nefes (aspirasyon) gürültüsü.', 0.1, true),
  },
  causal: [
    { param: 'frequency', dimension: 'pitch', direction: 1, note: 'f₀ doğrudan.' },
    { param: 'tension', dimension: 'brightness', direction: 1, note: 'Eğim köşesi yükselir.' },
    { param: 'jitter', dimension: 'irregularity', direction: 1, note: 'Periyot sapması.' },
    { param: 'shimmer', dimension: 'irregularity', direction: 1, note: 'Genlik sapması.' },
    { param: 'subharmonic', dimension: 'roughness', direction: 1, note: 'f₀/2 enerjisi.' },
    { param: 'breath', dimension: 'noisiness', direction: 1, note: 'Aspirasyon.' },
  ],
  determinism: { stochastic: true, substreams: ['jitter', 'shimmer', 'breath'] },
  resource: {
    model: 'O(kare)',
    workPerFrame: (_p, automated) => 9 + 2 * automated.size,
    stateBytes: () => 0,
  },
  render(out, params, ctx) {
    const { sampleRate } = ctx;
    const f0 = signalOf(params, 'frequency');
    const tension = signalOf(params, 'tension');
    const subharmonic = signalOf(params, 'subharmonic');
    const breath = signalOf(params, 'breath');
    const jitter = numberOf(params, 'jitter');
    const shimmer = numberOf(params, 'shimmer');
    const jitterStream = ctx.random('jitter');
    const shimmerStream = ctx.random('shimmer');
    const noise = ctx.random('breath');
    let phase = 0;
    let factor = 1;
    let period = sampleRate / sampleAt(f0, 0);
    let harmonics = 2 * Math.floor(period / 2) + 1;
    let cycleGain = 1;
    let odd = false;
    let tilt = 0;
    let dcIn = 0;
    let dcOut = 0;
    const dcPole = Math.exp((-2 * Math.PI * 20) / sampleRate);
    for (let i = 0; i < out.length; i++) {
      const frequency = sampleAt(f0, i) * factor;
      period = sampleRate / frequency;
      const pulse = cycleGain * dirichlet(phase, harmonics, period);
      const corner = Math.min(0.45 * sampleRate, 200 * Math.pow(2, 5 * sampleAt(tension, i)));
      tilt += (1 - Math.exp((-2 * Math.PI * corner) / sampleRate)) * (pulse - tilt);
      const opening = 0.5 + 0.5 * Math.cos(2 * Math.PI * phase);
      const aspiration =
        sampleAt(breath, i) * noise.bipolar() * (0.2 + 0.8 * opening * opening) * 0.3;
      const x = tilt * (1 - 0.5 * sampleAt(breath, i)) + aspiration;
      dcOut = x - dcIn + dcPole * dcOut;
      dcIn = x;
      out[i] = dcOut;
      const before = phase;
      phase += frequency / sampleRate;
      if (before < 0.5 && phase >= 0.5) {
        harmonics = 2 * Math.floor(period / 2) + 1;
        odd = !odd;
        const depth = odd ? sampleAt(subharmonic, i) : 0;
        cycleGain = Math.pow(10, (shimmer * gaussian(shimmerStream)) / 20) * (1 - depth);
      }
      if (phase >= 1) {
        phase -= 1;
        factor = Math.max(0.5, 1 + jitter * gaussian(jitterStream));
      }
    }
  },
};
