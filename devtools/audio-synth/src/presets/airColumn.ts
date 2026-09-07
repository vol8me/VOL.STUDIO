import type { HarmonicParams, SynthParams } from '../types';
import { reach, belowFundamental } from './utils';

/**
 * Ahşap üflemeli çalgı presetleri — YENİ DSP YOK.
 *
 * Flüt, klarnet, obua ve fagot `synth` motorunun additive yolunu kullanır.
 * Her preset enstrümanın karakteristik harmonik spektrumunu (açık/kapalı
 * boru, tek/çift harmonikler, karanlık/parlak kısmi ton dağılımı)
 * parameterize eder. Nefes zarfı ve hafif reverb ortak gövdede toplanır.
 */

interface WoodwindBodyParams {
  harmonics: HarmonicParams[];
  lowpassHarmonic: number;
  lowpassFloor: number;
  gain: number;
  vibratoDepth?: number;
  vibratoRate?: number;
}

function woodwindBody(
  frequency: number,
  duration: number,
  params: WoodwindBodyParams,
): SynthParams {
  const attack = 0.1;
  const decay = 0.05;
  const release = 0.25;
  const sustain = Math.max(0, duration - attack - decay - release);

  return {
    frequency,
    duration,
    harmonics: params.harmonics,
    envelope: {
      attack,
      decay,
      sustain,
      release,
      sustainLevel: 0.9,
      curve: 'cosine',
    },
    highpass: {
      cutoff: belowFundamental(frequency, 60),
      resonance: 0.04,
      poles: 2,
      type: 'highpass',
    },
    lowpass: {
      cutoff: reach(frequency, params.lowpassHarmonic, params.lowpassFloor),
      resonance: 0.05,
      poles: 2,
      type: 'lowpass',
    },
    reverb: { amount: 0.15, decay: 1.2, roomSize: 0.5, damp: 0.55 },
    stereoWidth: 0.35,
    vibratoDepth: params.vibratoDepth ?? 0,
    vibratoRate: params.vibratoRate ?? 0,
    gain: params.gain,
  };
}

// ─── Flüt ───────────────────────────────────────────────────────────

/** Flüt — açık boru, tüm harmonikler, yumuşak atak, parlak ama düşük üst ton. */
export function flute(frequency = 440, duration = 1.2): SynthParams {
  const harmonics: HarmonicParams[] = [
    { ratio: 1, gain: 1.0 },
    { ratio: 2, gain: 0.55 },
    { ratio: 3, gain: 0.35 },
    { ratio: 4, gain: 0.22 },
    { ratio: 5, gain: 0.14 },
    { ratio: 6, gain: 0.09 },
    { ratio: 7, gain: 0.06 },
    { ratio: 8, gain: 0.04 },
  ];
  return woodwindBody(frequency, duration, {
    harmonics,
    lowpassHarmonic: 14,
    lowpassFloor: 7000,
    gain: 0.35,
    vibratoDepth: 0.4,
    vibratoRate: 3.0,
  });
}

// ─── Klarnet ────────────────────────────────────────────────────────

/** Klarnet — kapalı boru, tek kat harmonikler baskın, karanlık. */
export function clarinet(frequency = 262, duration = 1.0): SynthParams {
  const harmonics: HarmonicParams[] = [
    { ratio: 1, gain: 1.0 },
    { ratio: 3, gain: 0.45 },
    { ratio: 5, gain: 0.22 },
    { ratio: 7, gain: 0.11 },
    { ratio: 9, gain: 0.06 },
    { ratio: 11, gain: 0.04 },
  ];
  return woodwindBody(frequency, duration, {
    harmonics,
    lowpassHarmonic: 7,
    lowpassFloor: 2500,
    gain: 0.45,
  });
}

// ─── Obua ───────────────────────────────────────────────────────────

/** Obua — konik boru, zengin harmonikler, hafif tremolo karakteri. */
export function oboe(frequency = 440, duration = 1.0): SynthParams {
  const harmonics: HarmonicParams[] = [
    { ratio: 1, gain: 1.0 },
    { ratio: 2, gain: 0.72 },
    { ratio: 3, gain: 0.48 },
    { ratio: 4, gain: 0.32 },
    { ratio: 5, gain: 0.22 },
    { ratio: 6, gain: 0.15 },
    { ratio: 7, gain: 0.1 },
    { ratio: 8, gain: 0.07 },
  ];
  return woodwindBody(frequency, duration, {
    harmonics,
    lowpassHarmonic: 12,
    lowpassFloor: 6000,
    gain: 0.28,
    vibratoDepth: 0.6,
    vibratoRate: 4.0,
  });
}

// ─── Fagot ──────────────────────────────────────────────────────────

/** Fagot — karanlık, pes, üst tonlar hızla solar. */
export function bassoon(frequency = 175, duration = 1.2): SynthParams {
  const harmonics: HarmonicParams[] = [
    { ratio: 1, gain: 1.0 },
    { ratio: 2, gain: 0.5 },
    { ratio: 3, gain: 0.26 },
    { ratio: 4, gain: 0.14 },
    { ratio: 5, gain: 0.08 },
    { ratio: 6, gain: 0.05 },
  ];
  return woodwindBody(frequency, duration, {
    harmonics,
    lowpassHarmonic: 6,
    lowpassFloor: 1200,
    gain: 0.45,
  });
}
