/**
 * Yaylı çalgı presetleri — keman, viyola, viyolonsel, kontrabas.
 *
 * Bunlar `synth` motorunun additive yolunu kullanan parametre kümeleridir;
 * yeni DSP taşımaz. Her presetin inharmonisite, lowpass, vibrato ve zarf
 * ayarları enstrümanın karakterine göre belirlenir.
 */

import { clamp } from '@volstudio/core/math/interpolation';
import type { HarmonicParams, SynthParams } from '../types';
import { belowFundamental, reach } from './utils';

const DEFAULT_SAMPLE_RATE = 44100;
const PHASE_SPREAD = 0.41421356;

function inharmonicRatio(n: number, b: number): number {
  return n * Math.sqrt(1 + b * n * n);
}

function sawGain(n: number): number {
  return 1 / n;
}

function bForPitch(referenceB: number, frequency: number): number {
  // Düşük perde daha inharmonik; aynı tel ailesi için 1/f ölçeklenir.
  return clamp(referenceB * (196 / frequency), 0, 0.01);
}

function buildHarmonics(
  frequency: number,
  b: number,
  maxPartials: number,
  sampleRate = DEFAULT_SAMPLE_RATE,
): HarmonicParams[] {
  const nyquist = sampleRate / 2;
  const harmonics: HarmonicParams[] = [];
  for (let n = 1; n <= maxPartials; n++) {
    const ratio = inharmonicRatio(n, b);
    if (frequency * ratio > nyquist) break;
    harmonics.push({
      ratio,
      gain: sawGain(n),
      phase: (n * PHASE_SPREAD) % 1,
    });
  }
  return harmonics;
}

interface BowedBodyParams {
  referenceB: number;
  maxPartials: number;
  lowpassHarmonic: number;
  lowpassFloor: number;
  vibratoDepthCents: number;
  vibratoRate: number;
  attack: number;
  decay: number;
  release: number;
  sustainLevel: number;
  reverbAmount: number;
  reverbDecay: number;
  stereoWidth: number;
  gain: number;
}

function bowedBody(frequency: number, duration: number, params: BowedBodyParams): SynthParams {
  const b = bForPitch(params.referenceB, frequency);
  const harmonics = buildHarmonics(frequency, b, params.maxPartials);

  const attack = params.attack;
  const decay = params.decay;
  const release = params.release;
  const sustain = Math.max(0, duration - attack - decay - release);

  return {
    frequency,
    duration,
    harmonics,
    envelope: {
      attack,
      hold: 0,
      decay,
      sustain,
      release,
      sustainLevel: params.sustainLevel,
    },
    highpass: {
      cutoff: belowFundamental(frequency, 50),
      resonance: 0.04,
      poles: 2,
      type: 'highpass',
    },
    lowpass: {
      cutoff: reach(frequency, params.lowpassHarmonic, params.lowpassFloor),
      resonance: 0.05,
      poles: 2,
      type: 'lowpass',
    },
    reverb: {
      amount: params.reverbAmount,
      decay: params.reverbDecay,
      roomSize: 0.55,
      damp: 0.5,
    },
    vibratoDepth: frequency * params.vibratoDepthCents,
    vibratoRate: params.vibratoRate,
    stereoWidth: params.stereoWidth,
    gain: params.gain,
  };
}

// ─── Keman ─────────────────────────────────────────────────────────

/** Keman — G3 (196 Hz) ile E7 (2637 Hz) arası, parlak, geniş vibrato. */
export function violin(frequency = 440, duration = 2.0): SynthParams {
  return bowedBody(frequency, duration, {
    referenceB: 0.00003,
    maxPartials: 16,
    lowpassHarmonic: 14,
    lowpassFloor: 8000,
    vibratoDepthCents: 0.012,
    vibratoRate: 5.5,
    attack: 0.2,
    decay: 0.15,
    release: 0.3,
    sustainLevel: 0.9,
    reverbAmount: 0.18,
    reverbDecay: 1.8,
    stereoWidth: 0.35,
    gain: 0.18,
  });
}

// ─── Viyola ────────────────────────────────────────────────────────

/** Viyola — C3 (130,8 Hz) ile A6 (1760 Hz) arası, daha koyu ve yumuşak. */
export function viola(frequency = 220, duration = 2.0): SynthParams {
  return bowedBody(frequency, duration, {
    referenceB: 0.00008,
    maxPartials: 14,
    lowpassHarmonic: 10,
    lowpassFloor: 5000,
    vibratoDepthCents: 0.012,
    vibratoRate: 5.2,
    attack: 0.22,
    decay: 0.18,
    release: 0.35,
    sustainLevel: 0.88,
    reverbAmount: 0.2,
    reverbDecay: 1.9,
    stereoWidth: 0.32,
    gain: 0.18,
  });
}

// ─── Viyolonsel ────────────────────────────────────────────────────

/** Viyolonsel — C2 (65,4 Hz) ile A5 (880 Hz) arası, derin, koyu vücut. */
export function cello(frequency = 130.8, duration = 2.2): SynthParams {
  return bowedBody(frequency, duration, {
    referenceB: 0.0003,
    maxPartials: 12,
    lowpassHarmonic: 6,
    lowpassFloor: 1500,
    vibratoDepthCents: 0.012,
    vibratoRate: 4.8,
    attack: 0.25,
    decay: 0.2,
    release: 0.4,
    sustainLevel: 0.85,
    reverbAmount: 0.22,
    reverbDecay: 2.0,
    stereoWidth: 0.28,
    gain: 0.2,
  });
}

// ─── Kontrabas ─────────────────────────────────────────────────────

/** Kontrabas — E1 (41,2 Hz) ile G4 (392 Hz) arası, çok bas, kısa üst ton. */
export function doubleBass(frequency = 82.4, duration = 2.0): SynthParams {
  return bowedBody(frequency, duration, {
    referenceB: 0.0008,
    maxPartials: 10,
    lowpassHarmonic: 4,
    lowpassFloor: 700,
    vibratoDepthCents: 0.012,
    vibratoRate: 4.0,
    attack: 0.28,
    decay: 0.22,
    release: 0.45,
    sustainLevel: 0.82,
    reverbAmount: 0.18,
    reverbDecay: 1.7,
    stereoWidth: 0.22,
    gain: 0.22,
  });
}
