import type { WaveSampleFn } from '../../synthesis/waveforms';
import {
  addBody,
  addFiltered,
  addNoise,
  metallic,
  span,
  T60_PER_TAU,
  type NoiseSpec,
} from './components';

/**
 * Yedi davul modeli, dört bileşenden kurulur: perde zarflı GÖVDE, süzülmüş
 * GÜRÜLTÜ, vuruş TIKI (TRANSIENT) ve metalik küme. Makrolar her modelde
 * aynı anlamı taşır: `tune` yarım ton, `decay` sönüm, `tone` parlaklık,
 * `attack` vuruş sertliği, `noise` modelin gürültü payının çarpanı, `open`
 * (hat) açıklık. Velocity seviyeyi DEĞİL tınıyı değiştirir: sert vuruş daha
 * parlak, perde zarfı daha derindir. Seviye enstrümanın velocity tepkisidir.
 *
 * Başlangıç frekansları ve metalik oranlar analog davul devrelerinden
 * alınmış yaklaşık değerlerdir; öykünme iddiası yoktur.
 */
export const DRUM_MODELS = ['kick', 'tom', 'snare', 'clap', 'hat', 'cymbal', 'perc'] as const;
export type DrumModel = (typeof DRUM_MODELS)[number];

export interface ResolvedDrum {
  readonly model: DrumModel;
  readonly velocity: number;
  readonly tune: number;
  readonly decay: number;
  readonly tone: number;
  readonly attack: number;
  readonly noise: number;
  readonly drive: number;
  readonly open: number;
  readonly level: number;
  readonly seed: number;
}

/** Modelin karakterini taşıyan varsayılan gürültü payı. */
export const DRUM_NOISE_DEFAULT: Readonly<Record<DrumModel, number>> = {
  kick: 0.1,
  tom: 0.15,
  snare: 0.55,
  clap: 1,
  hat: 0.5,
  cymbal: 0.6,
  perc: 0.6,
};

const HAT_RATIOS = [205.3, 304.4, 369.6, 522.7, 540, 800] as const;
const CYMBAL_RATIOS = [283, 421.5, 587.2, 632.4, 781.1, 1010.6, 1253, 1497] as const;
const CLAP_BURSTS = [0, 0.009, 0.018, 0.028] as const;

function semis(tune: number): number {
  return Math.pow(2, tune / 12);
}

function hatTau(d: ResolvedDrum): number {
  const closed = span(d.decay, 0.006, 0.04);
  const open = span(d.decay, 0.1, 0.45);
  return Math.pow(closed, 1 - d.open) * Math.pow(open, d.open);
}

/** Patlama aralığı tonla açılır: parlak alkış sıkı, koyu alkış dağınık duyulur. */
function clapSpacing(d: ResolvedDrum): number {
  return 1.2 - 0.4 * d.tone;
}

/** Bileşenlerin en uzun sönümü: model −60 dB'ye bu kadar sürede iner. */
export function naturalSeconds(d: ResolvedDrum): number {
  switch (d.model) {
    case 'kick':
      return T60_PER_TAU * span(d.decay, 0.04, 0.3);
    case 'tom':
      return T60_PER_TAU * span(d.decay, 0.1, 0.6);
    case 'snare':
      return T60_PER_TAU * Math.max(span(d.decay, 0.03, 0.12), span(d.decay, 0.05, 0.28));
    case 'clap':
      return CLAP_BURSTS[3] * clapSpacing(d) + T60_PER_TAU * span(d.decay, 0.03, 0.25);
    case 'hat':
      return T60_PER_TAU * hatTau(d);
    case 'cymbal':
      return T60_PER_TAU * span(d.decay, 0.25, 1.6);
    case 'perc':
      return T60_PER_TAU * span(d.decay, 0.01, 0.2) + (1 - d.attack) * 0.02;
  }
}

function click(d: ResolvedDrum, seed: number, highpassHz: number, tau: number, gain: number) {
  return {
    seed,
    highpassHz,
    band: null,
    lowpassHz: null,
    attackSeconds: 0,
    ampTau: tau,
    delaySeconds: 0,
    gain: gain * (0.4 + 0.6 * d.velocity),
  } satisfies NoiseSpec;
}

function kick(out: Float32Array, rate: number, d: ResolvedDrum): void {
  const v = d.velocity;
  addBody(out, rate, {
    frequency: 50 * semis(d.tune),
    modes: [
      { ratio: 1, gain: 1 },
      { ratio: 1.59, gain: 0.35 * d.tone, tauScale: 0.3 },
      { ratio: 2.14, gain: 0.2 * d.tone, tauScale: 0.2 },
    ],
    pitchDepth: (2.5 + 3 * d.attack) * (0.7 + 0.3 * v),
    pitchTau: 0.006 + 0.03 * (1 - d.attack),
    ampTau: span(d.decay, 0.04, 0.3),
    gain: 1,
  });
  addNoise(out, rate, {
    ...click(d, d.seed, span(d.tone, 1500, 6000), 0.0012, 0.6 * d.attack),
    lowpassHz: span(d.tone, 4000, 16000),
  });
  addNoise(out, rate, {
    seed: d.seed + 1,
    highpassHz: 40,
    band: null,
    lowpassHz: span(d.tone, 300, 2000),
    attackSeconds: 0,
    ampTau: 0.03,
    delaySeconds: 0,
    gain: 0.25 * d.noise,
  });
}

function tom(out: Float32Array, rate: number, d: ResolvedDrum): void {
  const f0 = 110 * semis(d.tune);
  addBody(out, rate, {
    frequency: f0,
    modes: [
      { ratio: 1, gain: 1 },
      { ratio: 1.5, gain: 0.35, tauScale: 0.5 },
      { ratio: 2.44, gain: 0.12 * (0.5 + d.tone), tauScale: 0.25 },
    ],
    pitchDepth: 0.5 * (0.5 + d.attack) * (0.6 + 0.4 * d.velocity),
    pitchTau: 0.04,
    ampTau: span(d.decay, 0.1, 0.6),
    gain: 1,
  });
  addNoise(out, rate, {
    seed: d.seed,
    highpassHz: 100,
    band: { hz: f0 * 3, q: 0.8 },
    lowpassHz: null,
    attackSeconds: 0,
    ampTau: 0.03,
    delaySeconds: 0,
    gain: 0.3 * d.noise,
  });
  addNoise(out, rate, click(d, d.seed + 1, span(d.tone, 2000, 5000), 0.0015, 0.3 * d.attack));
}

/** Trampet: iki kipli gövde + tel hışırtısı; `attack` tellerin ilk çatırtısını (aynı gürültünün kısa kopyası) ve baget tıkını açar. */
function snare(out: Float32Array, rate: number, d: ResolvedDrum): void {
  const v = d.velocity;
  addBody(out, rate, {
    frequency: 180 * semis(d.tune),
    modes: [
      { ratio: 1, gain: 1 },
      { ratio: 1.83, gain: 0.6, tauScale: 0.7 },
    ],
    pitchDepth: 0.4 * (0.6 + 0.4 * v),
    pitchTau: 0.012,
    ampTau: span(d.decay, 0.03, 0.12),
    gain: 0.8,
  });
  const wires = {
    seed: d.seed,
    highpassHz: 1200,
    band: null,
    lowpassHz: span(d.tone, 3500, 12000) * (0.8 + 0.2 * v),
    attackSeconds: 0,
    delaySeconds: 0,
  };
  addNoise(out, rate, {
    ...wires,
    ampTau: span(d.decay, 0.05, 0.28),
    gain: (0.5 + 2 * d.noise) * (0.6 + 0.4 * v),
  });
  addNoise(out, rate, { ...wires, ampTau: 0.003, gain: 2.5 * d.attack * (0.6 + 0.4 * v) });
  addNoise(out, rate, { ...click(d, d.seed + 1, 3000, 0.0008, d.attack), lowpassHz: 16000 });
}

/**
 * Alkış: dört kısa patlama + oda kuyruğu. `noise` bandı genişletir (Q düşer),
 * `attack` patlamaları sivriltir, `tone` bandı ve aralığı açar.
 */
function clap(out: Float32Array, rate: number, d: ResolvedDrum): void {
  const band = {
    hz: span(d.tone, 900, 2400) * (0.9 + 0.2 * d.velocity),
    q: 1.2 * (1.5 - 0.5 * Math.min(2, d.noise)),
  };
  const spacing = clapSpacing(d);
  CLAP_BURSTS.forEach((offset, i) => {
    addNoise(out, rate, {
      seed: d.seed + i,
      highpassHz: 600,
      band,
      lowpassHz: null,
      attackSeconds: 0.0005,
      ampTau: span(1 - d.attack, 0.002, 0.008),
      delaySeconds: offset * spacing,
      gain: 0.6 + 0.4 * d.velocity,
    });
  });
  addNoise(out, rate, {
    seed: d.seed + CLAP_BURSTS.length,
    highpassHz: 600,
    band,
    lowpassHz: null,
    attackSeconds: 0.001,
    ampTau: span(d.decay, 0.03, 0.25),
    delaySeconds: CLAP_BURSTS[3] * spacing,
    gain: 0.5 * d.noise,
  });
}

function hat(out: Float32Array, rate: number, d: ResolvedDrum, wave?: WaveSampleFn): void {
  const tau = hatTau(d);
  const metal = metallic(
    out.length,
    rate,
    HAT_RATIOS.map((f) => f * semis(d.tune)),
    wave,
  );
  const envelope = (t: number) => Math.min(1, t / 0.0005) * Math.exp(-t / tau);
  addFiltered(
    out,
    metal,
    rate,
    {
      highpassHz: span(d.tone, 5000, 9000),
      band: { hz: span(d.tone, 7000, 11500) * (0.9 + 0.1 * d.velocity), q: 1 },
    },
    envelope,
    1,
  );
  addNoise(out, rate, {
    seed: d.seed,
    highpassHz: span(d.tone, 6000, 9500),
    band: null,
    lowpassHz: null,
    attackSeconds: 0,
    ampTau: tau * 0.8,
    delaySeconds: 0,
    gain: 0.5 * d.noise,
  });
  addNoise(out, rate, click(d, d.seed + 1, 8000, 0.0015, 0.6 * d.attack));
}

function cymbal(out: Float32Array, rate: number, d: ResolvedDrum, wave?: WaveSampleFn): void {
  const tau = span(d.decay, 0.25, 1.6);
  const metal = metallic(
    out.length,
    rate,
    CYMBAL_RATIOS.map((f) => f * semis(d.tune)),
    wave,
  );
  addFiltered(
    out,
    metal,
    rate,
    {
      highpassHz: span(d.tone, 2500, 6000),
      band: { hz: span(d.tone, 4000, 9000) * (0.9 + 0.1 * d.velocity), q: 0.6 },
    },
    (t) => Math.min(1, t / 0.001) * Math.exp(-t / tau),
    1,
  );
  addNoise(out, rate, {
    seed: d.seed,
    highpassHz: span(d.tone, 4000, 8000),
    band: null,
    lowpassHz: null,
    attackSeconds: 0.001,
    ampTau: tau * 0.7,
    delaySeconds: 0,
    gain: 0.6 * d.noise,
  });
  addNoise(out, rate, click(d, d.seed + 1, 3000, 0.004, 0.8 * d.attack));
}

function perc(out: Float32Array, rate: number, d: ResolvedDrum): void {
  const ampTau = span(d.decay, 0.01, 0.2);
  const share = Math.min(1, d.noise);
  addBody(out, rate, {
    frequency: 800 * semis(d.tune),
    modes: [
      { ratio: 1, gain: 1 },
      { ratio: 2.3, gain: 0.3, tauScale: 0.5 },
    ],
    pitchDepth: 0.05,
    pitchTau: 0.005,
    ampTau: span(d.decay, 0.008, 0.12),
    gain: 1 - share,
  });
  addNoise(out, rate, {
    seed: d.seed,
    highpassHz: span(d.tone, 800, 5000),
    band: { hz: span(d.tone, 1500, 9000) * (0.85 + 0.15 * d.velocity), q: 1.5 },
    lowpassHz: null,
    attackSeconds: (1 - d.attack) * 0.02,
    ampTau,
    delaySeconds: 0,
    gain: share,
  });
}

export const DRUM_RENDERERS: Readonly<
  Record<DrumModel, (out: Float32Array, rate: number, d: ResolvedDrum, wave?: WaveSampleFn) => void>
> = { kick, tom, snare, clap, hat, cymbal, perc };
