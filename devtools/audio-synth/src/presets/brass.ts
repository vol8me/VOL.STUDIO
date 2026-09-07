/**
 * Bakır üflemeli çalgı presetleri — trompet, trombon, korno, tuba.
 *
 * Bunlar `synth` motorunun additive yolunu kullanan parametre kümeleridir;
 * yeni DSP taşımaz. Her presetin harmonik yapısı, lowpass kesimi ve zarfı
 * enstrümanın açık/kapalı karakterine göre belirlenir.
 */

import type { HarmonicParams, SynthParams } from '../types';
import { belowFundamental, reach } from './utils';

const PHASE_SPREAD = 0.41421356;

interface BrassEnvelope {
  attack: number;
  decay: number;
  release: number;
  sustainLevel: number;
}

interface BrassBodyParams {
  harmonics: number[];
  lowpassHarmonic: number;
  lowpassFloor: number;
  envelope: BrassEnvelope;
  gain: number;
  reverbAmount: number;
  reverbDecay: number;
}

function makeHarmonics(relative: number[]): HarmonicParams[] {
  const total = relative.reduce((a, b) => a + b, 0) || 1;
  return relative.map((gain, i) => ({
    ratio: i + 1,
    gain: gain / total,
    phase: ((i + 1) * PHASE_SPREAD) % 1,
  }));
}

function brassBody(frequency: number, duration: number, params: BrassBodyParams): SynthParams {
  const { attack, decay, release, sustainLevel } = params.envelope;
  const sustain = Math.max(0, duration - attack - decay - release);

  return {
    frequency,
    duration,
    harmonics: makeHarmonics(params.harmonics),
    envelope: {
      attack,
      hold: 0,
      decay,
      sustain,
      release,
      sustainLevel,
      curve: 'cosine',
    },
    highpass: {
      cutoff: belowFundamental(frequency, 30),
      resonance: 0,
      poles: 1,
      type: 'highpass',
    },
    lowpass: {
      cutoff: reach(frequency, params.lowpassHarmonic, params.lowpassFloor),
      resonance: 0,
      poles: 1,
      type: 'lowpass',
    },
    reverb: {
      amount: params.reverbAmount,
      decay: params.reverbDecay,
      roomSize: 0.45,
      damp: 0.6,
    },
    stereoWidth: 0.3,
    gain: params.gain,
  };
}

/** Trompet — parlak, keskin atak, yüksek kısmi tonlar. */
export function trumpet(frequency = 440, duration = 1.2): SynthParams {
  return brassBody(frequency, duration, {
    harmonics: [
      1.0, 0.78, 0.62, 0.48, 0.38, 0.3, 0.24, 0.19, 0.15, 0.12, 0.1, 0.08, 0.06, 0.05, 0.04,
    ],
    lowpassHarmonic: 16,
    lowpassFloor: 7000,
    envelope: {
      attack: 0.005,
      decay: 0.25,
      release: 0.25,
      sustainLevel: 0.8,
    },
    gain: 0.45,
    reverbAmount: 0.12,
    reverbDecay: 0.9,
  });
}

/** Trombon — geniş, tok, trompetten daha koyu. */
export function trombone(frequency = 220, duration = 1.5): SynthParams {
  return brassBody(frequency, duration, {
    harmonics: [1.0, 0.72, 0.52, 0.38, 0.28, 0.2, 0.15, 0.11, 0.08, 0.06, 0.05, 0.04],
    lowpassHarmonic: 12,
    lowpassFloor: 5500,
    envelope: {
      attack: 0.006,
      decay: 0.35,
      release: 0.3,
      sustainLevel: 0.78,
    },
    gain: 0.45,
    reverbAmount: 0.12,
    reverbDecay: 0.9,
  });
}

/** Korno (French horn) — yumuşak, orta parlak, geniş. */
export function frenchHorn(frequency = 220, duration = 1.8): SynthParams {
  return brassBody(frequency, duration, {
    harmonics: [1.0, 0.62, 0.38, 0.24, 0.16, 0.11, 0.08, 0.06, 0.04],
    lowpassHarmonic: 9,
    lowpassFloor: 3500,
    envelope: {
      attack: 0.008,
      decay: 0.45,
      release: 0.4,
      sustainLevel: 0.75,
    },
    gain: 0.45,
    reverbAmount: 0.15,
    reverbDecay: 1.1,
  });
}

/** Tuba — derin, koyu, çok az üst ton. */
export function tuba(frequency = 98, duration = 2.0): SynthParams {
  return brassBody(frequency, duration, {
    harmonics: [1.0, 0.5, 0.22, 0.1, 0.05, 0.03, 0.02],
    lowpassHarmonic: 6,
    lowpassFloor: 1200,
    envelope: {
      attack: 0.012,
      decay: 0.6,
      release: 0.5,
      sustainLevel: 0.7,
    },
    gain: 0.45,
    reverbAmount: 0.15,
    reverbDecay: 1.1,
  });
}
