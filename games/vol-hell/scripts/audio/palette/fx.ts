/**
 * Geçiş / vurgu efektleri — müzik parçalarının bölüm dikişleri.
 *
 * Riser gürültü DEĞİL, FM index'i zamanla açılan tonal bir yükseliştir;
 * tema "cızırtısız yükseliş" ister. Impact ise alçak bantta yaşar.
 */

import type { SynthesisResult } from '@volstudio/audio-synth';
import { renderVoice } from '../lib/mix';
import { layer } from './shared';

/** Derin impact — bölüm başlarını mühürleyen alçak darbe. */
export function deepImpact(seed = 40): SynthesisResult {
  const thump = renderVoice({
    seed,
    duration: 0.9,
    wave: 'sine',
    frequency: 64,
    slide: -26,
    slideCurve: 'exponential',
    envelope: {
      attack: 0.003,
      hold: 0.03,
      decay: 0.35,
      sustain: 0,
      release: 0.4,
      sustainLevel: 0.3,
      curve: 'cosine',
    },
    lowpass: { cutoff: 160 },
    gain: 0.8,
  });
  const bloom = renderVoice({
    seed: seed + 3,
    duration: 1.4,
    wave: 'sine',
    frequency: 128,
    fm: { modulatorWave: 'sine', ratio: 1.4, index: 0.8 },
    envelope: {
      attack: 0.01,
      hold: 0.05,
      decay: 0.5,
      sustain: 0,
      release: 0.7,
      sustainLevel: 0.25,
      curve: 'cosine',
    },
    lowpass: { cutoff: 700 },
    reverb: { amount: 0.3, decay: 1.6, roomSize: 0.75, damp: 0.6 },
    gain: 0.3,
  });
  return layer({ voice: thump }, { voice: bloom, at: 0.01 });
}

/** Tonal riser — FM index'i açılarak yükselen gerilim; gürültüsüz. */
export function tonalRiser(duration: number, frequency = 110, seed = 41): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: 'sine',
    frequency,
    slide: frequency * 1.6,
    slideCurve: 'cosine',
    fm: {
      modulatorWave: 'triangle',
      ratio: 2.01,
      index: 2.4,
      modulatorEnvelope: {
        attack: duration * 0.85,
        hold: duration * 0.1,
        decay: 0,
        sustain: 0,
        release: duration * 0.05,
        sustainLevel: 1,
        curve: 'linear',
      },
    },
    envelope: {
      attack: duration * 0.7,
      hold: duration * 0.18,
      decay: 0,
      sustain: 0,
      release: duration * 0.12,
      sustainLevel: 1,
      curve: 'cosine',
    },
    lowpass: { cutoff: 950, poles: 2 },
    highpass: { cutoff: 70 },
    gain: 0.16,
  });
}

/** Sub düşüşü — doruk kapanışında zemine inen alçak kayma. */
export function subDrop(seed = 42): SynthesisResult {
  return renderVoice({
    seed,
    duration: 1.1,
    wave: 'sine',
    frequency: 84,
    slide: -46,
    slideCurve: 'exponential',
    envelope: {
      attack: 0.01,
      hold: 0.08,
      decay: 0.45,
      sustain: 0,
      release: 0.5,
      sustainLevel: 0.4,
      curve: 'cosine',
    },
    lowpass: { cutoff: 130 },
    gain: 0.55,
  });
}
