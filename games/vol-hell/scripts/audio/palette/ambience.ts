/**
 * Ambiyans paleti — müzikten BİLİNÇLİ olarak ayrık ses dünyası.
 *
 * Kurallar:
 * - Ritim yok: hiçbir voice tempoya oturmaz, periyotlar ölçüye bölünmez.
 * - Melodi yok: motif kurulmaz; tek ton, aralıklı olaylar ve yavaş nefes var.
 * - Orta bant boş bırakılır: oyun SFX enerjisi 200-3000 Hz bandında yaşar;
 *   ambiyans alçak bantta (drone/rumble) ve seyrek olaylarda kalır.
 * - Sürekli hiss yasak: gürültü yalnızca 200 Hz altına filtrelenmiş rumble
 *   olarak, düşük kazançla kullanılır.
 */

import type { SynthesisResult } from '@volstudio/audio-synth';
import { renderVoice } from '../lib/mix';

/** Uçurum drone'u — detune'lu sine çifti; yavaş, ölçüsüz dalgalanma. */
export function abyssDrone(frequency: number, duration: number, seed = 50): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: 'sine',
    frequency,
    detune: 6,
    envelope: {
      attack: duration * 0.24,
      hold: 0,
      decay: 0,
      sustain: duration * 0.5,
      release: duration * 0.26,
      sustainLevel: 1,
      curve: 'cosine',
    },
    lowpass: { cutoff: 420 },
    lfos: [{ target: 'amplitude', rate: 0.045, depth: 0.16, wave: 'sine' }],
    reverb: { amount: 0.3, decay: 3.4, roomSize: 0.85, damp: 0.6, preDelay: 0.04 },
    stereoWidth: 1.3,
    gain: 0.3,
  });
}

/** Nefes kabarması — üçgen temelli, yavaşça şişip sönen tek ton. */
export function breathSwell(frequency: number, duration: number, seed = 51): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: 'triangle',
    frequency,
    envelope: {
      attack: duration * 0.42,
      hold: 0,
      decay: 0,
      sustain: duration * 0.1,
      release: duration * 0.48,
      sustainLevel: 1,
      curve: 'cosine',
    },
    lowpass: { cutoff: 520, poles: 2 },
    highpass: { cutoff: 55 },
    lfos: [{ target: 'filter', rate: 0.06, depth: 110, wave: 'sine' }],
    reverb: { amount: 0.26, decay: 2.8, roomSize: 0.8, damp: 0.65 },
    stereoWidth: 1.2,
    gain: 0.24,
  });
}

/** Uzak çan — seyrek, tek başına düşen koyu FM olayı. */
export function farToll(frequency: number, duration = 7, seed = 52): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: 'sine',
    frequency,
    fm: {
      modulatorWave: 'sine',
      ratio: 2.74,
      index: 1.1,
      modulatorEnvelope: {
        attack: 0.005,
        hold: 0.02,
        decay: duration * 0.3,
        sustain: 0,
        release: duration * 0.4,
        sustainLevel: 0.08,
        curve: 'exponential',
      },
    },
    envelope: {
      attack: 0.01,
      hold: 0.04,
      decay: duration * 0.35,
      sustain: 0,
      release: duration * 0.55,
      sustainLevel: 0.22,
      curve: 'cosine',
    },
    lowpass: { cutoff: 1250, poles: 2 },
    highpass: { cutoff: 85 },
    reverb: { amount: 0.34, decay: 3.8, roomSize: 0.9, damp: 0.55, preDelay: 0.05 },
    gain: 0.2,
  });
}

/** Zemin uğultusu — 170 Hz altına hapsedilmiş brown rumble; hiss üretmez. */
export function underRumble(duration: number, seed = 53): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: 'brown',
    envelope: {
      attack: duration * 0.2,
      hold: 0,
      decay: 0,
      sustain: duration * 0.56,
      release: duration * 0.24,
      sustainLevel: 1,
      curve: 'cosine',
    },
    lowpass: { cutoff: 170, poles: 4 },
    lfos: [{ target: 'amplitude', rate: 0.07, depth: 0.22, wave: 'sine' }],
    gain: 0.26,
  });
}

/** Sub nabzı — ölçüsüz aralıklarla kabaran tek alçak vuruş değil, dalga. */
export function subSurge(frequency: number, duration: number, seed = 54): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: 'sine',
    frequency,
    envelope: {
      attack: duration * 0.38,
      hold: 0,
      decay: 0,
      sustain: 0,
      release: duration * 0.62,
      sustainLevel: 1,
      curve: 'cosine',
    },
    lowpass: { cutoff: 120 },
    gain: 0.34,
  });
}
