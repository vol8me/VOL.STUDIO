import type { SynthParams } from '../types';

/**
 * Melodik enstrüman presetleri.
 *
 * Hedef: çeşitli orkestral rolleri (bass, pad, lead, pluck, keys, bell) ve
 * sentez teknikleri (subtractive, FM, additive) ile agent'in stile uygun
 * enstrüman seçebileceği bir envanter.
 */

// ─── Bass ──────────────────────────────────────────────────────────

/** Subtractive sawtooth/square bass — yumuşak drive ile sıcak. */
export function subBass(frequency = 55, duration = 0.6): SynthParams {
  return {
    wave: 'sawtooth',
    frequency,
    duration,
    detune: 8,
    envelope: {
      attack: 0.01,
      hold: 0.02,
      decay: 0.15,
      sustain: 0.25,
      release: 0.35,
      sustainLevel: 0.7,
    },
    lowpass: { cutoff: 220, resonance: 0.15, poles: 2, type: 'lowpass' },
    distortion: { amount: 0.12, type: 'soft', mix: 0.3 },
    gain: 0.85,
  };
}

/** FM perküsif sub bass — kısa atak, plucky karakter. */
export function pluckSubBass(frequency = 55, duration = 0.45): SynthParams {
  return {
    wave: 'sine',
    frequency,
    duration,
    envelope: {
      attack: 0.005,
      hold: 0.01,
      decay: 0.12,
      sustain: 0.05,
      release: 0.25,
      sustainLevel: 0.5,
    },
    fm: {
      modulatorWave: 'sine',
      ratio: 0.5,
      index: 2.2,
      modulatorEnvelope: {
        attack: 0.001,
        hold: 0,
        decay: 0.06,
        sustain: 0,
        release: 0.1,
        sustainLevel: 0,
      },
    },
    lowpass: { cutoff: 260, resonance: 0.12, poles: 2, type: 'lowpass' },
    gain: 0.9,
  };
}

/** Sine + triangle warm sub bass — distortion yok. */
export function softBass(frequency = 55, duration = 0.6): SynthParams {
  return {
    wave: ['sine', 'triangle'],
    frequency,
    duration,
    detune: 5,
    envelope: {
      attack: 0.02,
      hold: 0,
      decay: 0.12,
      sustain: 0.3,
      release: 0.35,
      sustainLevel: 0.75,
    },
    lowpass: { cutoff: 160, resonance: 0.08, poles: 2, type: 'lowpass' },
    gain: 0.85,
  };
}

// ─── Pad ───────────────────────────────────────────────────────────

/** Additive sine pad — organ/yaylı benzeri, katmanlı ve yumuşak. */
export function additivePad(frequency = 220, duration = 2.5): SynthParams {
  return {
    harmonics: [
      { ratio: 1, gain: 1.0, phase: 0 },
      { ratio: 2, gain: 0.55, phase: 0.08 },
      { ratio: 3, gain: 0.35, phase: 0.15 },
      { ratio: 4, gain: 0.22, phase: 0.05 },
      { ratio: 5, gain: 0.14, phase: 0.2 },
      { ratio: 6, gain: 0.1, phase: 0.12 },
    ],
    frequency,
    duration,
    detune: 6,
    envelope: {
      attack: 0.7,
      hold: 0,
      decay: 0.2,
      sustain: Math.max(0, duration - 1.8),
      release: 1.2,
      sustainLevel: 0.9,
    },
    lowpass: { cutoff: 1600, resonance: 0.06, poles: 2, type: 'lowpass' },
    lfos: [
      { target: 'amplitude', rate: 0.08, depth: 0.08, wave: 'sine' },
      { target: 'filter', rate: 0.05, depth: 180, wave: 'sine' },
    ],
    chorus: { depth: 2.2, rate: 0.1, mix: 0.35 },
    reverb: { amount: 0.3, decay: 2.8, roomSize: 0.75, damp: 0.5 },
    gain: 0.45,
  };
}

/** Detune'lu subtractive saw pad — geniş ve sürükleyici. */
export function detunedPad(frequency = 220, duration = 2.5): SynthParams {
  return {
    wave: 'sawtooth',
    frequency,
    duration,
    detune: 16,
    envelope: {
      attack: 0.9,
      hold: 0,
      decay: 0.2,
      sustain: Math.max(0, duration - 1.6),
      release: 1.0,
      sustainLevel: 0.95,
    },
    lowpass: { cutoff: 1200, resonance: 0.08, poles: 2, type: 'lowpass' },
    lfos: [{ target: 'filter', rate: 0.07, depth: 120, wave: 'sine' }],
    chorus: { depth: 2.5, rate: 0.12, mix: 0.4 },
    reverb: { amount: 0.35, decay: 2.6, roomSize: 0.8, damp: 0.45 },
    gain: 0.4,
  };
}

// ─── Lead ──────────────────────────────────────────────────────────

/** Parlak, keskin sawtooth lead — nota hattı için. */
export function brightLead(frequency = 440, duration = 0.7): SynthParams {
  return {
    wave: 'sawtooth',
    frequency,
    duration,
    detune: 10,
    envelope: {
      attack: 0.015,
      hold: 0.05,
      decay: 0.15,
      sustain: 0.55,
      release: 0.2,
      sustainLevel: 0.85,
    },
    lowpass: { cutoff: 2800, resonance: 0.25, poles: 2, type: 'lowpass', slide: -1200 },
    vibratoDepth: 1.2,
    vibratoRate: 0.25,
    gain: 0.6,
  };
}

/** Yumuşak analog lead — triangle + hafif FM parlaklık. */
export function softLead(frequency = 440, duration = 0.8): SynthParams {
  return {
    wave: 'triangle',
    frequency,
    duration,
    detune: 7,
    envelope: {
      attack: 0.08,
      hold: 0,
      decay: 0.15,
      sustain: 0.6,
      release: 0.3,
      sustainLevel: 0.8,
    },
    fm: {
      modulatorWave: 'sine',
      ratio: 3,
      index: 0.4,
      modulatorEnvelope: {
        attack: 0.02,
        hold: 0,
        decay: 0.2,
        sustain: 0.1,
        release: 0.15,
        sustainLevel: 0.3,
      },
    },
    lowpass: { cutoff: 2000, resonance: 0.1, poles: 2, type: 'lowpass' },
    vibratoDepth: 0.8,
    vibratoRate: 0.2,
    gain: 0.55,
  };
}

// ─── Pluck ─────────────────────────────────────────────────────────

/** Metalik pluck — kısa inharmonik FM, arpeggio için. */
export function metalPluck(frequency = 660, duration = 0.35): SynthParams {
  return {
    wave: 'sine',
    frequency,
    duration,
    envelope: {
      attack: 0.003,
      hold: 0,
      decay: 0.08,
      sustain: 0.05,
      release: 0.15,
      sustainLevel: 0.4,
    },
    fm: {
      modulatorWave: 'sine',
      ratio: 2.73,
      index: 2.4,
      modulatorEnvelope: {
        attack: 0.001,
        hold: 0,
        decay: 0.05,
        sustain: 0,
        release: 0.08,
        sustainLevel: 0,
      },
    },
    lowpass: { cutoff: 3600, resonance: 0.12, poles: 2, type: 'lowpass', slide: -1600 },
    gain: 0.6,
  };
}

/** Sıcak ahşap pluck — additive harmonikler, kısa decay. */
export function woodPluck(frequency = 440, duration = 0.4): SynthParams {
  return {
    harmonics: [
      { ratio: 1, gain: 1.0, phase: 0 },
      { ratio: 2.5, gain: 0.32, phase: 0.1 },
      { ratio: 4.2, gain: 0.1, phase: 0.18 },
    ],
    frequency,
    duration,
    envelope: {
      attack: 0.004,
      hold: 0.01,
      decay: 0.1,
      sustain: 0.05,
      release: 0.15,
      sustainLevel: 0.35,
    },
    lowpass: { cutoff: 2600, resonance: 0.06, poles: 2, type: 'lowpass', slide: -1000 },
    gain: 0.55,
  };
}

// ─── Keys ──────────────────────────────────────────────────────────

/** Yumuşak keys / Rhodes'tan daha az metalik — additive ağırlıklı. */
export function warmKeys(frequency = 440, duration = 0.6): SynthParams {
  return {
    harmonics: [
      { ratio: 1, gain: 1.0, phase: 0 },
      { ratio: 2, gain: 0.55, phase: 0.06 },
      { ratio: 3, gain: 0.28, phase: 0.14 },
      { ratio: 4, gain: 0.12, phase: 0.08 },
    ],
    frequency,
    duration,
    envelope: {
      attack: 0.005,
      hold: 0.02,
      decay: 0.25,
      sustain: 0.2,
      release: 0.35,
      sustainLevel: 0.65,
    },
    lowpass: { cutoff: 2200, resonance: 0.05, poles: 2, type: 'lowpass', slide: -600 },
    chorus: { depth: 1.5, rate: 0.08, mix: 0.25 },
    reverb: { amount: 0.15, decay: 1.2, roomSize: 0.5, damp: 0.6 },
    gain: 0.55,
  };
}

/** FM elektrik piyano — iyileştirilmiş, daha az gıcık. */
export function electricPiano2(frequency = 440, duration = 0.5): SynthParams {
  return {
    wave: 'sine',
    frequency,
    duration,
    envelope: {
      attack: 0.004,
      hold: 0,
      decay: 0.18,
      sustain: 0.15,
      release: 0.45,
      sustainLevel: 0.55,
    },
    fm: {
      modulatorWave: 'sine',
      ratio: 2,
      index: 0.9,
      modulatorEnvelope: {
        attack: 0.002,
        hold: 0,
        decay: 0.12,
        sustain: 0.1,
        release: 0.25,
        sustainLevel: 0.4,
      },
      feedback: 0.05,
    },
    lowpass: { cutoff: 2800, resonance: 0.06, poles: 2, type: 'lowpass', slide: -500 },
    chorus: { depth: 1.2, rate: 0.06, mix: 0.2 },
    gain: 0.55,
  };
}

// ─── Bell / Texture ────────────────────────────────────────────────

/** Kristal berraklığında çan — additive ve FM katmanı. */
export function crystalBell(frequency = 880, duration = 1.2): SynthParams {
  return {
    wave: 'sine',
    frequency,
    duration,
    envelope: {
      attack: 0.003,
      hold: 0.05,
      decay: 0.45,
      sustain: 0.1,
      release: 1.0,
      sustainLevel: 0.25,
    },
    fm: {
      modulatorWave: 'sine',
      ratio: 1.4,
      index: 1.6,
      feedback: 0.1,
      modulatorEnvelope: {
        attack: 0.002,
        hold: 0,
        decay: 0.3,
        sustain: 0.05,
        release: 0.5,
        sustainLevel: 0.2,
      },
    },
    lowpass: { cutoff: 6000, resonance: 0.08, poles: 2, type: 'lowpass' },
    reverb: { amount: 0.4, decay: 2.5, roomSize: 0.85, damp: 0.4 },
    gain: 0.5,
  };
}
