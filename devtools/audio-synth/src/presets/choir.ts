/**
 * Koro / vokal formant presetleri — YENİ DSP YOK.
 *
 * Soprano, alto, tenor ve bass `synth` motorunun additive yolunu kullanır.
 * Her presetin harmonik spektrumu, lowpass kesimi, vibrato ve chorus ayarları
 * o sesin karakterine göre belirlenir.
 */

import type { HarmonicParams, SynthParams } from '../types';
import { reach, belowFundamental } from './utils';

const DEFAULT_SAMPLE_RATE = 44100;

function sawGain(n: number): number {
  return 1 / n;
}

function buildHarmonics(
  frequency: number,
  maxPartials: number,
  sampleRate = DEFAULT_SAMPLE_RATE,
): HarmonicParams[] {
  const nyquist = sampleRate / 2;
  const harmonics: HarmonicParams[] = [];
  for (let n = 1; n <= maxPartials; n++) {
    const fn = frequency * n;
    if (fn > nyquist) break;
    harmonics.push({
      ratio: n,
      gain: sawGain(n),
      phase: (n * 0.17) % 1,
    });
  }
  return harmonics;
}

interface ChoirBodyParams {
  maxPartials: number;
  lowpassHarmonic: number;
  lowpassFloor: number;
  vibratoDepth: number;
  vibratoRate: number;
  attack: number;
  release: number;
  stereoWidth: number;
  gain: number;
  chorusDepth?: number;
  chorusRate?: number;
}

function choirBody(frequency: number, duration: number, params: ChoirBodyParams): SynthParams {
  const harmonics = buildHarmonics(frequency, params.maxPartials);

  return {
    frequency,
    duration,
    harmonics,
    envelope: {
      attack: params.attack,
      hold: 0,
      decay: 0.15,
      sustain: Math.max(0, duration - params.attack - 0.15 - params.release),
      release: params.release,
      sustainLevel: 0.9,
    },
    highpass: {
      cutoff: belowFundamental(frequency, 80),
      resonance: 0.04,
      poles: 2,
      type: 'highpass',
    },
    lowpass: {
      cutoff: reach(frequency, params.lowpassHarmonic, params.lowpassFloor),
      resonance: 0.06,
      poles: 2,
      type: 'lowpass',
    },
    vibratoDepth: params.vibratoDepth,
    vibratoRate: params.vibratoRate,
    stereoWidth: params.stereoWidth,
    gain: params.gain,
    chorus:
      params.chorusDepth !== undefined
        ? { depth: params.chorusDepth, rate: params.chorusRate ?? 0.5, mix: 0.3 }
        : undefined,
  };
}

// ─── Soprano ────────────────────────────────────────────────────────

/** Soprano — yüksek perde, parlak, hafif vibrato, geniş stereo koro. */
export function soprano(frequency = 440, duration = 2.0): SynthParams {
  return choirBody(frequency, duration, {
    maxPartials: 16,
    lowpassHarmonic: 14,
    lowpassFloor: 9000,
    vibratoDepth: 2.8,
    vibratoRate: 5.5,
    attack: 0.18,
    release: 0.35,
    stereoWidth: 0.55,
    gain: 0.18,
    chorusDepth: 0.6,
    chorusRate: 0.4,
  });
}

// ─── Alto ───────────────────────────────────────────────────────────

/** Alto — orta yüksek, yumuşak, dengeli koro sesi. */
export function alto(frequency = 330, duration = 2.0): SynthParams {
  return choirBody(frequency, duration, {
    maxPartials: 14,
    lowpassHarmonic: 12,
    lowpassFloor: 7000,
    vibratoDepth: 2.4,
    vibratoRate: 5.0,
    attack: 0.2,
    release: 0.4,
    stereoWidth: 0.5,
    gain: 0.2,
    chorusDepth: 0.5,
    chorusRate: 0.35,
  });
}

// ─── Tenor ──────────────────────────────────────────────────────────

/** Tenor — orta, erkek koro sesi, hafif vibrato. */
export function tenor(frequency = 220, duration = 2.0): SynthParams {
  return choirBody(frequency, duration, {
    maxPartials: 12,
    lowpassHarmonic: 10,
    lowpassFloor: 5000,
    vibratoDepth: 2.0,
    vibratoRate: 4.5,
    attack: 0.22,
    release: 0.45,
    stereoWidth: 0.45,
    gain: 0.22,
    chorusDepth: 0.4,
    chorusRate: 0.3,
  });
}

// ─── Bass Choir ─────────────────────────────────────────────────────

/** Bass Choir — en pes erkek koro sesi, koyu, kısa üst ton. */
export function bassChoir(frequency = 130.8, duration = 2.0): SynthParams {
  return choirBody(frequency, duration, {
    maxPartials: 10,
    lowpassHarmonic: 6,
    lowpassFloor: 2000,
    vibratoDepth: 1.5,
    vibratoRate: 3.8,
    attack: 0.25,
    release: 0.5,
    stereoWidth: 0.4,
    gain: 0.24,
    chorusDepth: 0.35,
    chorusRate: 0.25,
  });
}
