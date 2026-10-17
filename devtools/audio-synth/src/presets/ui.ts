import type { SynthParams } from '../types';

/** Kısa UI blip / tık sesi. */
export function blip(frequency = 1200, duration = 0.06): SynthParams {
  return {
    wave: 'sine',
    frequency,
    envelope: { attack: 0.001, hold: 0, decay: 0.02, sustain: 0, release: 0.03, sustainLevel: 0 },
    duration,
    gain: 0.4,
  };
}

/** Menüyü duraklatma sesi (aşağı kaymalı). */
export function pause(frequency = 320, duration = 0.22): SynthParams {
  return {
    wave: 'triangle',
    frequency,
    slide: -frequency * 0.625,
    envelope: {
      attack: 0.01,
      hold: 0,
      decay: 0.1,
      sustain: 0.05,
      release: 0.18,
      sustainLevel: 0.4,
    },
    lowpass: { cutoff: 2500, slide: -1000 },
    duration,
    gain: 0.5,
  };
}

/** Oyuna devam etme sesi (yukarı kaymalı). */
export function resume(frequency = 120, duration = 0.22): SynthParams {
  return {
    wave: 'triangle',
    frequency,
    slide: frequency * 1.67,
    slideCurve: 'exponential',
    envelope: {
      attack: 0.01,
      hold: 0,
      decay: 0.1,
      sustain: 0.05,
      release: 0.18,
      sustainLevel: 0.4,
    },
    lowpass: { cutoff: 2500, slide: -1000 },
    duration,
    gain: 0.5,
  };
}

/** Yeniden başlatma sesi (yukarı frekans kaymalı, detuned). */
export function restart(frequency = 440, duration = 0.18): SynthParams {
  return {
    wave: 'sine',
    frequency,
    detune: 5,
    slide: frequency * 0.5,
    slideCurve: 'exponential',
    envelope: {
      attack: 0.005,
      hold: 0.02,
      decay: 0.04,
      sustain: 0.05,
      release: 0.1,
      sustainLevel: 0.5,
    },
    duration,
    gain: 0.5,
  };
}
