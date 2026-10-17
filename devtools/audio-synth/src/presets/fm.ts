import type { SynthParams } from '../types';

/** FM zil sesi (brass-bell karakteri). */
export function bell(frequency = 440, duration = 0.6): SynthParams {
  return {
    wave: 'sine',
    frequency,
    envelope: { attack: 0.005, hold: 0.05, decay: 0.4, sustain: 0, release: 0.6, sustainLevel: 0 },
    fm: {
      modulatorWave: 'sine',
      ratio: 1.4,
      index: 4,
      modulatorLevel: 1,
      feedback: 0.2,
    },
    lowpass: { cutoff: 4000, slide: -1500 },
    duration,
    gain: 0.7,
  };
}

/** FM elektrik piyano / rhodes tarzı — yumuşatılmış modülasyon. */
export function electricPiano(frequency = 440, duration = 0.5): SynthParams {
  return {
    wave: 'sine',
    frequency,
    envelope: {
      attack: 0.005,
      hold: 0,
      decay: 0.18,
      sustain: 0.15,
      release: 0.45,
      sustainLevel: 0.55,
    },
    fm: {
      modulatorWave: 'sine',
      ratio: 2,
      index: 0.9,
      feedback: 0.05,
      modulatorEnvelope: {
        attack: 0.002,
        hold: 0,
        decay: 0.12,
        sustain: 0.1,
        release: 0.25,
        sustainLevel: 0.4,
      },
    },
    lowpass: { cutoff: 2800, resonance: 0.05, poles: 2, type: 'lowpass', slide: -500 },
    chorus: { depth: 1.2, rate: 0.06, mix: 0.2 },
    duration,
    gain: 0.55,
  };
}

/** Metalik vuruş / clang sesi. */
export function metallicClang(frequency = 800, duration = 0.25): SynthParams {
  return {
    wave: 'sine',
    frequency,
    envelope: { attack: 0.001, hold: 0, decay: 0.08, sustain: 0, release: 0.2, sustainLevel: 0 },
    fm: {
      modulatorWave: 'sawtooth',
      ratio: 1.73,
      index: 3,
      feedback: 0.3,
      modulatorEnvelope: {
        attack: 0.001,
        hold: 0,
        decay: 0.05,
        sustain: 0,
        release: 0.1,
        sustainLevel: 0,
      },
    },
    lowpass: { cutoff: 5000, slide: -2000 },
    highpass: { cutoff: 200 },
    duration,
    gain: 0.8,
  };
}

/** FM dub bas / growl. */
export function dubBass(frequency = 80, duration = 0.4): SynthParams {
  return {
    wave: 'sine',
    frequency,
    envelope: {
      attack: 0.02,
      hold: 0.1,
      decay: 0.2,
      sustain: 0.1,
      release: 0.3,
      sustainLevel: 0.5,
    },
    fm: {
      modulatorWave: 'sine',
      ratio: 0.5,
      index: 2,
      feedback: 0.15,
      modulatorEnvelope: {
        attack: 0.05,
        hold: 0,
        decay: 0.1,
        sustain: 0.1,
        release: 0.2,
        sustainLevel: 0.3,
      },
    },
    lowpass: { cutoff: 1200, slide: -400 },
    duration,
    gain: 0.85,
  };
}

/** FM retro laser (daha agresif varyant). */
export function fmLaser(frequency = 880, duration = 0.15): SynthParams {
  return {
    wave: 'sine',
    frequency,
    slide: -frequency + 100,
    slideCurve: 'exponential',
    envelope: { attack: 0.005, hold: 0, decay: 0.05, sustain: 0, release: 0.1, sustainLevel: 0 },
    fm: {
      modulatorWave: 'sine',
      ratio: 1.5,
      index: 2.5,
      modulatorEnvelope: {
        attack: 0.001,
        hold: 0,
        decay: 0.03,
        sustain: 0,
        release: 0.05,
        sustainLevel: 0,
      },
    },
    lowpass: { cutoff: 3000, slide: -2000 },
    duration,
    gain: 0.7,
  };
}
