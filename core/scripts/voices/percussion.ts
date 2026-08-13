import { synth } from '../../src/audio/synth/engine';
import { pluck } from '../../src/audio/synth/physical';
import type { SynthesisResult } from '../../src/audio/synth/types';
import { SAMPLE_RATE } from '../audio-mix';
import { env, bedEnvelope } from './shared';

// ─── Mekanik perküsyon ──────────────────────────────────────────────

/**
 * Metal darbe — metal üstüne metal. Endüstriyel perküsyonun ana rengi.
 *
 * İnharmonik FM oranı (2.76) kasıtlı: tam sayı oran müzikal bir zil verir,
 * ondalık oran çan/metal plaka gibi belirsiz perdeli bir tını üretir.
 */
export function metalClank(freq: number, gain = 0.4, pan = 0, seed = 10): SynthesisResult {
  const duration = 0.55;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sine',
    frequency: freq,
    fm: {
      modulatorWave: 'sine',
      ratio: 2.76,
      index: 5.5,
      modulatorEnvelope: env(0.002, 0.09, 0, 0.14, 0.06, 'exponential'),
    },
    // Atak 2.5 ms: mekanik darbe doğal olarak anlık değil, ve üst üste binen
    // vuruşlarda toplam transient sertliğini sınırlar.
    envelope: env(0.0025, 0.11, 0, 0.36, 0.1, 'exponential'),
    lowpass: { cutoff: freq * 4.5, resonance: 0.35, poles: 2, type: 'bandpass' },
    highpass: { cutoff: 180, resonance: 0, poles: 2, type: 'highpass' },
    reverb: { amount: 0.3, decay: 1.6, roomSize: 0.7, damp: 0.55 },
    pan,
    stereoWidth: { width: 1.2 },
    gain,
  });
}

/**
 * Basınç boşalması — pnömatik valf / buhar.
 * Gürültü tabanlı, perdesiz; ritmik gride nefes katar.
 */
export function pressureHiss(gain = 0.22, pan = 0, seed = 11, brightness = 3200): SynthesisResult {
  const duration = 0.4;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'noise',
    frequency: brightness,
    envelope: env(0.004, 0.07, 0, 0.28, 0.12, 'exponential'),
    lowpass: { cutoff: brightness * 1.8, resonance: 0.1, poles: 2, type: 'lowpass' },
    highpass: { cutoff: brightness * 0.5, resonance: 0.15, poles: 2, type: 'highpass' },
    reverb: { amount: 0.24, decay: 1.4, roomSize: 0.65, damp: 0.5 },
    pan,
    stereoWidth: { width: 1.35 },
    gain,
  });
}

/**
 * Röle tıkırtısı — çok kısa mekanik anahtar sesi.
 * Ritmik dokuda hi-hat'in yerini tutar ama tiz değil, kuru ve orta bantta.
 */
export function machineTick(freq = 1400, gain = 0.18, pan = 0, seed = 12): SynthesisResult {
  const duration = 0.09;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'noise',
    frequency: freq,
    envelope: env(0.0015, 0.014, 0, 0.05, 0.06, 'exponential'),
    lowpass: { cutoff: freq * 1.6, resonance: 0.4, poles: 2, type: 'bandpass' },
    pan,
    gain,
  });
}

/**
 * Yapısal darbe — ağır kütlenin oturması. Kick'in endüstriyel karşılığı.
 * Perde düşüşü ile ağırlık hissi; tiz içerik yok.
 */
export function deepImpact(freq = 58, gain = 0.45, pan = 0, seed = 13): SynthesisResult {
  const duration = 0.75;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sine',
    frequency: freq,
    slide: -freq * 0.55,
    slideCurve: 'exponential',
    envelope: env(0.002, 0.2, 0, 0.42, 0.08, 'exponential'),
    lowpass: { cutoff: 320, resonance: 0.14, poles: 2, type: 'lowpass' },
    pan,
    gain,
  });
}

/**
 * Konveyör takırtısı — rezonanslı dar bantta gürültü.
 * Kısa aralıklarla tekrarlanınca çalışan bir bant hissi verir.
 */
export function conveyorRattle(freq = 320, gain = 0.16, pan = 0, seed = 14): SynthesisResult {
  const duration = 0.2;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'noise',
    frequency: freq,
    envelope: env(0.002, 0.035, 0, 0.12, 0.1, 'exponential'),
    lowpass: { cutoff: freq, resonance: 0.62, poles: 2, type: 'bandpass' },
    reverb: { amount: 0.18, decay: 0.9, roomSize: 0.5, damp: 0.6 },
    pan,
    gain,
  });
}
