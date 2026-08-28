/**
 * SFX tarif tablosu — VOL-HELL'in tüm ses olayları.
 *
 * Karakter kuralları (tema: Karanlık Sentetik / Void):
 * - Her ses FM/sine temellidir; çıplak testere/kare "chiptune" sesi yok.
 * - Üst bant her seste lowpass ile kesilir — tiz, ince, cızırtılı ses yasak.
 * - Kafa yormaz: sık tetiklenen sesler (ateş, vuruş, toplama) kısa, koyu ve
 *   yumuşak kenarlıdır; nadir olaylar (boss, ölüm) daha büyük yaşar.
 *
 * Seviye kuralı: sesler AYNI tepeye normalize edilmez. `peak` olay önemine
 * göre hiyerarşi kurar: UI ~0.42-0.55, ateş ~0.55, hasar ~0.75, ölüm ~0.88.
 */

import type { SynthesisResult } from '@volstudio/audio-synth';
import { renderVoice } from '../lib/mix';
import { hz } from '../lib/theory';
import { layer } from '../palette/shared';
import { deepImpact, subDrop } from '../palette/fx';
import { farToll } from '../palette/ambience';

/** Tek SFX tanımı. */
export interface SfxSpec {
  /** Dosya adı kökü — `<kategori>/<name>.ogg` olarak yazılır. */
  name: string;
  /** Kategori dizini. */
  category: 'ui' | 'player' | 'combat' | 'ability' | 'progress';
  /** Tepe hedefi (0-1) — olay önem hiyerarşisi. */
  peak: number;
  /** Sesi üretir. */
  render(): SynthesisResult;
}

/** Koyu UI blip'i — tek sine vuruşu, cosine kenarlı. */
function uiBlip(frequency: number, duration = 0.09, seed = 1): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: 'sine',
    frequency,
    envelope: {
      attack: 0.003,
      hold: duration * 0.25,
      decay: duration * 0.3,
      sustain: 0,
      release: duration * 0.45,
      sustainLevel: 0.5,
      curve: 'cosine',
    },
    lowpass: { cutoff: 1400 },
    highpass: { cutoff: 60 },
    gain: 0.8,
  });
}

/** İki tonlu UI jesti — yön duygusu (onay yukarı, geri aşağı). */
function uiGesture(first: number, second: number, seed = 2): SynthesisResult {
  return layer(
    { voice: uiBlip(first, 0.08, seed) },
    { voice: uiBlip(second, 0.1, seed + 1), at: 0.075, gain: 0.9 },
  );
}

/** Cam dokunuş — kart/menü onayları için koyu FM çan kıvılcımı. */
function glassTap(frequency: number, duration = 0.16, seed = 3): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: 'sine',
    frequency,
    fm: {
      modulatorWave: 'sine',
      ratio: 2.01,
      index: 1.6,
      modulatorEnvelope: {
        attack: 0.002,
        hold: 0.008,
        decay: duration * 0.4,
        sustain: 0,
        release: duration * 0.3,
        sustainLevel: 0.1,
        curve: 'exponential',
      },
    },
    envelope: {
      attack: 0.002,
      hold: 0.01,
      decay: duration * 0.4,
      sustain: 0,
      release: duration * 0.45,
      sustainLevel: 0.3,
      curve: 'cosine',
    },
    lowpass: { cutoff: 2600, poles: 2 },
    highpass: { cutoff: 90 },
    gain: 0.7,
  });
}

/** Ateş — FM zap; kısa, koyu, yumuşak kenar. Varyantlar pitch ile ayrışır. */
function fireZap(frequency: number, seed: number): SynthesisResult {
  return renderVoice({
    seed,
    duration: 0.12,
    wave: 'sine',
    frequency,
    slide: -frequency * 0.35,
    slideCurve: 'exponential',
    fm: {
      modulatorWave: 'triangle',
      ratio: 2.4,
      index: 2.6,
      modulatorEnvelope: {
        attack: 0.001,
        hold: 0.01,
        decay: 0.06,
        sustain: 0,
        release: 0.04,
        sustainLevel: 0.1,
        curve: 'exponential',
      },
    },
    envelope: {
      attack: 0.002,
      hold: 0.015,
      decay: 0.05,
      sustain: 0,
      release: 0.05,
      sustainLevel: 0.4,
      curve: 'cosine',
    },
    lowpass: { cutoff: 2400, poles: 2 },
    highpass: { cutoff: 80 },
    gain: 0.75,
  });
}

/** Vuruş gövdesi — düşman temasları için koyu "thock". */
function impactBody(frequency: number, duration: number, seed: number): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: 'sine',
    frequency,
    slide: -frequency * 0.4,
    slideCurve: 'exponential',
    fm: { modulatorWave: 'sine', ratio: 1.41, index: 1.2 },
    envelope: {
      attack: 0.002,
      hold: 0.012,
      decay: duration * 0.4,
      sustain: 0,
      release: duration * 0.4,
      sustainLevel: 0.35,
      curve: 'cosine',
    },
    lowpass: { cutoff: 1500, poles: 2 },
    highpass: { cutoff: 55 },
    gain: 0.8,
  });
}

/** Alçak homurtu — hasar/tehdit anlarının gövdesi. */
function lowGrowl(frequency: number, duration: number, seed: number): SynthesisResult {
  return renderVoice({
    seed,
    duration,
    wave: 'sine',
    frequency,
    fm: { modulatorWave: 'triangle', ratio: 0.5, index: 2.2, feedback: 0.3 },
    envelope: {
      attack: 0.004,
      hold: duration * 0.15,
      decay: duration * 0.35,
      sustain: 0,
      release: duration * 0.4,
      sustainLevel: 0.4,
      curve: 'cosine',
    },
    lowpass: { cutoff: 900, poles: 2 },
    highpass: { cutoff: 45 },
    gain: 0.75,
  });
}

/** Elektrik boşalması — zincir şimşek; FM index patlaması, koyu filtreli. */
function arcBurst(seed: number): SynthesisResult {
  return renderVoice({
    seed,
    duration: 0.28,
    wave: 'sine',
    frequency: 340,
    slide: -140,
    slideCurve: 'exponential',
    fm: {
      modulatorWave: 'sawtooth',
      ratio: 3.7,
      index: 5,
      feedback: 0.4,
      modulatorEnvelope: {
        attack: 0.001,
        hold: 0.02,
        decay: 0.12,
        sustain: 0,
        release: 0.08,
        sustainLevel: 0.15,
        curve: 'exponential',
      },
    },
    envelope: {
      attack: 0.002,
      hold: 0.02,
      decay: 0.1,
      sustain: 0,
      release: 0.12,
      sustainLevel: 0.4,
      curve: 'cosine',
    },
    lowpass: { cutoff: 2900, poles: 2 },
    highpass: { cutoff: 120 },
    gain: 0.7,
  });
}

/** Mekanik kilit — kule kurulumu / kilitleme; iki FM klank. */
function mechLatch(frequency: number, seed: number): SynthesisResult {
  const clank = (f: number, s: number): SynthesisResult =>
    renderVoice({
      seed: s,
      duration: 0.09,
      wave: 'sine',
      frequency: f,
      fm: { modulatorWave: 'square', ratio: 2.76, index: 1.8 },
      envelope: {
        attack: 0.001,
        hold: 0.008,
        decay: 0.035,
        sustain: 0,
        release: 0.04,
        sustainLevel: 0.3,
        curve: 'cosine',
      },
      lowpass: { cutoff: 1900, poles: 2 },
      highpass: { cutoff: 70 },
      gain: 0.8,
    });
  return layer(
    { voice: clank(frequency, seed) },
    { voice: clank(frequency * 0.75, seed + 1), at: 0.11, gain: 0.9 },
  );
}

/** Tüm SFX tarifleri. Dosya yolu: sfx/<category>/<name>.ogg */
export const SFX_SPECS: SfxSpec[] = [
  // ————— UI —————
  { name: 'click-0', category: 'ui', peak: 0.48, render: () => uiBlip(hz('D4'), 0.09, 900) },
  { name: 'click-1', category: 'ui', peak: 0.48, render: () => uiBlip(hz('C4'), 0.09, 901) },
  { name: 'back-0', category: 'ui', peak: 0.46, render: () => uiGesture(hz('D4'), hz('A3'), 910) },
  {
    name: 'pause-0',
    category: 'ui',
    peak: 0.5,
    render: () => uiGesture(hz('A3'), hz('E3'), 920),
  },
  {
    name: 'resume-0',
    category: 'ui',
    peak: 0.5,
    render: () => uiGesture(hz('E3'), hz('A3'), 930),
  },
  {
    name: 'restart-0',
    category: 'ui',
    peak: 0.52,
    render: () =>
      layer(
        { voice: uiBlip(hz('A3'), 0.07, 940) },
        { voice: uiBlip(hz('D4'), 0.07, 941), at: 0.07 },
        { voice: uiBlip(hz('F4'), 0.1, 942), at: 0.14, gain: 0.9 },
      ),
  },
  { name: 'deny-0', category: 'ui', peak: 0.45, render: () => lowGrowl(hz('A2'), 0.16, 950) },
  {
    name: 'card-pick-0',
    category: 'ui',
    peak: 0.5,
    render: () => glassTap(hz('D4'), 0.16, 960),
  },
  {
    name: 'card-buy-0',
    category: 'ui',
    peak: 0.54,
    render: () =>
      layer(
        { voice: glassTap(hz('D4'), 0.12, 970) },
        { voice: glassTap(hz('A4'), 0.18, 971), at: 0.09, gain: 0.85 },
      ),
  },
  {
    name: 'reroll-0',
    category: 'ui',
    peak: 0.5,
    render: () =>
      layer(
        { voice: uiBlip(hz('G3'), 0.06, 980) },
        { voice: uiBlip(hz('Bb3'), 0.06, 981), at: 0.06 },
        { voice: uiBlip(hz('D4'), 0.08, 982), at: 0.12, gain: 0.9 },
      ),
  },
  { name: 'lock-0', category: 'ui', peak: 0.52, render: () => mechLatch(hz('A3'), 990) },

  // ————— PLAYER —————
  { name: 'fire-0', category: 'player', peak: 0.55, render: () => fireZap(hz('E4'), 100) },
  { name: 'fire-1', category: 'player', peak: 0.55, render: () => fireZap(hz('D4'), 101) },
  { name: 'fire-2', category: 'player', peak: 0.55, render: () => fireZap(hz('F4'), 102) },
  {
    name: 'dash-0',
    category: 'player',
    peak: 0.6,
    render: () =>
      renderVoice({
        seed: 110,
        duration: 0.22,
        wave: 'sine',
        frequency: 240,
        slide: -150,
        slideCurve: 'cosine',
        fm: { modulatorWave: 'triangle', ratio: 1.98, index: 1.8 },
        envelope: {
          attack: 0.006,
          hold: 0.03,
          decay: 0.09,
          sustain: 0,
          release: 0.09,
          sustainLevel: 0.5,
          curve: 'cosine',
        },
        lowpass: { cutoff: 1600, poles: 2 },
        highpass: { cutoff: 70 },
        gain: 0.8,
      }),
  },
  {
    name: 'hurt-0',
    category: 'player',
    peak: 0.75,
    render: () =>
      layer(
        { voice: impactBody(hz('A2'), 0.16, 120) },
        { voice: lowGrowl(hz('D2'), 0.18, 121), at: 0.01, gain: 0.8 },
      ),
  },
  {
    name: 'hurt-1',
    category: 'player',
    peak: 0.75,
    render: () =>
      layer(
        { voice: impactBody(hz('G2'), 0.16, 125) },
        { voice: lowGrowl(hz('C2'), 0.18, 126), at: 0.01, gain: 0.8 },
      ),
  },
  {
    name: 'death-0',
    category: 'player',
    peak: 0.88,
    render: () =>
      layer(
        { voice: deepImpact(130) },
        { voice: subDrop(131), at: 0.05, gain: 0.9 },
        { voice: lowGrowl(hz('D2'), 0.7, 132), at: 0.02, gain: 0.7 },
      ),
  },
  {
    name: 'flux-pickup-0',
    category: 'player',
    peak: 0.42,
    render: () => glassTap(hz('A4'), 0.11, 140),
  },
  {
    name: 'flux-pickup-1',
    category: 'player',
    peak: 0.42,
    render: () => glassTap(hz('D5'), 0.11, 141),
  },

  // ————— COMBAT —————
  {
    name: 'enemy-hit-0',
    category: 'combat',
    peak: 0.6,
    render: () => impactBody(hz('D3'), 0.1, 200),
  },
  {
    name: 'enemy-hit-1',
    category: 'combat',
    peak: 0.6,
    render: () => impactBody(hz('C3'), 0.1, 201),
  },
  {
    name: 'enemy-death-0',
    category: 'combat',
    peak: 0.68,
    render: () =>
      layer(
        { voice: impactBody(hz('G2'), 0.2, 210) },
        { voice: lowGrowl(hz('G1'), 0.24, 211), at: 0.015, gain: 0.7 },
      ),
  },
  {
    name: 'enemy-death-1',
    category: 'combat',
    peak: 0.68,
    render: () =>
      layer(
        { voice: impactBody(hz('A2'), 0.2, 215) },
        { voice: lowGrowl(hz('A1'), 0.24, 216), at: 0.015, gain: 0.7 },
      ),
  },
  {
    name: 'bullet-bounce-0',
    category: 'combat',
    peak: 0.45,
    render: () =>
      renderVoice({
        seed: 220,
        duration: 0.07,
        wave: 'sine',
        frequency: 420,
        slide: 90,
        slideCurve: 'cosine',
        fm: { modulatorWave: 'sine', ratio: 3.02, index: 1.1 },
        envelope: {
          attack: 0.001,
          hold: 0.008,
          decay: 0.025,
          sustain: 0,
          release: 0.03,
          sustainLevel: 0.4,
          curve: 'cosine',
        },
        lowpass: { cutoff: 2400, poles: 2 },
        highpass: { cutoff: 110 },
        gain: 0.7,
      }),
  },
  {
    name: 'elite-spawn-0',
    category: 'combat',
    peak: 0.72,
    render: () =>
      layer(
        { voice: lowGrowl(hz('C2'), 0.6, 230), gain: 0.9 },
        { voice: farToll(hz('C3'), 1.6, 231), at: 0.12, gain: 0.8 },
      ),
  },
  {
    name: 'boss-spawn-0',
    category: 'combat',
    peak: 0.85,
    render: () =>
      layer(
        { voice: deepImpact(240) },
        { voice: farToll(hz('C3'), 2.2, 241), at: 0.15, gain: 0.9 },
        { voice: lowGrowl(hz('C2'), 0.9, 242), at: 0.05, gain: 0.7 },
      ),
  },
  {
    name: 'boss-enrage-0',
    category: 'combat',
    peak: 0.8,
    render: () =>
      layer(
        { voice: lowGrowl(hz('Db2'), 0.7, 250), gain: 1 },
        { voice: impactBody(hz('Db3'), 0.3, 251), at: 0.32, gain: 0.9 },
      ),
  },
  {
    name: 'boss-down-0',
    category: 'combat',
    peak: 0.88,
    render: () =>
      layer(
        { voice: deepImpact(260) },
        { voice: subDrop(261), at: 0.08 },
        { voice: farToll(hz('G2'), 2.4, 262), at: 0.2, gain: 0.85 },
      ),
  },
  {
    name: 'telegraph-0',
    category: 'combat',
    peak: 0.4,
    render: () =>
      layer(
        { voice: uiBlip(hz('A3'), 0.06, 270) },
        { voice: uiBlip(hz('A3'), 0.08, 271), at: 0.11, gain: 0.75 },
      ),
  },

  // ————— ABILITY —————
  { name: 'chain-lightning-0', category: 'ability', peak: 0.66, render: () => arcBurst(300) },
  {
    name: 'fire-zone-0',
    category: 'ability',
    peak: 0.62,
    render: () =>
      layer(
        { voice: lowGrowl(hz('F2'), 0.4, 310) },
        { voice: impactBody(hz('F2'), 0.2, 311), gain: 0.8 },
      ),
  },
  {
    name: 'multi-shot-0',
    category: 'ability',
    peak: 0.6,
    render: () =>
      layer(
        { voice: fireZap(hz('D4'), 320) },
        { voice: fireZap(hz('F4'), 321), at: 0.05, gain: 0.85 },
        { voice: fireZap(hz('A4'), 322), at: 0.1, gain: 0.7 },
      ),
  },
  {
    name: 'turret-deploy-0',
    category: 'ability',
    peak: 0.58,
    render: () => mechLatch(hz('D3'), 330),
  },
  {
    name: 'turret-fire-0',
    category: 'ability',
    peak: 0.42,
    render: () => fireZap(hz('A3'), 340),
  },

  // ————— PROGRESS —————
  {
    name: 'wave-start-0',
    category: 'progress',
    peak: 0.55,
    render: () =>
      layer(
        { voice: glassTap(hz('A3'), 0.14, 400) },
        { voice: glassTap(hz('D4'), 0.2, 401), at: 0.12, gain: 0.9 },
      ),
  },
  {
    name: 'wave-clear-0',
    category: 'progress',
    peak: 0.55,
    render: () =>
      layer(
        { voice: glassTap(hz('D4'), 0.14, 410) },
        { voice: glassTap(hz('A3'), 0.2, 411), at: 0.12, gain: 0.9 },
        { voice: subDrop(412), at: 0.02, gain: 0.35 },
      ),
  },
  {
    name: 'level-up-0',
    category: 'progress',
    peak: 0.6,
    render: () =>
      layer(
        { voice: glassTap(hz('D4'), 0.12, 420) },
        { voice: glassTap(hz('F4'), 0.12, 421), at: 0.09 },
        { voice: glassTap(hz('A4'), 0.22, 422), at: 0.18, gain: 0.9 },
      ),
  },
];
