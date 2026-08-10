import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { synth, normalize } from '../src/audio/synth/engine';
import { writeWav } from '../src/audio/synth/writer';
import type { SynthParams, SynthesisResult } from '../src/audio/synth/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outDirArg = process.argv[2];
const filterArg = process.argv[3];

if (!outDirArg) {
  console.error('Kullanim: tsx scripts/generate-volhell-sounds.ts <out-dir> [filter]');
  console.error('  out-dir: örn. ../games/vol-hell/public/assets/audio/sfx');
  console.error('  filter: kategori (ui|player|combat) veya isim oneki (fire, enemy-hit, ...)');
  process.exit(1);
}

const outDir = resolve(outDirArg);

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
} else if (!filterArg) {
  for (const entry of readdirSync(outDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.wav')) {
      rmSync(join(outDir, entry.name));
    } else if (entry.isDirectory()) {
      for (const file of readdirSync(join(outDir, entry.name))) {
        if (file.endsWith('.wav')) rmSync(join(outDir, entry.name, file));
      }
    }
  }
}

const SAMPLE_RATE = 32000;

// Normalize hedefi — -3 dB headroom bırak (mix'te üst üste binince clipping olmasın)
const TARGET_PEAK = 0.707;

type SoundCategory = 'ui' | 'player' | 'combat';

type SynthSpec = {
  name: string;
  category: SoundCategory;
  type: 'synth';
  params: SynthParams | SynthParams[];
};

type RenderSpec = {
  name: string;
  category: SoundCategory;
  type: 'render';
  render: () => SynthesisResult;
};

type SoundSpec = SynthSpec | RenderSpec;

// ─── Yardımcı fonksiyonlar ───────────────────────────────────────────

function addToBuffer(target: Float32Array, source: Float32Array, offset = 0): void {
  for (let i = 0; i < source.length && i + offset < target.length; i++) {
    target[i + offset] += source[i]!;
  }
}

/** Çok katmanlı render — her katman ayrı sentezlenip mix'lenir. */
function layer(
  duration: number,
  layers: Array<{ params: SynthParams; offset?: number }>,
  targetPeak = TARGET_PEAK,
): SynthesisResult {
  const sr = SAMPLE_RATE;
  const n = Math.floor(sr * duration);
  const buf = new Float32Array(n);
  for (const l of layers) {
    const result = synth(l.params.duration ?? duration, l.params);
    const off = Math.floor((l.offset ?? 0) * sr);
    addToBuffer(buf, result.channels[0]!, off);
  }
  return { channels: [normalize(buf, targetPeak)], sampleRate: sr, duration };
}

// ─── Katman fabrikaları — tutarlı karakter için ──────────────────────
//
// Sawtooth + lowpass = zengin mid karakter, buzzy olmadan.
// Triangle fakir harmonikleri var — sadece sub ve yumuşak üst için.

/** Sub bass katmanı — sine, tok body. Gain düşük — mid/high baskın olmasın. */
function sub(freq: number, duration: number, gain = 0.3, slide = 0, offset = 0): { params: SynthParams; offset: number } {
  return {
    offset,
    params: {
      sampleRate: SAMPLE_RATE,
      wave: 'sine',
      frequency: freq,
      slide,
      gain,
      duration,
      envelope: { attack: 0.003, hold: 0.015, decay: Math.min(0.1, duration * 0.4), sustain: 0, release: Math.min(0.08, duration * 0.3), sustainLevel: 0.35, curve: 'exponential' },
      lowpass: { cutoff: 400, poles: 1, type: 'lowpass' },
    },
  };
}

/** Mid karakter katmanı — sawtooth + lowpass, zengin harmonik. Gain yüksek — karakter burada. */
function mid(freq: number, duration: number, gain = 0.5, slide = 0, cutoff = 2200, offset = 0): { params: SynthParams; offset: number } {
  return {
    offset,
    params: {
      sampleRate: SAMPLE_RATE,
      wave: 'sawtooth',
      frequency: freq,
      slide,
      gain,
      duration,
      envelope: { attack: 0.002, hold: 0.01, decay: Math.min(0.08, duration * 0.35), sustain: 0, release: Math.min(0.06, duration * 0.25), sustainLevel: 0.3, curve: 'exponential' },
      lowpass: { cutoff, resonance: 1.5, poles: 2, type: 'lowpass' },
      highpass: { cutoff: 200, poles: 1, type: 'highpass' },
    },
  };
}

/** High detay katmanı — metalik tını, bant sınırlı. Gain yüksek — metalik karakter için. */
function high(freq: number, duration: number, gain = 0.26, slide = 0, offset = 0): { params: SynthParams; offset: number } {
  return {
    offset,
    params: {
      sampleRate: SAMPLE_RATE,
      wave: 'triangle',
      frequency: freq,
      slide,
      gain,
      duration,
      envelope: { attack: 0.001, hold: 0.005, decay: Math.min(0.05, duration * 0.3), sustain: 0, release: Math.min(0.03, duration * 0.2), sustainLevel: 0.15, curve: 'exponential' },
      lowpass: { cutoff: 5000, resonance: 2, poles: 2, type: 'lowpass' },
      highpass: { cutoff: 1800, poles: 1, type: 'highpass' },
    },
  };
}

/** Kısa transient — darbe karakteri için. */
function transient(duration = 0.025, gain = 0.18, offset = 0): { params: SynthParams; offset: number } {
  return {
    offset,
    params: {
      sampleRate: SAMPLE_RATE,
      wave: 'noise',
      gain,
      duration,
      envelope: { attack: 0.0005, hold: 0.002, decay: Math.min(0.015, duration * 0.6), sustain: 0, release: 0.005, sustainLevel: 0.1, curve: 'exponential' },
      lowpass: { cutoff: 3000, resonance: 0.5, poles: 2, type: 'lowpass' },
      highpass: { cutoff: 600, poles: 1, type: 'highpass' },
    },
  };
}

/** Reverb tail — yumuşak kapanış. */
function tail(freq: number, duration: number, gain = 0.14, offset = 0): { params: SynthParams; offset: number } {
  return {
    offset,
    params: {
      sampleRate: SAMPLE_RATE,
      wave: 'sine',
      frequency: freq,
      gain,
      duration,
      envelope: { attack: 0.015, hold: 0, decay: Math.min(0.18, duration * 0.6), sustain: 0, release: Math.min(0.12, duration * 0.4), sustainLevel: 0.1, curve: 'cosine' },
      reverb: { amount: 0.5, decay: 0.4, roomSize: 0.5, damp: 0.65 },
    },
  };
}

// ─── Temel ton frekansları (D minor) ─────────────────────────────────
//
// D1=36.71  D2=73.42  D3=146.83  D4=293.66  D5=587.33
// F2=87.31  F3=174.61  F4=349.23
// A1=55.00  A2=110.00 A3=220.00 A4=440.00 A5=880.00
// Bb2=116.54 Bb3=233.08 Bb4=466.16
// E3=164.81 E4=329.63
// C3=130.81 C4=261.63
// B2=123.47 B3=246.94

const specs: SoundSpec[] = [
  // ═══ UI — mekanik tıkırtı, tok pres, metalik onay ══════════════════

  {
    name: 'menu-blip-0',
    category: 'ui',
    type: 'render',
    render: () =>
      layer(0.08, [
        mid(293.66, 0.06, 0.4, 0, 1600),       // D4 — mid karakter
        sub(146.83, 0.06, 0.28),                // D3 — tok body
        high(587.33, 0.04, 0.1),                // D5 — metalik detay
      ]),
  },
  {
    name: 'menu-blip-1',
    category: 'ui',
    type: 'render',
    render: () =>
      layer(0.08, [
        mid(329.63, 0.06, 0.4, 0, 1800),       // E4 — mid karakter
        sub(164.81, 0.06, 0.28),                // E3 — tok body
        high(659.26, 0.04, 0.1),                // E5 — metalik detay
      ]),
  },
  {
    name: 'confirm-0',
    category: 'ui',
    type: 'render',
    render: () =>
      layer(0.3, [
        // Aşama 1: Kısa tık
        mid(220.0, 0.05, 0.35, 0, 1600),
        high(440.0, 0.035, 0.1),
        // Aşama 2: Tok mekanik kapanış — D3
        { ...mid(146.83, 0.18, 0.45, 0, 1200), offset: 0.05 },
        { ...sub(73.42, 0.15, 0.3), offset: 0.05 },
        { ...high(293.66, 0.08, 0.1), offset: 0.05 },
        // Reverb tail
        { ...tail(146.83, 0.22, 0.13), offset: 0.05 },
      ]),
  },
  {
    name: 'back-0',
    category: 'ui',
    type: 'render',
    render: () =>
      layer(0.12, [
        // Düşen mekanik — A3 → D3
        mid(220.0, 0.1, 0.4, -73.42, 1400),
        sub(110.0, 0.09, 0.28, -36.71),
        high(440.0, 0.06, 0.1, -146.83),
      ]),
  },
  {
    name: 'pause-0',
    category: 'ui',
    type: 'render',
    render: () =>
      layer(0.35, [
        // Ağır mekanik durdurma — D3 → D2
        mid(146.83, 0.25, 0.45, -73.42, 1000),
        sub(73.42, 0.3, 0.32),
        high(293.66, 0.1, 0.1, -146.83),
        tail(73.42, 0.3, 0.16),
      ]),
  },
  {
    name: 'resume-0',
    category: 'ui',
    type: 'render',
    render: () =>
      layer(0.25, [
        // Yükselen mekanik — D3 → D4, filter sweep
        {
          offset: 0,
          params: {
            sampleRate: SAMPLE_RATE,
            wave: 'sawtooth',
            frequency: 146.83, // D3
            slide: 146.83, // → D4
            gain: 0.4,
            duration: 0.16,
            envelope: { attack: 0.005, hold: 0.02, decay: 0.1, sustain: 0, release: 0.05, sustainLevel: 0.35, curve: 'exponential' },
            lowpass: {
              cutoff: 800,
              resonance: 2,
              poles: 2,
              type: 'lowpass',
              slide: 1200,
              envelope: { attack: 0.005, hold: 0, decay: 0.1, sustain: 0, release: 0.05, sustainLevel: 0.2, curve: 'exponential' },
              envAmount: 0.7,
            },
            highpass: { cutoff: 150, poles: 1, type: 'highpass' },
          },
        },
        sub(73.42, 0.18, 0.28, 73.42),
        high(440.0, 0.08, 0.1, 220.0),
        tail(146.83, 0.2, 0.13),
      ]),
  },
  {
    name: 'restart-0',
    category: 'ui',
    type: 'render',
    render: () =>
      layer(0.55, [
        // Aşama 1: Temiz tık
        mid(220.0, 0.05, 0.35, 0, 1600),
        high(440.0, 0.035, 0.1),
        // Aşama 2: Yükselen sequence — D3 → F3 → A3
        { ...mid(146.83, 0.1, 0.38, 0, 1400), offset: 0.07 },
        { ...high(293.66, 0.06, 0.1), offset: 0.07 },
        { ...mid(174.61, 0.1, 0.38, 0, 1500), offset: 0.18 },
        { ...high(349.23, 0.06, 0.1), offset: 0.18 },
        { ...mid(220.0, 0.14, 0.42, 0, 1700), offset: 0.29 },
        { ...sub(73.42, 0.18, 0.3), offset: 0.29 },
        { ...high(440.0, 0.08, 0.12), offset: 0.29 },
        { ...tail(146.83, 0.35, 0.13), offset: 0.29 },
      ]),
  },

  // ═══ Player — mekanik atış, hidrolik, tok hasar, çöküş ═════════════

  {
    name: 'fire-0',
    category: 'player',
    type: 'render',
    render: () =>
      layer(0.14, [
        // Mekanik atış — sawtooth, filter sweep, mid karakter
        {
          offset: 0,
          params: {
            sampleRate: SAMPLE_RATE,
            wave: 'sawtooth',
            frequency: 220.0, // A3
            slide: -110.0, // → A2
            gain: 0.42,
            duration: 0.1,
            envelope: { attack: 0.001, hold: 0.008, decay: 0.05, sustain: 0, release: 0.04, sustainLevel: 0.25, curve: 'exponential' },
            lowpass: {
              cutoff: 2200,
              resonance: 2,
              poles: 2,
              type: 'lowpass',
              slide: -1600,
              envelope: { attack: 0.001, hold: 0, decay: 0.06, sustain: 0, release: 0.035, sustainLevel: 0.1, curve: 'exponential' },
              envAmount: 0.7,
            },
            highpass: { cutoff: 180, poles: 1, type: 'highpass' },
          },
        },
        sub(110.0, 0.09, 0.3),                   // A2 — tok body
        high(880.0, 0.04, 0.1, -440.0),          // A5 → A4 — metalik detay
        transient(0.022, 0.15),                   // Kısa mekanizma click
      ]),
  },
  {
    name: 'fire-1',
    category: 'player',
    type: 'render',
    render: () =>
      layer(0.13, [
        {
          offset: 0,
          params: {
            sampleRate: SAMPLE_RATE,
            wave: 'sawtooth',
            frequency: 246.94, // B3
            slide: -123.47, // → B2
            gain: 0.4,
            duration: 0.095,
            envelope: { attack: 0.001, hold: 0.008, decay: 0.048, sustain: 0, release: 0.035, sustainLevel: 0.25, curve: 'exponential' },
            lowpass: {
              cutoff: 2100,
              resonance: 2,
              poles: 2,
              type: 'lowpass',
              slide: -1500,
              envelope: { attack: 0.001, hold: 0, decay: 0.055, sustain: 0, release: 0.03, sustainLevel: 0.1, curve: 'exponential' },
              envAmount: 0.7,
            },
            highpass: { cutoff: 180, poles: 1, type: 'highpass' },
          },
        },
        sub(123.47, 0.085, 0.3),                 // B2 — tok body
        high(987.77, 0.035, 0.1, -493.88),       // B5 → B4 — metalik detay
        transient(0.02, 0.14),
      ]),
  },
  {
    name: 'fire-2',
    category: 'player',
    type: 'render',
    render: () =>
      layer(0.12, [
        {
          offset: 0,
          params: {
            sampleRate: SAMPLE_RATE,
            wave: 'sawtooth',
            frequency: 261.63, // C4
            slide: -130.81, // → C3
            gain: 0.38,
            duration: 0.085,
            envelope: { attack: 0.001, hold: 0.008, decay: 0.045, sustain: 0, release: 0.03, sustainLevel: 0.25, curve: 'exponential' },
            lowpass: {
              cutoff: 2000,
              resonance: 2,
              poles: 2,
              type: 'lowpass',
              slide: -1400,
              envelope: { attack: 0.001, hold: 0, decay: 0.05, sustain: 0, release: 0.025, sustainLevel: 0.1, curve: 'exponential' },
              envAmount: 0.7,
            },
            highpass: { cutoff: 180, poles: 1, type: 'highpass' },
          },
        },
        sub(130.81, 0.075, 0.3),                 // C3 — tok body
        high(1046.5, 0.032, 0.1, -523.25),       // C6 → C5 — metalik detay
        transient(0.018, 0.13),
      ]),
  },
  {
    name: 'dash-0',
    category: 'player',
    type: 'render',
    render: () =>
      layer(0.45, [
        // Keskin transient — darbe karakteri
        transient(0.04, 0.25),
        // Hidrolik hareket — sawtooth, filter sweep
        {
          offset: 0,
          params: {
            sampleRate: SAMPLE_RATE,
            wave: 'sawtooth',
            frequency: 110.0, // A2
            slide: 73.42, // → D3
            gain: 0.42,
            duration: 0.4,
            envelope: { attack: 0.005, hold: 0.08, decay: 0.18, sustain: 0.06, release: 0.14, sustainLevel: 0.4, curve: 'cosine' },
            lowpass: {
              cutoff: 600,
              resonance: 2,
              poles: 2,
              type: 'lowpass',
              slide: 1400,
              envelope: { attack: 0.005, hold: 0, decay: 0.22, sustain: 0, release: 0.12, sustainLevel: 0.2, curve: 'exponential' },
              envAmount: 0.8,
            },
            highpass: { cutoff: 80, poles: 1, type: 'highpass' },
          },
        },
        // Sub rumble — A1 → D2
        sub(55.0, 0.35, 0.3, 36.71),
        // Yumuşak üst tını — A3 → A4
        high(220.0, 0.28, 0.12, 110.0),
        // Reverb tail
        { ...tail(146.83, 0.3, 0.13), offset: 0.1 },
      ]),
  },
  {
    name: 'hurt-0',
    category: 'player',
    type: 'render',
    render: () =>
      layer(0.35, [
        // Tok hasar — sawtooth, düşen, lowpass
        {
          offset: 0,
          params: {
            sampleRate: SAMPLE_RATE,
            wave: 'sawtooth',
            frequency: 146.83, // D3
            slide: -73.42, // → D2
            gain: 0.45,
            duration: 0.25,
            envelope: { attack: 0.003, hold: 0.02, decay: 0.13, sustain: 0, release: 0.1, sustainLevel: 0.35, curve: 'exponential' },
            lowpass: {
              cutoff: 1600,
              resonance: 2,
              poles: 2,
              type: 'lowpass',
              slide: -1100,
              envelope: { attack: 0.003, hold: 0, decay: 0.15, sustain: 0, release: 0.08, sustainLevel: 0.1, curve: 'exponential' },
              envAmount: 0.6,
            },
            highpass: { cutoff: 100, poles: 1, type: 'highpass' },
          },
        },
        sub(73.42, 0.22, 0.32),                   // D2 — tok body
        high(587.33, 0.08, 0.1, -293.66),         // D5 → D4 — metalik çatlama
        tail(73.42, 0.3, 0.15),
      ]),
  },
  {
    name: 'hurt-1',
    category: 'player',
    type: 'render',
    render: () =>
      layer(0.32, [
        // Daha düşük varyasyon — A2 → A1
        {
          offset: 0,
          params: {
            sampleRate: SAMPLE_RATE,
            wave: 'sawtooth',
            frequency: 110.0, // A2
            slide: -55.0, // → A1
            gain: 0.43,
            duration: 0.22,
            envelope: { attack: 0.003, hold: 0.02, decay: 0.12, sustain: 0, release: 0.09, sustainLevel: 0.35, curve: 'exponential' },
            lowpass: {
              cutoff: 1400,
              resonance: 2,
              poles: 2,
              type: 'lowpass',
              slide: -900,
              envelope: { attack: 0.003, hold: 0, decay: 0.13, sustain: 0, release: 0.07, sustainLevel: 0.1, curve: 'exponential' },
              envAmount: 0.6,
            },
            highpass: { cutoff: 80, poles: 1, type: 'highpass' },
          },
        },
        sub(55.0, 0.2, 0.32),                     // A1 — tok body
        high(440.0, 0.07, 0.1, -220.0),           // A4 → A3 — metalik çatlama
        tail(55.0, 0.27, 0.14),
      ]),
  },
  {
    name: 'death-0',
    category: 'player',
    type: 'render',
    render: () =>
      layer(2.5, [
        // Makine çöküşü — sawtooth, uzun düşüş
        {
          offset: 0,
          params: {
            sampleRate: SAMPLE_RATE,
            wave: 'sawtooth',
            frequency: 146.83, // D3
            slide: -110.0, // → A1
            gain: 0.38,
            duration: 2.0,
            envelope: { attack: 0.08, hold: 0.25, decay: 0.9, sustain: 0.12, release: 1.0, sustainLevel: 0.35, curve: 'cosine' },
            lowpass: {
              cutoff: 1000,
              resonance: 1.5,
              poles: 2,
              type: 'lowpass',
              slide: -700,
              envelope: { attack: 0.08, hold: 0, decay: 1.1, sustain: 0, release: 0.8, sustainLevel: 0.1, curve: 'exponential' },
              envAmount: 0.7,
            },
            highpass: { cutoff: 60, poles: 1, type: 'highpass' },
            reverb: { amount: 0.3, decay: 1.8, roomSize: 0.65, damp: 0.55 },
          },
        },
        // Sub çöküş — D2 → A1 (gain yüksek — crest factor düşür)
        sub(73.42, 2.2, 0.62, -36.71),
        // Mekanik çatlama — başta sert
        { ...mid(220.0, 0.45, 0.35, -110.0, 2000), offset: 0 },
        // Metalik tını — düşen kapanış
        { ...high(587.33, 0.7, 0.18, -293.66), offset: 0 },
        // Yumuşak noise — mekanik patlama
        {
          offset: 0,
          params: {
            sampleRate: SAMPLE_RATE,
            wave: 'noise',
            frequency: 110.0,
            gain: 0.16,
            duration: 0.35,
            envelope: { attack: 0.005, hold: 0.02, decay: 0.18, sustain: 0, release: 0.15, sustainLevel: 0.12, curve: 'exponential' },
            lowpass: { cutoff: 1500, resonance: 0.5, poles: 2, type: 'lowpass' },
            highpass: { cutoff: 100, poles: 1, type: 'highpass' },
            reverb: { amount: 0.3, decay: 1.2, roomSize: 0.65, damp: 0.55 },
          },
        },
      ]),
  },

  // ═══ Combat — metalik çarpışma, mekanik parçalanma, sekme ═══════════

  {
    name: 'enemy-hit-0',
    category: 'combat',
    type: 'render',
    render: () =>
      layer(0.12, [
        // Metalik çarpışma — sawtooth, lowpass
        mid(220.0, 0.08, 0.4, 0, 2200),          // A3 — mid karakter
        sub(110.0, 0.08, 0.3),                    // A2 — tok body
        high(880.0, 0.04, 0.12),                  // A5 — metalik ping
        transient(0.02, 0.15),                    // darbe transient
      ]),
  },
  {
    name: 'enemy-hit-1',
    category: 'combat',
    type: 'render',
    render: () =>
      layer(0.11, [
        mid(233.08, 0.075, 0.38, 0, 2300),       // Bb3 — mid karakter
        sub(116.54, 0.075, 0.3),                  // Bb2 — tok body
        high(932.33, 0.035, 0.11),                // Bb5 — metalik ping
        transient(0.018, 0.14),
      ]),
  },
  {
    name: 'enemy-death-0',
    category: 'combat',
    type: 'render',
    render: () =>
      layer(1.0, [
        // Mekanik parçalanma — sawtooth, düşen
        {
          offset: 0,
          params: {
            sampleRate: SAMPLE_RATE,
            wave: 'sawtooth',
            frequency: 220.0, // A3
            slide: -110.0, // → A2
            gain: 0.38,
            duration: 0.75,
            envelope: { attack: 0.008, hold: 0.04, decay: 0.35, sustain: 0.1, release: 0.4, sustainLevel: 0.3, curve: 'exponential' },
            lowpass: {
              cutoff: 1800,
              resonance: 2,
              poles: 2,
              type: 'lowpass',
              slide: -1300,
              envelope: { attack: 0.008, hold: 0, decay: 0.45, sustain: 0, release: 0.3, sustainLevel: 0.1, curve: 'exponential' },
              envAmount: 0.7,
            },
            highpass: { cutoff: 100, poles: 1, type: 'highpass' },
            reverb: { amount: 0.25, decay: 0.8, roomSize: 0.55, damp: 0.6 },
          },
        },
        // Sub çöküş — D2 → A1 (gain yüksek — crest factor düşür)
        sub(73.42, 0.85, 0.56, -36.71),
        // Mekanik çatlama — başta
        { ...mid(293.66, 0.25, 0.35, -146.83, 2400), offset: 0 },
        // Metalik tını — dağılan parça
        { ...high(880.0, 0.35, 0.18, -440.0), offset: 0.05 },
        // Yumuşak noise
        {
          offset: 0,
          params: {
            sampleRate: SAMPLE_RATE,
            wave: 'noise',
            frequency: 220.0,
            gain: 0.14,
            duration: 0.18,
            envelope: { attack: 0.005, hold: 0.015, decay: 0.1, sustain: 0, release: 0.07, sustainLevel: 0.12, curve: 'exponential' },
            lowpass: { cutoff: 1800, resonance: 0.5, poles: 2, type: 'lowpass' },
            highpass: { cutoff: 150, poles: 1, type: 'highpass' },
          },
        },
      ]),
  },
  {
    name: 'enemy-death-1',
    category: 'combat',
    type: 'render',
    render: () =>
      layer(0.9, [
        // Varyasyon — F3 → F2 düşen
        {
          offset: 0,
          params: {
            sampleRate: SAMPLE_RATE,
            wave: 'sawtooth',
            frequency: 174.61, // F3
            slide: -87.31, // → F2
            gain: 0.36,
            duration: 0.7,
            envelope: { attack: 0.008, hold: 0.04, decay: 0.32, sustain: 0.1, release: 0.35, sustainLevel: 0.3, curve: 'exponential' },
            lowpass: {
              cutoff: 1600,
              resonance: 2,
              poles: 2,
              type: 'lowpass',
              slide: -1100,
              envelope: { attack: 0.008, hold: 0, decay: 0.4, sustain: 0, release: 0.25, sustainLevel: 0.1, curve: 'exponential' },
              envAmount: 0.7,
            },
            highpass: { cutoff: 90, poles: 1, type: 'highpass' },
            reverb: { amount: 0.25, decay: 0.75, roomSize: 0.55, damp: 0.6 },
          },
        },
        // Sub — A2 → A1 (gain yüksek — crest factor düşür)
        sub(110.0, 0.75, 0.54, -55.0),
        // Mekanik çatlama
        { ...mid(349.23, 0.22, 0.33, -174.61, 2200), offset: 0 },
        // Metalik tını
        { ...high(698.46, 0.3, 0.17, -349.23), offset: 0.04 },
        // Yumuşak noise
        {
          offset: 0,
          params: {
            sampleRate: SAMPLE_RATE,
            wave: 'noise',
            frequency: 174.61,
            gain: 0.13,
            duration: 0.15,
            envelope: { attack: 0.005, hold: 0.012, decay: 0.08, sustain: 0, release: 0.06, sustainLevel: 0.12, curve: 'exponential' },
            lowpass: { cutoff: 1600, resonance: 0.5, poles: 2, type: 'lowpass' },
            highpass: { cutoff: 130, poles: 1, type: 'highpass' },
          },
        },
      ]),
  },
  {
    name: 'bullet-bounce-0',
    category: 'combat',
    type: 'render',
    render: () =>
      layer(0.2, [
        // Metalik sekme — sawtooth, yükselen, lowpass
        {
          offset: 0,
          params: {
            sampleRate: SAMPLE_RATE,
            wave: 'sawtooth',
            frequency: 220.0, // A3
            slide: 110.0, // → A4
            gain: 0.4,
            duration: 0.12,
            envelope: { attack: 0.002, hold: 0.008, decay: 0.06, sustain: 0, release: 0.05, sustainLevel: 0.25, curve: 'exponential' },
            lowpass: { cutoff: 2600, resonance: 2, poles: 2, type: 'lowpass' },
            highpass: { cutoff: 350, poles: 1, type: 'highpass' },
          },
        },
        sub(110.0, 0.1, 0.3, 55.0),               // A2 → A3 — tok body
        high(880.0, 0.07, 0.13, 440.0),           // A5 → A6 — metalik ping
        { ...tail(220.0, 0.18, 0.13), offset: 0.02 },
      ]),
  },
];

// ─── Üretim döngüsü ──────────────────────────────────────────────────

const filter = filterArg?.toLowerCase();

for (const spec of specs) {
  if (filter) {
    const nameMatch = spec.name.toLowerCase().startsWith(filter);
    const categoryMatch = spec.category.toLowerCase() === filter;
    if (!nameMatch && !categoryMatch) continue;
  }

  const categoryDir = join(outDir, spec.category);
  if (!existsSync(categoryDir)) mkdirSync(categoryDir, { recursive: true });

  let result: SynthesisResult;
  if (spec.type === 'render') {
    result = spec.render();
  } else {
    const paramList = Array.isArray(spec.params) ? spec.params : [spec.params];
    const buffers = paramList.map((p) => synth(p.duration, p).channels[0]!);
    const totalLen = Math.max(...buffers.map((b) => b.length));
    const mixed = new Float32Array(totalLen);
    for (const b of buffers) {
      for (let i = 0; i < b.length; i++) {
        mixed[i] += b[i]!;
      }
    }
    result = {
      channels: [normalize(mixed, TARGET_PEAK)],
      sampleRate: SAMPLE_RATE,
      duration: totalLen / SAMPLE_RATE,
    };
  }

  const outPath = join(categoryDir, `${spec.name}.wav`);
  writeWav(outPath, result);
  console.log(`Generated: ${outPath} (${result.duration.toFixed(2)}s, ${result.sampleRate}Hz)`);
}

if (filter) {
  console.log(`\nFiltered SFX (${filter}) written to ${outDir}`);
} else {
  console.log(`\nAll SFX written to ${outDir}`);
}
