import { synth } from '../../src/audio/synth/engine';
import { pluck } from '../../src/audio/synth/physical';
import type { SynthesisResult } from '../../src/audio/synth/types';
import { SAMPLE_RATE } from '../audio-mix';
import { env, bedEnvelope } from './shared';

// ─── Sinyal / seyrek melodik ────────────────────────────────────────

/**
 * Sinyal tonu — uzaktaki bir işaret/alarm. Melodi taşıyıcısı.
 *
 * Tek osilatör, ağır filtre, hafif perde kayması. Kasıtlı olarak sade:
 * Mindustry'de melodi 2-4 notalık bir motiften ibarettir, virtüözite yok.
 */
export function signalTone(
  freq: number,
  duration: number,
  gain = 0.2,
  pan = 0,
  seed = 20,
): SynthesisResult {
  const release = 0.9;
  const attack = 0.18;
  const sustain = Math.max(0.08, duration - attack - release * 0.4);
  return synth(duration + release, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'triangle',
    frequency: freq,
    detune: 6,
    envelope: env(attack, 0, sustain, release, 0.85, 'cosine'),
    lowpass: { cutoff: 1600, resonance: 0.1, poles: 2, type: 'lowpass' },
    // Çok hafif vibrato: elektronik bir osilatörün ısı kaymasını taklit eder,
    // sesin "cansız dijital" durmasını engeller.
    vibratoDepth: 1.6,
    vibratoRate: 0.22,
    reverb: { amount: 0.45, decay: 4.5, roomSize: 0.88, damp: 0.42 },
    pan,
    stereoWidth: { width: 1.2 },
    gain,
  });
}

/**
 * Soğuk ping — seyrek kullanılan inharmonik vurgu.
 * Sıcak zil değil; cam/seramik gibi kuru ve kısa kuyruklu.
 */
export function glassPing(freq: number, gain = 0.16, pan = 0, seed = 21): SynthesisResult {
  const duration = 1.4;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sine',
    frequency: freq,
    fm: {
      modulatorWave: 'sine',
      ratio: 3.37,
      index: 2.4,
      modulatorEnvelope: env(0.003, 0.25, 0, 0.5, 0.05, 'exponential'),
    },
    envelope: env(0.004, 0.3, 0, 1.0, 0.12, 'exponential'),
    lowpass: { cutoff: 4200, resonance: 0.06, poles: 2, type: 'lowpass' },
    reverb: { amount: 0.4, decay: 3.2, roomSize: 0.8, damp: 0.5 },
    pan,
    stereoWidth: { width: 1.3 },
    gain,
  });
}

/**
 * Gerilmiş kablo — sönümlü fiziksel tel.
 * `pluck` gövde rezonansı düşük tutulur: akustik gitar değil, çelik halat.
 */
export function cableTension(
  freq: number,
  duration: number,
  velocity = 1,
  pan = 0,
  seed = 42,
): SynthesisResult {
  return pluck({
    frequency: freq,
    duration,
    sampleRate: SAMPLE_RATE,
    seed,
    // Yüksek sönüm: tel hızlı ölür, "çınlayan" akustik kuyruk bırakmaz.
    decay: 0.982,
    excitationMix: 0.5,
    excitationHarmonics: 3,
    stereoWidth: 0.35,
    gain: 0.35 * velocity,
    bodyResonance: freq * 1.5,
    bodyAmount: 0.12,
  });
}
