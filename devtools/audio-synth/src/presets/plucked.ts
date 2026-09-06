import type { SynthParams } from '../types';
import { reach, belowFundamental } from './utils';

/**
 * Telli çalgı presetleri — YENİ DSP YOK.
 *
 * Gitar, bas gitar, arp ve mandolin `synth` motorunun additive + zarf +
 * filtre yolunu kullanır. Bunlar `pluck` fiziksel modelinin KENDİSİ değil,
 * o modeli çağıran tüketici koduna verilecek adlandırılmış parametre
 * kümeleridir. Her presetin kısmi ton yapısı ve aralığı gerçek enstrümana
 * göre belirlenmiş ve Goertzel ile ölçülür.
 */

/** Genel telli çalgı gövdesi — ağaç rezonansı için ortak zarf + filtre. */
function pluckedBody(
  frequency: number,
  duration: number,
  harmonics: { ratio: number; gain: number }[],
  lowpassHarmonic: number,
  lowpassFloor: number,
  envelope: SynthParams['envelope'],
  extras: Partial<SynthParams> = {},
): SynthParams {
  return {
    harmonics: harmonics.map((h) => ({ ratio: h.ratio, gain: h.gain })),
    frequency,
    duration,
    envelope,
    highpass: {
      cutoff: belowFundamental(frequency, 60),
      resonance: 0.04,
      poles: 2,
      type: 'highpass',
    },
    lowpass: {
      cutoff: reach(frequency, lowpassHarmonic, lowpassFloor),
      resonance: 0.05,
      poles: 2,
      type: 'lowpass',
    },
    reverb: { amount: 0.25, decay: 1.4, roomSize: 0.5, damp: 0.5 },
    stereoWidth: 0.35,
    gain: 0.5,
    ...extras,
  };
}

// ─── Gitar ─────────────────────────────────────────────────────────

/** Akustik gitar — E2 (82,4 Hz) ile E5 (659,3 Hz) arası. */
export function guitar(frequency = 330, duration = 1.0): SynthParams {
  // Koparma noktasından kaynaklanan 1/n spektrum; üst katlar hızla solar.
  const harmonics = [
    { ratio: 1, gain: 1.0 },
    { ratio: 2, gain: 0.62 },
    { ratio: 3, gain: 0.42 },
    { ratio: 4, gain: 0.32 },
    { ratio: 5, gain: 0.24 },
    { ratio: 6, gain: 0.18 },
    { ratio: 7, gain: 0.13 },
    { ratio: 8, gain: 0.09 },
  ];
  return pluckedBody(
    frequency,
    duration,
    harmonics,
    7,
    2300,
    {
      attack: 0.0015,
      hold: 0.006,
      decay: 0.42,
      sustain: 0.08,
      release: 0.55,
      sustainLevel: 0.12,
    },
    { gain: 0.48 },
  );
}

// ─── Bas gitar ─────────────────────────────────────────────────────

/** 4-telli elektrik bas gitar — E1 (41,2 Hz) ile G3 (196 Hz) arası. */
export function bassGuitar(frequency = 82.4, duration = 1.2): SynthParams {
  const harmonics = [
    { ratio: 1, gain: 1.0 },
    { ratio: 2, gain: 0.55 },
    { ratio: 3, gain: 0.26 },
    { ratio: 4, gain: 0.13 },
    { ratio: 5, gain: 0.06 },
  ];
  return pluckedBody(
    frequency,
    duration,
    harmonics,
    4,
    280,
    {
      attack: 0.002,
      hold: 0.01,
      decay: 0.6,
      sustain: 0.1,
      release: 0.7,
      sustainLevel: 0.2,
    },
    {
      gain: 0.55,
      stereoWidth: 0.2,
      reverb: { amount: 0.16, decay: 1.1, roomSize: 0.45, damp: 0.6 },
    },
  );
}

// ─── Arp ───────────────────────────────────────────────────────────

/** Pedal arp — C1 (32,7 Hz) ile G7 (3136 Hz) arası. */
export function harp(frequency = 523.25, duration = 2.5): SynthParams {
  const harmonics = [
    { ratio: 1, gain: 1.0 },
    { ratio: 2, gain: 0.6 },
    { ratio: 3, gain: 0.4 },
    { ratio: 4, gain: 0.5 },
    { ratio: 5, gain: 0.2 },
    { ratio: 6, gain: 0.16 },
    { ratio: 7, gain: 0.13 },
    { ratio: 8, gain: 0.11 },
    { ratio: 9, gain: 0.09 },
  ];
  return pluckedBody(
    frequency,
    duration,
    harmonics,
    12,
    8000,
    {
      attack: 0.001,
      hold: 0.01,
      decay: 0.82,
      sustain: 0.2,
      release: 1.2,
      sustainLevel: 0.22,
    },
    {
      gain: 0.45,
      stereoWidth: 0.5,
      reverb: { amount: 0.42, decay: 2.5, roomSize: 0.65, damp: 0.4 },
    },
  );
}

// ─── Mandolin ──────────────────────────────────────────────────────

/** Mandolin — G3 (196 Hz) ile E7 (2637 Hz) arası. */
export function mandolin(frequency = 660, duration = 0.8): SynthParams {
  const harmonics = [
    { ratio: 1, gain: 1.0 },
    { ratio: 2, gain: 0.74 },
    { ratio: 3, gain: 0.5 },
    { ratio: 4, gain: 0.36 },
    { ratio: 5, gain: 0.24 },
    { ratio: 6, gain: 0.17 },
    { ratio: 7, gain: 0.12 },
    { ratio: 8, gain: 0.09 },
  ];
  return pluckedBody(
    frequency,
    duration,
    harmonics,
    10,
    6000,
    {
      attack: 0.001,
      hold: 0.005,
      decay: 0.18,
      // Sürdürüm, tremolonun periyot içi tepe-dip ölçümü için yeterince uzun.
      sustain: 0.25,
      release: 0.3,
      sustainLevel: 0.22,
    },
    {
      gain: 0.5,
      stereoWidth: 0.3,
      // Mandolin tremolosu — perde içi tepe-dip ile ölçülür.
      lfos: [{ target: 'amplitude', rate: 6.0, depth: 0.7, wave: 'sine' }],
    },
  );
}
