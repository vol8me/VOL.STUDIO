import type { HarmonicParams, SynthParams } from '../types';
import { reach, belowFundamental } from './utils';

/**
 * Piyano presetleri — YENİ DSP YOK.
 *
 * Kuyruklu, duvar ve honky-tonk piyano `synth` motorunun additive yolunu
 * kullanır. Her preset telli piyano karakterini (inharmoniklik, sert çekiç,
 * gövde sönümü, yüksek tonların hızla solaruşu) parameterize eder.
 */

const DEFAULT_SAMPLE_RATE = 44100;

function inharmonicRatio(n: number, b: number): number {
  return n * Math.sqrt(1 + b * n * n);
}

function partialGain(n: number, hammerHardness: number): number {
  const rolloff = 1 + (1 - hammerHardness) * 0.7;
  return 1 / Math.pow(n, rolloff);
}

function buildHarmonics(
  frequency: number,
  b: number,
  hammerHardness: number,
  maxPartials = 16,
  sampleRate = DEFAULT_SAMPLE_RATE,
): HarmonicParams[] {
  const nyquist = sampleRate / 2;
  const harmonics: HarmonicParams[] = [];
  for (let n = 1; n <= maxPartials; n++) {
    const ratio = inharmonicRatio(n, b);
    if (frequency * ratio > nyquist) break;
    harmonics.push({
      ratio,
      gain: partialGain(n, hammerHardness),
      phase: n * 0.07,
    });
  }
  return harmonics;
}

interface PianoBodyParams {
  b: number;
  hammerHardness: number;
  maxPartials: number;
  lowpassHarmonic: number;
  lowpassFloor: number;
  decay: number;
  sustain: number;
  release: number;
  sustainLevel: number;
  reverbAmount: number;
  reverbDecay: number;
  stereoWidth: number;
  gain: number;
  detune: number;
}

function pianoBody(frequency: number, duration: number, params: PianoBodyParams): SynthParams {
  const harmonics = buildHarmonics(frequency, params.b, params.hammerHardness, params.maxPartials);
  return {
    frequency,
    duration,
    harmonics,
    envelope: {
      attack: 0.002,
      hold: 0.005,
      decay: params.decay,
      sustain: params.sustain,
      release: params.release,
      sustainLevel: params.sustainLevel,
    },
    highpass: {
      cutoff: belowFundamental(frequency, 50),
      resonance: 0.04,
      poles: 2,
      type: 'highpass',
    },
    lowpass: {
      cutoff: reach(frequency, params.lowpassHarmonic, params.lowpassFloor),
      resonance: 0.05,
      poles: 2,
      type: 'lowpass',
      slide: -2500,
      envelope: {
        attack: 0,
        hold: 0,
        decay: params.decay * 0.6,
        sustain: 0,
        release: 0.1,
        sustainLevel: 0,
      },
      envAmount: 0.7,
    },
    reverb: { amount: params.reverbAmount, decay: params.reverbDecay, roomSize: 0.65, damp: 0.45 },
    stereoWidth: params.stereoWidth,
    detune: params.detune,
    gain: params.gain,
  };
}

// ─── Kuyruklu piyano ────────────────────────────────────────────────

/** Kuyruklu piyano — A0 (27,5 Hz) ile C8 (4186 Hz) arası, uzun sustain. */
export function grandPiano(frequency = 440, duration = 2.0): SynthParams {
  return pianoBody(frequency, duration, {
    b: 0.00025,
    hammerHardness: 0.55,
    maxPartials: 18,
    lowpassHarmonic: 16,
    lowpassFloor: 7000,
    decay: 0.6,
    sustain: duration - 1.0,
    release: 1.2,
    sustainLevel: 0.25,
    reverbAmount: 0.28,
    reverbDecay: 2.2,
    stereoWidth: 0.4,
    gain: 0.55,
    detune: 3,
  });
}

// ─── Duvar piyanosu ─────────────────────────────────────────────────

/** Duvar piyanosu — daha kısa gövde, hızlı sönüm, daha yüksek sertlik. */
export function uprightPiano(frequency = 440, duration = 1.4): SynthParams {
  return pianoBody(frequency, duration, {
    b: 0.0005,
    hammerHardness: 0.45,
    maxPartials: 14,
    lowpassHarmonic: 12,
    lowpassFloor: 5000,
    decay: 0.45,
    sustain: duration - 0.8,
    release: 0.7,
    sustainLevel: 0.2,
    reverbAmount: 0.2,
    reverbDecay: 1.4,
    stereoWidth: 0.3,
    gain: 0.6,
    detune: 4,
  });
}

// ─── Honky-tonk piyanosu ────────────────────────────────────────────

/** Honky-tonk piyanosu — parlak, hafif detune, kısa, "tack" karakter. */
export function honkyTonkPiano(frequency = 440, duration = 1.0): SynthParams {
  return pianoBody(frequency, duration, {
    b: 0.0008,
    hammerHardness: 0.75,
    maxPartials: 12,
    lowpassHarmonic: 14,
    lowpassFloor: 6500,
    decay: 0.35,
    sustain: duration - 0.6,
    release: 0.4,
    sustainLevel: 0.15,
    reverbAmount: 0.15,
    reverbDecay: 1.0,
    stereoWidth: 0.25,
    gain: 0.65,
    detune: 11,
  });
}

// ─── Hazırlanmış piyano (Cage) ──────────────────────────────────────

/** Prepared piyano — mutfak eşyası arasına tel koyulmuş, "tın" yerine "tak". */
export function preparedPiano(frequency = 440, duration = 0.9): SynthParams {
  return pianoBody(frequency, duration, {
    b: 0.0015,
    hammerHardness: 0.35,
    maxPartials: 10,
    lowpassHarmonic: 8,
    lowpassFloor: 2800,
    decay: 0.25,
    sustain: duration - 0.5,
    release: 0.3,
    sustainLevel: 0.1,
    reverbAmount: 0.12,
    reverbDecay: 0.8,
    stereoWidth: 0.2,
    gain: 0.55,
    detune: 7,
  });
}
