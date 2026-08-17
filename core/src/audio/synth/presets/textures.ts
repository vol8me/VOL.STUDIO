import type { SynthParams } from '../types';

/**
 * Genel amaçlı ses dokusu / atmosfer presetleri.
 *
 * Bu dosya stilden bağımsız zemin ve pad karakterleri sağlar; oyun tarafındaki
 * ses paletleri bu tariflerin üzerine gain/pan/seed ile karıştırma yapabilir.
 */

/** Yumuşak, sine-tabanlı orta-yüksek doku — rüzgâr / nefes. */
export function softWind(frequency = 400, duration = 3): SynthParams {
  return {
    wave: 'pink',
    frequency,
    duration,
    gain: 0.25,
    envelope: {
      attack: 1.2,
      hold: 0,
      decay: 0,
      sustain: Math.max(0, duration - 2.4),
      release: 1.2,
      sustainLevel: 1,
      curve: 'cosine',
    },
    lowpass: { cutoff: 900, resonance: 0.05, poles: 2, type: 'lowpass' },
    highpass: { cutoff: 180, resonance: 0, poles: 2, type: 'highpass' },
    lfos: [{ target: 'filter', rate: 0.12, depth: 280, wave: 'sine' }],
    reverb: { amount: 0.35, decay: 3.5, roomSize: 0.8, damp: 0.55, preDelay: 0.03 },
  };
}

/** Sıcak, organ/yaylı karakteri — additive sine harmonikler. */
export function warmPad(frequency = 220, duration = 2.5): SynthParams {
  return {
    harmonics: [
      { ratio: 1, gain: 1.0, phase: 0 },
      { ratio: 2, gain: 0.45, phase: 0.08 },
      { ratio: 3, gain: 0.28, phase: 0.16 },
      { ratio: 4, gain: 0.18, phase: 0.05 },
      { ratio: 5, gain: 0.1, phase: 0.22 },
      { ratio: 6, gain: 0.07, phase: 0.11 },
    ],
    frequency,
    duration,
    gain: 0.22,
    envelope: {
      attack: 0.6,
      hold: 0,
      decay: 0.3,
      sustain: Math.max(0, duration - 1.8),
      release: 1.0,
      sustainLevel: 0.95,
      curve: 'cosine',
    },
    lowpass: { cutoff: 1400, resonance: 0.04, poles: 2, type: 'lowpass' },
    lfos: [
      { target: 'filter', rate: 0.08, depth: 120, wave: 'sine' },
      { target: 'amplitude', rate: 0.05, depth: 0.06, wave: 'sine' },
    ],
    chorus: { depth: 1.8, rate: 0.15, mix: 0.35 },
    reverb: { amount: 0.3, decay: 2.5, roomSize: 0.75, damp: 0.5, preDelay: 0.03 },
  };
}

/** Soğuk, endüstriyel makine uğultusu — detune'lu sawtooth. */
export function machineHum(frequency = 110, duration = 2.5): SynthParams {
  return {
    wave: 'sawtooth',
    frequency,
    duration,
    detune: 12,
    gain: 0.2,
    envelope: {
      attack: 0.8,
      hold: 0,
      decay: 0.2,
      sustain: Math.max(0, duration - 1.8),
      release: 1.0,
      sustainLevel: 0.95,
      curve: 'cosine',
    },
    lowpass: { cutoff: 220, resonance: 0.08, poles: 2, type: 'lowpass' },
    lfos: [
      { target: 'filter', rate: 0.04, depth: 60, wave: 'sine' },
      { target: 'amplitude', rate: 0.03, depth: 0.12, wave: 'sine' },
    ],
    reverb: { amount: 0.22, decay: 2.2, roomSize: 0.7, damp: 0.6, preDelay: 0.02 },
  };
}

/** Geniş bant pembe/beyaz gürültü — uzak makine/ışık rüzgârı. */
export function staticField(frequency = 2200, duration = 3): SynthParams {
  return {
    wave: 'pink',
    frequency,
    duration,
    gain: 0.15,
    envelope: {
      attack: 1.5,
      hold: 0,
      decay: 0,
      sustain: Math.max(0, duration - 3.0),
      release: 1.5,
      sustainLevel: 1,
      curve: 'cosine',
    },
    lowpass: { cutoff: frequency * 1.6, resonance: 0.04, poles: 2, type: 'lowpass' },
    highpass: { cutoff: frequency * 0.4, resonance: 0, poles: 2, type: 'highpass' },
    lfos: [{ target: 'amplitude', rate: 0.07, depth: 0.3, wave: 'sine' }],
    reverb: { amount: 0.28, decay: 2.8, roomSize: 0.85, damp: 0.5, preDelay: 0.04 },
  };
}

/** Kısa, sıcak mallet/ahşap vuruş — arpeggio için. */
export function malletPluck(frequency = 660, duration = 0.35): SynthParams {
  return {
    harmonics: [
      { ratio: 1, gain: 1.0, phase: 0 },
      { ratio: 2.7, gain: 0.35, phase: 0.1 },
      { ratio: 4.8, gain: 0.12, phase: 0.2 },
    ],
    frequency,
    duration,
    gain: 0.45,
    envelope: {
      attack: 0.003,
      hold: 0,
      decay: 0.12,
      sustain: 0,
      release: 0.22,
      sustainLevel: 0.05,
      curve: 'exponential',
    },
    lowpass: { cutoff: 3200, resonance: 0.06, poles: 2, type: 'lowpass' },
    reverb: { amount: 0.15, decay: 1.0, roomSize: 0.5, damp: 0.6, preDelay: 0.01 },
  };
}

/** Uzak, yumuşak çan — pastoral vurgu. */
export function distantChime(frequency = 880, duration = 2): SynthParams {
  return {
    wave: 'sine',
    frequency,
    duration,
    gain: 0.28,
    envelope: {
      attack: 0.006,
      hold: 0.05,
      decay: 0.35,
      sustain: 0.2,
      release: 1.2,
      sustainLevel: 0.25,
      curve: 'exponential',
    },
    fm: {
      modulatorWave: 'sine',
      ratio: 2.2,
      index: 1.2,
      modulatorEnvelope: {
        attack: 0.005,
        hold: 0,
        decay: 0.2,
        sustain: 0,
        release: 0.4,
        sustainLevel: 0.05,
        curve: 'exponential',
      },
    },
    lowpass: { cutoff: 5000, resonance: 0.05, poles: 2, type: 'lowpass' },
    reverb: { amount: 0.45, decay: 3.5, roomSize: 0.9, damp: 0.4, preDelay: 0.03 },
  };
}
