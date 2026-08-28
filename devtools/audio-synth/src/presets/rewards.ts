import type { SynthParams } from '../types';

/** Coin / puan toplama sesi. */
export function coin(frequency = 987, duration = 0.12): SynthParams {
  return {
    wave: 'sine',
    frequency,
    pitchJump: { amount: frequency * 0.5, time: 0, duration: 0.03 },
    envelope: {
      attack: 0.001,
      hold: 0.02,
      decay: 0.03,
      sustain: 0,
      release: 0.05,
      sustainLevel: 0,
    },
    duration,
    gain: 0.5,
  };
}

/** Power-up / yetenek kazanma sesi. */
export function powerup(frequency = 440, duration = 0.3): SynthParams {
  return {
    wave: ['sine', 'triangle'],
    frequency,
    detune: 7,
    slide: frequency,
    slideCurve: 'exponential',
    envelope: {
      attack: 0.01,
      hold: 0.05,
      decay: 0.1,
      sustain: 0.1,
      release: 0.2,
      sustainLevel: 0.6,
    },
    duration,
    gain: 0.6,
  };
}
