/**
 * Pastoral / sıcak doğal ses paleti.
 *
 * Tasarım yönü (endüstriyel paletin tamamlayıcısı):
 *
 * - **Doğal, havadar, geniş.** Frekans spektrumu yumuşak ve yuvarlak; ani
 *   keskinlikler yok. Üst tınlar rüzgâr ve çan gibi uzak ve difüz.
 * - **Organik varyasyon.** LFO'lar yavaş ve derin; duyulur "nefes" hissi.
 * - **Sıcak bas.** Sub bass sine-tabanlı, distortion yok; vücut verir ama
 *   tehdit etmez.
 * - **Mallet ve çan.** Kısa vurgular orman/meadow temasına uygun; metalik
 *   değil, ahşap/taş hissi.
 * - **Additive ağırlıklı pad.** Harmonic seri yumuşak sine toplamlarından
 *   kurulur; sawtooth'un sertliği yok.
 * - **Her voice `normalize: false`.** Mix dengesi `audio-mix.ts` masterChain'de
 *   bir kez kurulur.
 */

import { synth } from '../src/audio/synth/engine';
import type { SynthesisResult, EnvelopeParams } from '../src/audio/synth/types';
import { SAMPLE_RATE } from './audio-mix';

/** Zarf kısayolu. */
function env(
  attack: number,
  decay: number,
  sustain: number,
  release: number,
  sustainLevel: number,
  curve: 'linear' | 'exponential' | 'cosine' = 'cosine',
): EnvelopeParams {
  return { attack, hold: 0, decay, sustain, release, sustainLevel, curve };
}

/** Uzun yatak katmanları için yavaş giriş/çıkış zarfı. */
function bedEnvelope(duration: number, attack = 1.5, release = 2.0): EnvelopeParams {
  const sustain = Math.max(0.1, duration - attack - release);
  return env(attack, 0, sustain, release, 1.0, 'cosine');
}

/**
 * Sıcak rüzgâr — yumuşak nefes/pink noise.
 * Üst tınılar uzak, alçak geçiren filtre yavaşça hareket eder.
 */
export function warmBreeze(duration: number, gain = 0.12, pan = 0, seed = 100): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'pink',
    frequency: 350,
    envelope: bedEnvelope(duration, 2.0, 2.5),
    lowpass: { cutoff: 820, resonance: 0.12, poles: 2, type: 'lowpass' },
    highpass: { cutoff: 160, resonance: 0, poles: 2, type: 'highpass' },
    lfos: [
      { target: 'filter', rate: 0.08, depth: 320, wave: 'sine' },
      { target: 'amplitude', rate: 0.045, depth: 0.25, wave: 'sine' },
    ],
    reverb: { amount: 0.4, decay: 4.0, roomSize: 0.9, damp: 0.45, preDelay: 0.03 },
    pan,
    stereoWidth: { width: 1.5 },
    gain,
  });
}

/**
 * Güneşli pad — additive sine harmonikler, yumuşak vibrato.
 * Akor köküne yaslanan, pastoral temaların ana zemin sesi.
 */
export function sunlitPad(
  freq: number,
  duration: number,
  gain = 0.15,
  pan = 0,
  seed = 101,
): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    harmonics: [
      { ratio: 1, gain: 1.0, phase: 0 },
      { ratio: 2, gain: 0.5, phase: 0.06 },
      { ratio: 3, gain: 0.32, phase: 0.12 },
      { ratio: 4, gain: 0.2, phase: 0.04 },
      { ratio: 5, gain: 0.12, phase: 0.18 },
      { ratio: 6, gain: 0.08, phase: 0.09 },
    ],
    frequency: freq,
    detune: 7,
    envelope: bedEnvelope(duration, 1.2, 2.0),
    lowpass: { cutoff: 1200, resonance: 0.04, poles: 2, type: 'lowpass' },
    lfos: [
      { target: 'filter', rate: 0.1, depth: 100, wave: 'sine' },
      { target: 'amplitude', rate: 0.06, depth: 0.08, wave: 'sine' },
    ],
    chorus: { depth: 2.0, rate: 0.12, mix: 0.3 },
    reverb: { amount: 0.35, decay: 3.5, roomSize: 0.85, damp: 0.5, preDelay: 0.03 },
    pan,
    stereoWidth: { width: 1.3 },
    gain,
  });
}

/**
 * Yumuşak bas — sine sub + az triangle üst katman.
 * Sıcak, destekleyici; endüstriyel basın "gurultulu" hali değil.
 */
export function mossBass(
  freq: number,
  duration: number,
  gain = 0.28,
  pan = 0,
  seed = 102,
): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: ['sine', 'triangle'],
    frequency: freq,
    detune: 5,
    envelope: bedEnvelope(duration, 0.5, 1.2),
    lowpass: { cutoff: 180, resonance: 0.06, poles: 2, type: 'lowpass' },
    lfos: [{ target: 'filter', rate: 0.03, depth: 30, wave: 'sine' }],
    reverb: { amount: 0.15, decay: 1.8, roomSize: 0.6, damp: 0.55, preDelay: 0.02 },
    pan,
    stereoWidth: { width: 0.8 },
    gain,
  });
}

/**
 * Brook shimmer — yüksek, yumuşak, hareketli pırıltı.
 * Su veya hafif yaprak hışırtısı hissi.
 */
export function brookShimmer(
  freq: number,
  duration: number,
  gain = 0.08,
  pan = 0,
  seed = 103,
): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'pink',
    frequency: freq,
    envelope: bedEnvelope(duration, 1.8, 2.5),
    lowpass: { cutoff: 4200, resonance: 0.08, poles: 2, type: 'lowpass' },
    highpass: { cutoff: 1200, resonance: 0, poles: 2, type: 'highpass' },
    lfos: [
      { target: 'filter', rate: 0.18, depth: 600, wave: 'sine' },
      { target: 'amplitude', rate: 0.12, depth: 0.3, wave: 'sine' },
    ],
    reverb: { amount: 0.5, decay: 3.0, roomSize: 0.95, damp: 0.4, preDelay: 0.04 },
    pan,
    stereoWidth: { width: 1.6 },
    gain,
  });
}

/**
 * Uzak çan — FM zil, uzak ve difüz.
 * Sıcak değil, serin ama pastoral; vurgu değil aksan.
 */
export function distantChime(freq: number, gain = 0.18, pan = 0, seed = 104): SynthesisResult {
  const duration = 2.4;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sine',
    frequency: freq,
    fm: {
      modulatorWave: 'sine',
      ratio: 2.0,
      index: 0.9,
      modulatorEnvelope: {
        attack: 0.005,
        hold: 0,
        decay: 0.25,
        sustain: 0,
        release: 0.6,
        sustainLevel: 0.05,
        curve: 'exponential',
      },
    },
    envelope: {
      attack: 0.006,
      hold: 0.03,
      decay: 0.35,
      sustain: 0.18,
      release: 1.4,
      sustainLevel: 0.35,
      curve: 'exponential',
    },
    lowpass: { cutoff: 6000, resonance: 0.05, poles: 2, type: 'lowpass' },
    reverb: { amount: 0.55, decay: 4.0, roomSize: 0.95, damp: 0.35, preDelay: 0.03 },
    pan,
    stereoWidth: { width: 1.4 },
    gain,
  });
}

/**
 * Ahşap mallet vuruşu — kısa, sıcak, topraklı.
 * Arpeggio veya motif figürleri için.
 */
export function woodenMallet(
  freq: number,
  duration = 0.5,
  gain = 0.3,
  pan = 0,
  seed = 105,
): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    harmonics: [
      { ratio: 1, gain: 1.0, phase: 0 },
      { ratio: 2.8, gain: 0.28, phase: 0.1 },
      { ratio: 4.5, gain: 0.1, phase: 0.2 },
    ],
    frequency: freq,
    envelope: {
      attack: 0.003,
      hold: 0,
      decay: 0.1,
      sustain: 0.05,
      release: 0.25,
      sustainLevel: 0.3,
      curve: 'exponential',
    },
    lowpass: { cutoff: 2800, resonance: 0.05, poles: 2, type: 'lowpass' },
    reverb: { amount: 0.2, decay: 1.2, roomSize: 0.55, damp: 0.6, preDelay: 0.01 },
    pan,
    stereoWidth: { width: 0.5 },
    gain,
  });
}

/**
 * Orman zemin yatağı — softWind + brookShimmer karışımı.
 * Parça boyunca duran genel atmosfer.
 */
export function woodlandBed(
  duration: number,
  options: { level?: number; brightness?: number; seedBase?: number; spread?: number } = {},
): SynthesisResult[] {
  const { level = 1, brightness = 1, seedBase = 200, spread = 0.4 } = options;
  return [
    warmBreeze(duration, 0.12 * level, -spread, seedBase),
    brookShimmer(1800, duration, 0.07 * level * brightness, spread, seedBase + 1),
    sunlitPad(220, duration, 0.1 * level, 0, seedBase + 2),
  ];
}

/**
 * Tozlu yol — yavaş hareketli drone, ağır lowpass.
 * Yürüyüş/sabır temaları için zemin.
 */
export function dustRoad(
  freq: number,
  duration: number,
  gain = 0.14,
  pan = 0,
  seed = 106,
): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'triangle',
    frequency: freq,
    detune: 8,
    envelope: bedEnvelope(duration, 2.0, 2.5),
    lowpass: { cutoff: 380, resonance: 0.06, poles: 2, type: 'lowpass' },
    highpass: { cutoff: 50, resonance: 0, poles: 2, type: 'highpass' },
    lfos: [
      { target: 'filter', rate: 0.06, depth: 90, wave: 'sine' },
      { target: 'amplitude', rate: 0.04, depth: 0.12, wave: 'sine' },
    ],
    reverb: { amount: 0.28, decay: 3.2, roomSize: 0.8, damp: 0.5, preDelay: 0.03 },
    pan,
    stereoWidth: { width: 1.2 },
    gain,
  });
}
