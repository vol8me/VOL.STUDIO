/**
 * Bas paleti — parçanın zemini. Karanlık Sentetik kimliğin ağırlık merkezi.
 *
 * `subBass` saf sine temeldir; `pulseBass` filtre zarflı, analog karakterli
 * kısa vuruşlardır. İkisi aynı anda kullanılırsa pulseBass bir oktav üstte
 * tutulmalı — aynı oktavda faz toplanması alçak bandı bulanıklaştırır.
 */

import type { SynthesisResult } from '@volstudio/core/audio/synth';
import { renderVoice } from '../lib/mix';

/** Saf sub bas — uzun, yuvarlak zemin notası. */
export function subBass(frequency: number, duration: number, seed = 10): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: 'sine',
    frequency,
    envelope: {
      attack: 0.02,
      hold: 0,
      decay: duration * 0.2,
      sustain: duration * 0.5,
      release: duration * 0.25,
      sustainLevel: 0.85,
      curve: 'cosine',
    },
    lowpass: { cutoff: 140 },
    gain: 0.72,
  });
}

/** Analog karakterli bas vuruşu — filtre zarfı kapanan koyu pluck. */
export function pulseBass(frequency: number, duration: number, seed = 11): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: ['sawtooth', 'triangle'],
    frequency,
    detune: 5,
    envelope: {
      attack: 0.004,
      hold: 0.01,
      decay: duration * 0.45,
      sustain: 0,
      release: duration * 0.4,
      sustainLevel: 0.4,
      curve: 'cosine',
    },
    lowpass: {
      cutoff: 480,
      resonance: 0.22,
      poles: 2,
      envelope: {
        attack: 0.002,
        hold: 0.02,
        decay: duration * 0.5,
        sustain: 0,
        release: duration * 0.3,
        sustainLevel: 0.2,
        curve: 'exponential',
      },
      envAmount: 0.55,
    },
    highpass: { cutoff: 42 },
    gain: 0.5,
  });
}

/** Hırıltılı FM bas — boss/savaş gerilimi için daha agresif doku. */
export function growlBass(frequency: number, duration: number, seed = 12): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: 'sawtooth',
    frequency,
    fm: { modulatorWave: 'triangle', ratio: 0.5, index: 1.6, feedback: 0.25 },
    envelope: {
      attack: 0.005,
      hold: 0.02,
      decay: duration * 0.4,
      sustain: duration * 0.15,
      release: duration * 0.3,
      sustainLevel: 0.5,
      curve: 'cosine',
    },
    lowpass: { cutoff: 620, resonance: 0.18, poles: 2 },
    highpass: { cutoff: 46 },
    distortion: { amount: 0.22, type: 'soft', mix: 0.5 },
    gain: 0.42,
  });
}
