import type { SynthParams } from '../types';

/** Zıplama sesi. */
export function jump(frequency = 250, duration = 0.2): SynthParams {
  return {
    wave: 'sine',
    frequency,
    slide: frequency * 1.5,
    slideCurve: 'exponential',
    envelope: { attack: 0.005, hold: 0, decay: 0.05, sustain: 0, release: 0.1, sustainLevel: 0 },
    duration,
    gain: 0.55,
  };
}

/** Dash / hızlı sürüklenme sesi. */
export function dash(frequency = 800, duration = 0.2): SynthParams {
  return {
    wave: 'pink',
    frequency,
    slide: -frequency * 0.75,
    envelope: { attack: 0.01, hold: 0, decay: 0.1, sustain: 0, release: 0.12, sustainLevel: 0 },
    lowpass: { cutoff: 1400, slide: -1150 },
    highpass: { cutoff: 100 },
    duration,
    gain: 0.6,
  };
}

/** Hızlı geçiş / whoosh / swipe sesi. */
export function whoosh(frequency = 600, duration = 0.25): SynthParams {
  return {
    wave: 'pink',
    frequency,
    slide: -frequency + 200,
    envelope: { attack: 0.01, hold: 0, decay: 0.15, sustain: 0, release: 0.2, sustainLevel: 0 },
    lowpass: { cutoff: 1800, slide: -1200 },
    highpass: { cutoff: 80 },
    duration,
    gain: 0.6,
  };
}
