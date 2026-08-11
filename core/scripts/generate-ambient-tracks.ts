/**
 * Vol-Hell ambiyans track'leri — 3 sade track.
 *
 * Mevcut ambiyans çok gürültülü — oyun seslerini batırıyor.
 * Yeni yaklaşım: sade, atmosferik, oyun seslerine yer açan.
 *
 * 1. Calm (düşman az/yok) — drone + pad + çok hafif pluck arpej
 * 2. Tense (düşman çok) — karanlık drone + pluck riff + hafif perküsyon
 * 3. Death (ölüm) — inen piyano, dramatik
 *
 * Tonalite: D minor — combat track ile uyumlu.
 *
 * Kullanım: tsx scripts/generate-ambient-tracks.ts <out-dir>
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { synth } from '../src/audio/synth/engine';
import { pluck } from '../src/audio/synth/physical';
import { writeWav } from '../src/audio/synth/writer';
import type { SynthesisResult } from '../src/audio/synth/types';
import {
  SAMPLE_RATE,
  FIFTH,
  MINOR_3,
  type ChordDef,
  emptyBuffer,
  toStereo,
  addToStereo,
  createBeatUtils,
  masterMix,
} from './music-utils';

// --- CLI ---

const outDirArg = process.argv[2];
if (!outDirArg) {
  console.error('Kullanim: tsx scripts/generate-ambient-tracks.ts <out-dir>');
  process.exit(1);
}
const outDir = resolve(outDirArg);
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// --- Sabitler ---

const BPM = 72;
const BEAT = 60 / BPM;
const TAIL = 5;
const LOOP_BEATS = 64;
const LOOP_DURATION = LOOP_BEATS * BEAT;
const FILE_DURATION = LOOP_DURATION + TAIL;

const { beatToSample, applyFades } = createBeatUtils(BEAT);

// --- D minor paleti ---

const D1 = 36.71;
const D2 = 73.42;
const A2 = 110.0;
const D3 = 146.83;
const F3 = 174.61;
const G3 = 196.0;
const A3 = 220.0;
const Bb3 = 233.08;
const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63;
const F4 = 349.23;
const G4 = 392.0;
const A4 = 440.0;
const Bb4 = 466.16;
const C5 = 523.25;
const D5 = 587.33;

// --- Akor ilerlemesi: Dm - Bb - F - C (i - VI - III - VII)
//     4 akor × 8 beat = 32 beat, 2 tekrar = 64 beat

const CHORDS: ChordDef[] = [
  { root: D4, type: 'minor' }, // Dm
  { root: Bb3, type: 'major' }, // Bb
  { root: F3, type: 'major' }, // F
  { root: C4, type: 'major' }, // C
];

// --- Enstrümanlar ---

/** Çok derin sub-bass drone — neredeyse hissedilir, duyulmaz.
 *  Oyun seslerine hiç karışmaz. Atmosferik zemin.
 *  LFO yok — sabit, yorucu olmayan, kulak yormaz. */
function deepDrone(freq: number, duration: number, gain = 0.18): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    wave: 'sine',
    frequency: freq,
    detune: 2,
    envelope: {
      attack: 4,
      hold: 0,
      decay: 0,
      sustain: Math.max(0, duration - 8),
      release: 4,
      sustainLevel: 0.9,
      curve: 'cosine',
    },
    lowpass: { cutoff: 150, resonance: 0, poles: 1, type: 'lowpass' },
    gain,
  });
}

/** Hafif pad — sawtooth, çok dar lowpass, az gain.
 *  Sadece harmonik zemin — melodi değil, ritim değil. */
function ambientPad(freq: number, duration: number, gain = 0.08): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    wave: 'sawtooth',
    frequency: freq,
    detune: 8,
    envelope: {
      attack: 3,
      hold: 0,
      decay: 0,
      sustain: duration - 6,
      release: 3,
      sustainLevel: 0.7,
      curve: 'cosine',
    },
    lowpass: { cutoff: 400, resonance: 0, poles: 2, type: 'lowpass' },
    chorus: { depth: 3, rate: 0.15, mix: 0.25 },
    stereoWidth: { width: 0.8 },
    reverb: { amount: 0.3, decay: 5, roomSize: 0.85, damp: 0.6 },
    gain,
  });
}

/** Physical pluck — kısa, sade, uzak.
 *  Calm'de çok uzun aralıklarla (her 8 beat'te bir nota).
 *  Tense'de daha sık ve karanlık. */
function ambientPluck(freq: number, duration: number, velocity = 1): SynthesisResult {
  return pluck({
    frequency: freq,
    duration,
    sampleRate: SAMPLE_RATE,
    decay: 0.992,
    excitationMix: 0.4,
    excitationHarmonics: 3,
    stereoWidth: 0.3,
    gain: 0.2 * velocity,
    bodyResonance: freq * 2,
    bodyAmount: 0.15,
  });
}

/** Tense drone — daha karanlık, hafif dissonans.
 *  İki yakın frekanslı sine — beating efekti ile gerilim.
 *  LFO çok hafif — calm ile uyumlu, geçiş pürüzsüz. */
function tenseDrone(freq: number, duration: number, gain = 0.2): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    wave: 'sine',
    frequency: freq,
    detune: 15, // beating için yeterli
    envelope: {
      attack: 3,
      hold: 0,
      decay: 0,
      sustain: Math.max(0, duration - 7),
      release: 4,
      sustainLevel: 0.85,
      curve: 'cosine',
    },
    lowpass: { cutoff: 300, resonance: 0, poles: 2, type: 'lowpass' },
    lfos: [{ target: 'amplitude', rate: 0.08, depth: 0.08, wave: 'sine' }],
    stereoWidth: { width: 0.6 },
    reverb: { amount: 0.25, decay: 4, roomSize: 0.7, damp: 0.5 },
    gain,
  });
}

/** Tense pad — daha agresif, daha parlak.
 *  Calm pad'den farklı — cutoff daha yüksek, gain daha fazla. */
function tensePad(freq: number, duration: number, gain = 0.12): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    wave: 'sawtooth',
    frequency: freq,
    detune: 12,
    envelope: {
      attack: 2,
      hold: 0,
      decay: 0,
      sustain: duration - 5,
      release: 3,
      sustainLevel: 0.75,
      curve: 'cosine',
    },
    lowpass: { cutoff: 600, resonance: 0, poles: 2, type: 'lowpass' },
    lfos: [{ target: 'filter', rate: 0.1, depth: 100, wave: 'sine' }],
    chorus: { depth: 4, rate: 0.2, mix: 0.3 },
    stereoWidth: { width: 0.9 },
    reverb: { amount: 0.3, decay: 4, roomSize: 0.8, damp: 0.45 },
    gain,
  });
}

/** Hafif perküsyon — tense'de sadece.
 *  Çok düşük gain, uzak hissi — kick her 4 beat, hiç snare yok. */
function softKick(freq: number, duration: number): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    wave: 'sine',
    frequency: freq,
    slide: -freq * 0.6,
    slideCurve: 'exponential',
    envelope: {
      attack: 0.005,
      hold: 0.01,
      decay: 0.25,
      sustain: 0,
      release: 0.05,
      sustainLevel: 0,
      curve: 'exponential',
    },
    lowpass: { cutoff: 400, resonance: 0, poles: 1, type: 'lowpass' },
    reverb: { amount: 0.2, decay: 1, roomSize: 0.6, damp: 0.7 },
    gain: 0.2,
  });
}

/** Piyano notası — death track için.
 *  FM ile piyano benzeri timbre — sine taşıyıcı + sine modülatör.
 *  Yumuşak atak — FM index düşük, attack yavaş. Sert vuruş yok. */
function pianoNote(freq: number, duration: number, velocity = 1): SynthesisResult {
  return synth(duration + 0.5, {
    sampleRate: SAMPLE_RATE,
    wave: 'sine',
    frequency: freq,
    detune: 2,
    fm: {
      modulatorWave: 'sine',
      ratio: 2,
      index: 0.8 * velocity,
      modulatorEnvelope: {
        attack: 0.02,
        hold: 0,
        decay: 0.4,
        sustain: 0,
        release: 0.3,
        sustainLevel: 0,
        curve: 'exponential',
      },
    },
    envelope: {
      attack: 0.03,
      hold: 0,
      decay: 0.5,
      sustain: 0.2,
      release: 1.5,
      sustainLevel: 0.15,
      curve: 'exponential',
    },
    lowpass: { cutoff: 2500, resonance: 0, poles: 1, type: 'lowpass' },
    stereoWidth: { width: 0.5 },
    reverb: { amount: 0.35, decay: 4, roomSize: 0.85, damp: 0.4 },
    gain: 0.4 * velocity,
  });
}

// ============================================================
// TRACK 1: CALM (düşman az/yok)
// Sade — drone + pad + çok hafif pluck arpej
// Oyun seslerini batırmayan, atmosferik
// ============================================================

function renderCalmAmbient(): SynthesisResult {
  const left = emptyBuffer(FILE_DURATION);
  const right = emptyBuffer(FILE_DURATION);

  // Deep drone — D1, çok derin, neredeyse hissedilir
  // Tense ile aynı base — geçiş uyumu için
  addToStereo(left, right, deepDrone(D1, FILE_DURATION, 0.15), 0);

  // Ambient pad — akor başına 8 beat, daha düşük gain (yorucu değil)
  for (let repeat = 0; repeat < 2; repeat++) {
    for (let i = 0; i < CHORDS.length; i++) {
      const beat = repeat * 32 + i * 8;
      const chord = CHORDS[i]!;
      const root = chord.root / 2; // bir oktav aşağı — sıcak
      const fifth = root * FIFTH;
      const chordDur = 8 * BEAT + 2;
      const offset = beatToSample(beat);

      addToStereo(left, right, ambientPad(root, chordDur, 0.06), offset);
      addToStereo(left, right, ambientPad(fifth, chordDur, 0.04), offset);
    }
  }

  // Çok hafif pluck arpej — her 8 beat'te bir nota, uzak ve sade
  // Sadece 2. tekrarda (beat 32+) — ilk 32 beat tamamen sade
  // Tense ile aynı notalar başlar — geçiş doğal
  const calmArp = [
    { freq: D4, beat: 32 },
    { freq: F4, beat: 40 },
    { freq: A4, beat: 48 },
    { freq: F4, beat: 56 },
  ];
  for (const note of calmArp) {
    const offset = beatToSample(note.beat);
    if (offset >= left.length) break;
    addToStereo(left, right, ambientPluck(note.freq, BEAT * 3, 0.35), offset);
  }

  applyFades(left, right, 0, 8, 56, 64);
  const [mL, mR] = masterMix(left, right);
  return toStereo(mL, mR, FILE_DURATION);
}

// ============================================================
// TRACK 2: TENSE (düşman çok)
// Karanlık drone + pluck riff + hafif perküsyon
// Combat'tan farklı — ritmik değil, gerilimli
// ============================================================

function renderTenseAmbient(): SynthesisResult {
  const left = emptyBuffer(FILE_DURATION);
  const right = emptyBuffer(FILE_DURATION);

  // Base drone — calm ile aynı D1 deepDrone — geçiş pürüzsüz
  addToStereo(left, right, deepDrone(D1, FILE_DURATION, 0.15), 0);
  // Tense katman — A2 üstüne beating efekti ile gerilim
  addToStereo(left, right, tenseDrone(A2, FILE_DURATION, 0.1), 0);

  // Tense pad — akor başına 8 beat
  for (let repeat = 0; repeat < 2; repeat++) {
    for (let i = 0; i < CHORDS.length; i++) {
      const beat = repeat * 32 + i * 8;
      const chord = CHORDS[i]!;
      const root = chord.root / 2;
      const third = root * MINOR_3; // hep minor third — karanlık
      const chordDur = 8 * BEAT + 2;
      const offset = beatToSample(beat);

      addToStereo(left, right, tensePad(root, chordDur, 0.09), offset);
      addToStereo(left, right, tensePad(third, chordDur, 0.06), offset);
    }
  }

  // Pluck riff — her 4 beat'te bir nota, karanlık arpej
  // Calm ile aynı notalardan başlar — geçiş doğal
  const tenseArp = [
    // 1. tekrar (beat 0-32) — calm'in 2. yarısı ile aynı notalar
    { freq: D4, beat: 0 },
    { freq: F4, beat: 4 },
    { freq: A4, beat: 8 },
    { freq: F4, beat: 12 },
    { freq: D4, beat: 16 },
    { freq: F4, beat: 20 },
    { freq: A4, beat: 24 },
    { freq: F4, beat: 28 },
    // 2. tekrar (beat 32-64) — daha hareketli
    { freq: A4, beat: 32 },
    { freq: D5, beat: 36 },
    { freq: C5, beat: 40 },
    { freq: A4, beat: 44 },
    { freq: G4, beat: 48 },
    { freq: F4, beat: 52 },
    { freq: E4, beat: 56 },
    { freq: D4, beat: 60 },
  ];
  for (const note of tenseArp) {
    const offset = beatToSample(note.beat);
    if (offset >= left.length) break;
    addToStereo(left, right, ambientPluck(note.freq, BEAT * 2.5, 0.6), offset);
  }

  // Hafif kick — her 4 beat, çok düşük gain
  for (let b = 0; b < LOOP_BEATS; b += 4) {
    const offset = beatToSample(b);
    if (offset >= left.length) break;
    addToStereo(left, right, softKick(45, BEAT), offset);
  }

  applyFades(left, right, 0, 4, 58, 64);
  const [mL, mR] = masterMix(left, right);
  return toStereo(mL, mR, FILE_DURATION);
}

// ============================================================
// TRACK 3: DEATH (ölüm)
// İnen piyano — D5 → A4 → F4 → D4 → A3 → D3
// Sub-bass drone altta
// ============================================================

function renderDeath(): SynthesisResult {
  const slowBeat = BEAT * 2; // yavaş — her nota 2 beat
  const loopBeats = 16;
  const fileDuration = loopBeats * slowBeat + TAIL;
  const left = emptyBuffer(fileDuration);
  const right = emptyBuffer(fileDuration);

  // İnen piyano — D5 → A4 → F4 → D4 → A3 → D3
  // D minor skala aşağı — dramatik çözülüm
  const notes = [
    { freq: D5, beat: 0, velocity: 0.9 },
    { freq: A4, beat: 2, velocity: 0.8 },
    { freq: F4, beat: 4, velocity: 0.75 },
    { freq: D4, beat: 6, velocity: 0.7 },
    { freq: A3, beat: 8, velocity: 0.65 },
    { freq: D3, beat: 10, velocity: 0.6 },
    { freq: A2, beat: 12, velocity: 0.5 },
    { freq: D2, beat: 14, velocity: 0.4 },
  ];

  for (const note of notes) {
    const offset = Math.floor(note.beat * slowBeat * SAMPLE_RATE);
    if (offset >= left.length) break;
    addToStereo(left, right, pianoNote(note.freq, slowBeat * 2, note.velocity), offset);
  }

  // Sub-bass drone altta — D1, sürekli
  addToStereo(left, right, deepDrone(D1, fileDuration, 0.15), 0);

  // Hafif pad — D minor, sürekli
  addToStereo(left, right, ambientPad(D2, fileDuration, 0.06), 0);
  addToStereo(left, right, ambientPad(A2, fileDuration, 0.04), 0);

  const [mL, mR] = masterMix(left, right);
  return toStereo(mL, mR, fileDuration);
}

// --- Üret ---

const tracks = [
  { name: 'void-whisper', render: renderCalmAmbient, dir: 'gameplay' },
  { name: 'iron-tide', render: renderTenseAmbient, dir: 'gameplay' },
  { name: 'last-ember', render: renderDeath, dir: 'death' },
];

for (const track of tracks) {
  const trackDir = join(outDir, track.dir);
  if (!existsSync(trackDir)) mkdirSync(trackDir, { recursive: true });
  const result = track.render();
  const outPath = join(trackDir, `${track.name}.wav`);
  writeWav(outPath, result);
  console.log(`Generated: ${outPath} (${result.duration.toFixed(2)}s, ${result.sampleRate}Hz)`);
}
