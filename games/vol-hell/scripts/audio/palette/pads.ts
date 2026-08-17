/**
 * Pad paleti — armonik zemin katmanları.
 *
 * Pad'ler müzik parçalarının dokusudur; ambiyans paleti (`ambience.ts`)
 * bunlardan bilinçli olarak ayrı tutulur: pad'ler akor çalar ve ritmik
 * yapının içinde nefes alır, ambiyans voice'ları ise tek başına, ölçüsüz
 * ve armonisiz yaşar.
 */

import type { SynthesisResult } from '@volstudio/core/audio/synth';
import { renderVoice } from '../lib/mix';

/** Void pad — detune'lu koyu testere zemini, yavaş filtre hareketi. */
export function voidPad(frequency: number, duration: number, seed = 30): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: ['sawtooth', 'sawtooth'],
    frequency,
    detune: 9,
    envelope: {
      attack: duration * 0.22,
      hold: 0,
      decay: 0,
      sustain: duration * 0.5,
      release: duration * 0.28,
      sustainLevel: 1,
      curve: 'cosine',
    },
    lowpass: { cutoff: 680, resonance: 0.1, poles: 2 },
    highpass: { cutoff: 70 },
    lfos: [{ target: 'filter', rate: 0.07, depth: 170, wave: 'sine' }],
    reverb: { amount: 0.24, decay: 2.2, roomSize: 0.7, damp: 0.62 },
    stereoWidth: 1.25,
    gain: 0.2,
  });
}

/** Sıcak pad — additive harmonik seri; zafer/çözülme anlarının yumuşak zemini. */
export function warmPad(frequency: number, duration: number, seed = 31): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    harmonics: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.34, phase: 0.2 },
      { ratio: 3, gain: 0.14, phase: 0.45 },
      { ratio: 4, gain: 0.07, phase: 0.7 },
    ],
    frequency,
    envelope: {
      attack: duration * 0.18,
      hold: 0,
      decay: 0,
      sustain: duration * 0.52,
      release: duration * 0.3,
      sustainLevel: 1,
      curve: 'cosine',
    },
    lowpass: { cutoff: 1300, poles: 2 },
    highpass: { cutoff: 80 },
    reverb: { amount: 0.22, decay: 1.8, roomSize: 0.65, damp: 0.55 },
    stereoWidth: 1.2,
    gain: 0.22,
  });
}

/** Gerilim pad'i — dar bantlı, hafif rezonanslı; boss/savaş altı dokusu. */
export function tensionPad(frequency: number, duration: number, seed = 32): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: ['sawtooth', 'triangle'],
    frequency,
    detune: 12,
    envelope: {
      attack: duration * 0.15,
      hold: 0,
      decay: 0,
      sustain: duration * 0.55,
      release: duration * 0.3,
      sustainLevel: 1,
      curve: 'cosine',
    },
    lowpass: { cutoff: 540, resonance: 0.3, poles: 2 },
    highpass: { cutoff: 75 },
    lfos: [
      { target: 'filter', rate: 0.11, depth: 130, wave: 'triangle' },
      { target: 'amplitude', rate: 0.09, depth: 0.08, wave: 'sine' },
    ],
    reverb: { amount: 0.18, decay: 1.6, roomSize: 0.6, damp: 0.68 },
    stereoWidth: 1.15,
    gain: 0.18,
  });
}
