import type { SynthParams } from '../types';

/** Yumuşak ateş / silah sesi (sine + pink noise). */
export function fire(frequency = 420, duration = 0.12): SynthParams {
  return {
    wave: ['sine', 'pink'],
    frequency,
    slide: -frequency * 0.62,
    slideCurve: 'exponential',
    envelope: { attack: 0.005, hold: 0, decay: 0.02, sustain: 0, release: 0.06, sustainLevel: 0 },
    lowpass: { cutoff: 800, slide: -400 },
    highpass: { cutoff: 80 },
    duration,
    gain: 0.7,
  };
}

/** Mermi zıplama / sekmesi sesi. */
export function bulletBounce(frequency = 320, duration = 0.15): SynthParams {
  return {
    wave: 'sine',
    frequency,
    slide: -frequency * 0.72,
    slideCurve: 'exponential',
    envelope: { attack: 0.005, hold: 0, decay: 0.04, sustain: 0, release: 0.08, sustainLevel: 0 },
    lowpass: { cutoff: 2500, slide: -1500 },
    duration,
    gain: 0.5,
  };
}

/** Laser / ışın / enerji silahı sesi. */
export function laser(frequency = 880, duration = 0.15): SynthParams {
  return {
    wave: 'sawtooth',
    frequency,
    slide: -frequency + 100,
    slideCurve: 'exponential',
    envelope: { attack: 0.005, hold: 0, decay: 0.05, sustain: 0, release: 0.1, sustainLevel: 0 },
    lowpass: { cutoff: 3000, slide: -2000 },
    duration,
    gain: 0.7,
  };
}

/** Patlama / yıkım sesi. */
export function explosion(frequency = 100, duration = 0.35): SynthParams {
  return {
    wave: 'pink',
    frequency,
    envelope: { attack: 0.01, hold: 0.05, decay: 0.2, sustain: 0, release: 0.3, sustainLevel: 0 },
    lowpass: { cutoff: 900, slide: -700 },
    highpass: { cutoff: 40 },
    duration,
    gain: 0.85,
  };
}

/** Darbe / vuruş sesi. */
export function hit(frequency = 600, duration = 0.08): SynthParams {
  return {
    wave: 'triangle',
    frequency,
    slide: -frequency * 0.2,
    envelope: { attack: 0.001, hold: 0, decay: 0.02, sustain: 0, release: 0.04, sustainLevel: 0 },
    lowpass: { cutoff: 3000, slide: -1500 },
    duration,
    gain: 0.55,
  };
}

/** Oyuncu veya düşman hasar alma sesi. */
export function hurt(frequency = 140, duration = 0.22): SynthParams {
  return {
    wave: 'triangle',
    frequency,
    slide: -frequency * 0.43,
    envelope: {
      attack: 0.005,
      hold: 0,
      decay: 0.08,
      sustain: 0.05,
      release: 0.15,
      sustainLevel: 0.3,
    },
    lowpass: { cutoff: 900, slide: -300 },
    duration,
    gain: 0.75,
  };
}

/** Ölüm / yenilgi sesi. */
export function death(frequency = 220, duration = 0.7): SynthParams {
  return {
    wave: ['sine', 'pink'],
    frequency,
    slide: -frequency + 40,
    envelope: {
      attack: 0.02,
      hold: 0.1,
      decay: 0.2,
      sustain: 0.1,
      release: 0.5,
      sustainLevel: 0.3,
    },
    lowpass: { cutoff: 600, slide: -400 },
    duration,
    gain: 0.85,
  };
}
