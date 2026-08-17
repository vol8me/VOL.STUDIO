/**
 * Tuş / melodi paleti — motif ve lead katmanları.
 *
 * Hepsi FM veya yumuşak dalga temellidir; sawtooth lead bilinçli olarak yok.
 * Üst bant her voice'ta lowpass ile sınırlanır — tema tizsiz ve koyudur.
 */

import type { SynthesisResult } from '@volstudio/core/audio/synth';
import { renderVoice } from '../lib/mix';

/** Cam tuş — koyu FM çan/tuş karışımı. Menü motiflerinin ana sesi. */
export function glassKey(frequency: number, duration: number, seed = 20): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: 'sine',
    frequency,
    fm: {
      modulatorWave: 'sine',
      ratio: 2,
      index: 1.5,
      modulatorEnvelope: {
        attack: 0.004,
        hold: 0.01,
        decay: duration * 0.35,
        sustain: 0,
        release: duration * 0.3,
        sustainLevel: 0.15,
        curve: 'cosine',
      },
    },
    envelope: {
      attack: 0.005,
      hold: 0.02,
      decay: duration * 0.4,
      sustain: 0,
      release: duration * 0.45,
      sustainLevel: 0.35,
      curve: 'cosine',
    },
    lowpass: { cutoff: 2500, poles: 2 },
    highpass: { cutoff: 90 },
    reverb: { amount: 0.14, decay: 0.9, roomSize: 0.55, damp: 0.6 },
    gain: 0.4,
  });
}

/** Void pluck — kısa, kapanan FM vuruş; arpej ve ritmik motifler için. */
export function voidPluck(frequency: number, duration: number, seed = 21): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: 'sine',
    frequency,
    fm: {
      modulatorWave: 'sine',
      ratio: 1.5,
      index: 2.1,
      modulatorEnvelope: {
        attack: 0.002,
        hold: 0.008,
        decay: duration * 0.3,
        sustain: 0,
        release: duration * 0.2,
        sustainLevel: 0.1,
        curve: 'exponential',
      },
    },
    envelope: {
      attack: 0.003,
      hold: 0.012,
      decay: duration * 0.35,
      sustain: 0,
      release: duration * 0.3,
      sustainLevel: 0.3,
      curve: 'cosine',
    },
    lowpass: { cutoff: 1900, poles: 2 },
    highpass: { cutoff: 100 },
    gain: 0.34,
  });
}

/** Gece lead'i — yumuşak, vibratolu üçgen; melodik doruklar için. */
export function nightLead(frequency: number, duration: number, seed = 22): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: ['triangle', 'sine'],
    frequency,
    detune: 4,
    vibratoRate: 4.4,
    vibratoDepth: frequency * 0.004,
    envelope: {
      attack: duration * 0.12,
      hold: 0,
      decay: duration * 0.25,
      sustain: duration * 0.3,
      release: duration * 0.3,
      sustainLevel: 0.7,
      curve: 'cosine',
    },
    lowpass: { cutoff: 2100, poles: 2 },
    highpass: { cutoff: 110 },
    reverb: { amount: 0.18, decay: 1.1, roomSize: 0.6, damp: 0.55 },
    gain: 0.3,
  });
}

/** Karanlık stab — kısa akor vuruşu için tek nota; savaş/boss vurgusu. */
export function darkStab(frequency: number, duration: number, seed = 23): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: ['sawtooth', 'square'],
    frequency,
    detune: 7,
    envelope: {
      attack: 0.004,
      hold: 0.03,
      decay: duration * 0.4,
      sustain: 0,
      release: duration * 0.35,
      sustainLevel: 0.3,
      curve: 'cosine',
    },
    lowpass: {
      cutoff: 900,
      resonance: 0.15,
      poles: 2,
      envelope: {
        attack: 0.001,
        hold: 0.02,
        decay: duration * 0.45,
        sustain: 0,
        release: duration * 0.3,
        sustainLevel: 0.25,
        curve: 'exponential',
      },
      envAmount: 0.45,
    },
    highpass: { cutoff: 80 },
    gain: 0.3,
  });
}
