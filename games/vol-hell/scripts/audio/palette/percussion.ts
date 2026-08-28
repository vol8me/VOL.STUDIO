/**
 * Perküsyon paleti — Karanlık Sentetik ritim çekirdeği.
 *
 * Karakter: derin, yumuşak kenarlı, elektronik. Klasik "beyaz gürültü hi-hat"
 * bilinçli olarak YOK — tiz metalik tıslama yerine bant sınırlı FM tıkırtıları
 * kullanılır. Gürültü yalnızca snare/impact transientinde ve dar bantta yaşar.
 */

import type { SynthesisResult } from '@volstudio/audio-synth';
import { renderVoice } from '../lib/mix';
import { layer } from './shared';

/** Derin elektronik kick — sine düşüşü, yuvarlak transient, kısa kuyruk. */
export function kick(seed = 1): SynthesisResult {
  return renderVoice({
    seed,
    duration: 0.3,
    wave: 'sine',
    frequency: 98,
    slide: -60,
    slideCurve: 'exponential',
    envelope: {
      attack: 0.002,
      hold: 0.02,
      decay: 0.14,
      sustain: 0,
      release: 0.12,
      sustainLevel: 0.35,
      curve: 'cosine',
    },
    lowpass: { cutoff: 220 },
    gain: 0.95,
  });
}

/** Ağır kick varyantı — boss/savaş için daha uzun gövde ve alt oktav vurgusu. */
export function heavyKick(seed = 1): SynthesisResult {
  return layer(
    { voice: kick(seed), gain: 0.85 },
    {
      voice: renderVoice({
        seed: seed + 1,
        duration: 0.38,
        wave: 'sine',
        frequency: 52,
        slide: -18,
        slideCurve: 'exponential',
        envelope: {
          attack: 0.004,
          hold: 0.03,
          decay: 0.2,
          sustain: 0,
          release: 0.14,
          sustainLevel: 0.3,
          curve: 'cosine',
        },
        lowpass: { cutoff: 110 },
        gain: 0.8,
      }),
      at: 0.004,
    },
  );
}

/** Snare — kısa sine gövde + dar bantlı gürültü teli. Koyu, kuru. */
export function snare(seed = 2): SynthesisResult {
  const body = renderVoice({
    seed,
    duration: 0.16,
    wave: 'sine',
    frequency: 186,
    slide: -48,
    slideCurve: 'exponential',
    envelope: {
      attack: 0.002,
      hold: 0.012,
      decay: 0.07,
      sustain: 0,
      release: 0.07,
      sustainLevel: 0.4,
      curve: 'cosine',
    },
    lowpass: { cutoff: 900 },
    gain: 0.7,
  });
  const wires = renderVoice({
    seed: seed + 11,
    duration: 0.18,
    wave: 'brown',
    envelope: {
      attack: 0.001,
      hold: 0.015,
      decay: 0.08,
      sustain: 0,
      release: 0.08,
      sustainLevel: 0.35,
      curve: 'cosine',
    },
    highpass: { cutoff: 380, poles: 2 },
    lowpass: { cutoff: 2600, poles: 2 },
    gain: 0.5,
  });
  return layer({ voice: body }, { voice: wires, at: 0.002 });
}

/** Tık — hi-hat'in koyu ikamesi. Bant sınırlı FM tıkırtısı, tiz tıslama yok. */
export function tick(seed = 3): SynthesisResult {
  return renderVoice({
    seed,
    duration: 0.055,
    wave: 'sine',
    frequency: 540,
    fm: { modulatorWave: 'sine', ratio: 4.16, index: 1.2 },
    envelope: {
      attack: 0.001,
      hold: 0.008,
      decay: 0.02,
      sustain: 0,
      release: 0.025,
      sustainLevel: 0.5,
      curve: 'cosine',
    },
    lowpass: { cutoff: 2900, poles: 2 },
    highpass: { cutoff: 300 },
    gain: 0.32,
  });
}

/** Açık tık — off-beat için biraz daha uzun ve yumuşak varyant. */
export function openTick(seed = 4): SynthesisResult {
  return renderVoice({
    seed,
    duration: 0.12,
    wave: 'sine',
    frequency: 480,
    fm: { modulatorWave: 'triangle', ratio: 3.37, index: 1.5 },
    envelope: {
      attack: 0.002,
      hold: 0.012,
      decay: 0.05,
      sustain: 0,
      release: 0.05,
      sustainLevel: 0.45,
      curve: 'cosine',
    },
    lowpass: { cutoff: 2400, poles: 2 },
    highpass: { cutoff: 260 },
    gain: 0.26,
  });
}

/** Alçak tom — geçiş dolguları için yuvarlak vuruş. */
export function lowTom(frequency = 96, seed = 5): SynthesisResult {
  return renderVoice({
    seed,
    duration: 0.32,
    wave: 'sine',
    frequency,
    slide: -22,
    slideCurve: 'exponential',
    envelope: {
      attack: 0.003,
      hold: 0.02,
      decay: 0.16,
      sustain: 0,
      release: 0.12,
      sustainLevel: 0.4,
      curve: 'cosine',
    },
    lowpass: { cutoff: 500 },
    gain: 0.6,
  });
}
