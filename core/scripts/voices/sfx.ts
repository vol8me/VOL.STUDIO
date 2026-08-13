import { synth } from '../../src/audio/synth/engine';
import { pluck } from '../../src/audio/synth/physical';
import type { SynthesisResult } from '../../src/audio/synth/types';
import { SAMPLE_RATE } from '../audio-mix';
import { env, bedEnvelope } from './shared';

// ─── SFX odaklı sesler ──────────────────────────────────────────────
//
// Bu grup müzikle AYNI sözlükten kurulur; ayrı bir sentez felsefesi yok.
// Eskiden SFX çıplak sawtooth/triangle/sine + kısa ADSR ile üretiliyordu ve
// klasik konsol (chiptune) karakteri veriyordu — müzik ise additive/FM ile
// organik duruyordu. İki taraf aynı oyunda tutarsız bir kimlik oluşturuyordu.
// Aynı FM/bandpass/gürültü yaklaşımı burada da kullanılır.

/**
 * Elektrik boşalması — silah atışı. Lazer değil: bobin deşarjı.
 *
 * İnharmonik FM + hızlı düşen bandpass: kıvılcım karakteri. Perde düşüşü
 * enerjinin boşaldığını anlatır.
 */
export function electricDischarge(freq: number, gain = 0.5, pan = 0, seed = 30): SynthesisResult {
  const duration = 0.26;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sawtooth',
    frequency: freq,
    slide: -freq * 0.45,
    slideCurve: 'exponential',
    fm: {
      modulatorWave: 'square',
      ratio: 1.87,
      index: 2.2,
      modulatorEnvelope: env(0.001, 0.05, 0, 0.08, 0.04, 'exponential'),
    },
    envelope: env(0.0022, 0.055, 0, 0.16, 0.12, 'exponential'),
    lowpass: {
      cutoff: freq * 3.2,
      resonance: 0.3,
      poles: 2,
      type: 'lowpass',
      envelope: env(0.002, 0.06, 0, 0.14, 0.12, 'exponential'),
      envAmount: 0.65,
    },
    highpass: { cutoff: 160, resonance: 0, poles: 2, type: 'highpass' },
    pan,
    gain,
  });
}

/**
 * Servo zorlanması — motor/aktüatör gerilimi. Hasar ve hareket seslerinde
 * mekanik "canlılık" katar.
 */
export function servoStrain(
  freq: number,
  duration: number,
  gain = 0.3,
  pan = 0,
  seed = 31,
): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sawtooth',
    frequency: freq,
    slide: freq * 0.35,
    slideCurve: 'cosine',
    detune: 12,
    envelope: env(0.008, 0.06, Math.max(0.02, duration * 0.3), 0.12, 0.55, 'cosine'),
    lowpass: { cutoff: 1100, resonance: 0.42, poles: 2, type: 'bandpass' },
    pan,
    gain,
  });
}

/**
 * Yapısal çöküş — ölüm / düşman yıkımı.
 *
 * Alçalan perde + genişleyen gürültü: kütlenin dağılması. Uzun kuyruk
 * kasıtlı, olayın ağırlığını taşıyor.
 */
export function structuralCollapse(
  freq: number,
  duration: number,
  gain = 0.5,
  pan = 0,
  seed = 32,
): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'brown',
    frequency: freq,
    slide: -freq * 0.6,
    slideCurve: 'exponential',
    envelope: env(0.006, duration * 0.35, 0, duration * 0.55, 0.25, 'exponential'),
    lowpass: {
      cutoff: 900,
      resonance: 0.18,
      poles: 2,
      type: 'lowpass',
      envelope: env(0.006, duration * 0.4, 0, duration * 0.5, 0.12, 'exponential'),
      envAmount: 0.6,
    },
    highpass: { cutoff: 70, resonance: 0, poles: 2, type: 'highpass' },
    reverb: { amount: 0.3, decay: 1.8, roomSize: 0.72, damp: 0.5 },
    pan,
    stereoWidth: { width: 1.25 },
    gain,
  });
}

/**
 * Röle kliği — UI onay/gezinme. `machineTick`'ten daha kuru ve daha kısa.
 * Elektromekanik anahtar: tek, net, tiz olmayan bir tık.
 */
export function relayClick(freq = 1750, gain = 0.4, pan = 0, seed = 33): SynthesisResult {
  const duration = 0.075;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'noise',
    frequency: freq,
    envelope: env(0.0012, 0.009, 0, 0.038, 0.05, 'exponential'),
    lowpass: { cutoff: freq, resonance: 0.55, poles: 2, type: 'bandpass' },
    pan,
    gain,
  });
}

/**
 * Sekme — mermi metalden sıçrıyor. Kısa, inharmonik, perdeli.
 */
export function ricochet(freq: number, gain = 0.4, pan = 0, seed = 34): SynthesisResult {
  const duration = 0.3;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sine',
    frequency: freq,
    slide: freq * 0.5,
    slideCurve: 'exponential',
    fm: {
      modulatorWave: 'sine',
      ratio: 4.13,
      index: 3.2,
      modulatorEnvelope: env(0.001, 0.04, 0, 0.1, 0.05, 'exponential'),
    },
    envelope: env(0.0018, 0.05, 0, 0.2, 0.1, 'exponential'),
    lowpass: { cutoff: freq * 3, resonance: 0.3, poles: 2, type: 'bandpass' },
    reverb: { amount: 0.22, decay: 1.0, roomSize: 0.55, damp: 0.55 },
    pan,
    gain,
  });
}

/**
 * Güç rampası — sistem açılışı/kapanışı. `direction` yönü belirler.
 * Duraklat/devam ve yeniden başlat seslerinin gövdesi.
 */
export function powerRamp(
  freq: number,
  duration: number,
  direction: 'up' | 'down',
  gain = 0.35,
  pan = 0,
  seed = 35,
): SynthesisResult {
  const slide = direction === 'up' ? freq * 0.8 : -freq * 0.45;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sawtooth',
    frequency: freq,
    slide,
    slideCurve: 'cosine',
    detune: 10,
    envelope:
      direction === 'up'
        ? env(0.02, 0.05, duration * 0.35, duration * 0.35, 0.6, 'cosine')
        : env(0.006, duration * 0.3, 0, duration * 0.5, 0.4, 'exponential'),
    lowpass: {
      cutoff: direction === 'up' ? 340 : 620,
      resonance: 0.25,
      poles: 2,
      type: 'lowpass',
      envelope: env(0.01, duration * 0.3, duration * 0.2, duration * 0.3, 0.35, 'cosine'),
      envAmount: direction === 'up' ? 0.7 : 0.5,
    },
    pan,
    gain,
  });
}

/**
 * Filtrelenmiş darbe dizisi elemanı — mekanik bas sekansı.
 * Pulse dalgası + filtre zarfı: kapanıp açılan bir valf gibi.
 */
export function filteredPulse(
  freq: number,
  duration: number,
  gain = 0.26,
  pan = 0,
  seed = 22,
): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'pulse',
    pulseWidth: 0.32,
    frequency: freq,
    detune: 5,
    envelope: env(0.006, 0.1, Math.max(0.02, duration * 0.35), 0.16, 0.45, 'exponential'),
    lowpass: {
      cutoff: 420,
      resonance: 0.22,
      poles: 2,
      type: 'lowpass',
      envelope: env(0.004, 0.12, 0.05, 0.2, 0.2, 'exponential'),
      envAmount: 0.6,
    },
    reverb: { amount: 0.14, decay: 1.1, roomSize: 0.55, damp: 0.6 },
    pan,
    gain,
  });
}
