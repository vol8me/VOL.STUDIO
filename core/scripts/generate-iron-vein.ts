/**
 * Ana menü müziği 1 — "Iron Vein" v2
 * C minor, 85 BPM. Endüstriyel sinematik ambient.
 *
 * Geliştirmeler:
 * - Loop uç noktaları aynı akor/dokuda (Cm) — gerçek döngü.
 * - Shimmer/air layer ile 4-12 kHz frekans alanı dolduruldu.
 * - Pan, LFO, filter envelope ile hareket ve derinlik.
 * - Spektral denge düzeltildi: bas daha kontrollü, üst tını açıldı.
 *
 * Loop: 64 beat (~45.2s). Tail yok; doğrudan döngülenebilir.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { writeWav } from '../src/audio/synth/writer';
import type { SynthesisResult } from '../src/audio/synth/types';
import {
  SAMPLE_RATE,
  MINOR_3,
  MAJOR_3,
  FIFTH,
  emptyBuffer,
  toStereo,
  addToStereo,
  chordAtBeat,
  createBeatUtils,
  masterMix,
  type ChordDef,
} from './music-utils';
import {
  deepSubBass,
  darkDrone,
  warmPad,
  shimmerAir,
  highShimmer,
  bassPulse2,
  arpSaw,
  bellLead,
  cinematicKick,
  darkSnare2,
  openHiHat,
} from './menu-music-instruments';

// --- CLI ---

const outDirArg = process.argv[2];
if (!outDirArg) {
  console.error('Kullanim: tsx scripts/generate-iron-vein.ts <out.wav>');
  process.exit(1);
}
const outPath = resolve(outDirArg);
const outDir = dirname(outPath);
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// --- Sabitler ---

const BPM = 85;
const BEAT = 60 / BPM;
const LOOP_BEATS = 64;
const FILE_DURATION = LOOP_BEATS * BEAT;

const { beatToSample, applyFades } = createBeatUtils(BEAT);

// --- C minor paleti ---

const C1 = 32.70;
const C2 = 65.41;
const Bb2 = 116.54;
const C3 = 130.81;
const Eb3 = 155.56;
const G3 = 196.00;
const Ab3 = 207.65;
const Bb3 = 233.08;
const C4 = 261.63;
const D4 = 293.66;
const Eb4 = 311.13;
const F4 = 349.23;
const G4 = 392.00;
const Ab4 = 415.30;

// --- Akor ilerlemesi: Cm - Ab - Eb - Bb - Cm - Ab - Eb - Cm
//     i - VI - III - VII - i - VI - III - i (döngüye dönük son)

const CHORDS: ChordDef[] = [
  { root: C3, type: 'minor' },
  { root: Ab3, type: 'major' },
  { root: Eb3, type: 'major' },
  { root: Bb2, type: 'major' },
  { root: C3, type: 'minor' },
  { root: Ab3, type: 'major' },
  { root: Eb3, type: 'major' },
  { root: C3, type: 'minor' },
];

// --- Lead melodi (beat 24-48) ---

const LEAD_MELODY = [
  // Bb (24-32)
  { freq: Bb3, beats: 2, velocity: 0.9, pan: 0.2 },
  { freq: F4, beats: 1.5, velocity: 0.85, pan: -0.2 },
  { freq: D4, beats: 1.5, velocity: 0.8, pan: 0.1 },
  { freq: Bb3, beats: 1.5, velocity: 0.75, pan: 0.2 },
  { freq: D4, beats: 1.5, velocity: 0.8, pan: -0.1 },
  // Cm (32-40)
  { freq: C4, beats: 2, velocity: 1.0, pan: -0.15 },
  { freq: Eb4, beats: 1.5, velocity: 0.9, pan: 0.15 },
  { freq: G4, beats: 2, velocity: 0.85, pan: -0.2 },
  { freq: C4, beats: 1.5, velocity: 0.8, pan: 0.1 },
  { freq: G4, beats: 1, velocity: 0.75, pan: 0.0 },
  // Ab (40-48)
  { freq: Ab3, beats: 2, velocity: 0.9, pan: 0.15 },
  { freq: C4, beats: 1.5, velocity: 0.85, pan: -0.15 },
  { freq: Eb4, beats: 1.5, velocity: 0.8, pan: 0.1 },
  { freq: C4, beats: 2, velocity: 0.78, pan: -0.1 },
  { freq: Ab3, beats: 1, velocity: 0.72, pan: 0.0 },
];

// --- Track render'ları ---

function chordNotes(chord: ChordDef, octave = 1) {
  const root = chord.root * octave;
  const third = root * (chord.type === 'minor' ? MINOR_3 : MAJOR_3);
  const fifth = root * FIFTH;
  return { root, third, fifth };
}

/** Ana drone: C1 sabit + akor kökleri bir oktav aşağı.
 *  Döngü uçlarında sadece drone+pad dokusu kalır. */
function renderDroneTrack(duration: number): SynthesisResult {
  const left = emptyBuffer(duration);
  const right = emptyBuffer(duration);

  // C1 sabit sub foundation
  addToStereo(left, right, deepSubBass(C1, duration, 0.22, 0), 0);
  addToStereo(left, right, darkDrone(C1, duration, 0.08, 0), 0);

  // akor kökleri hareketi
  for (let beat = 0; beat < LOOP_BEATS; beat += 8) {
    const chord = chordAtBeat(CHORDS, beat);
    const dur = 8 * BEAT + 0.8;
    const bassFreq = chord.root / 2;
    addToStereo(left, right, deepSubBass(bassFreq, dur, 0.16, Math.sin(beat * 0.5) * 0.25), beatToSample(beat));
  }

  applyFades(left, right, 0, 4, 60, 64);
  return toStereo(left, right, duration);
}

/** Warm pad + shimmer air: her akor 8 beat, geniş stereo. */
function renderPadTrack(duration: number): SynthesisResult {
  const left = emptyBuffer(duration);
  const right = emptyBuffer(duration);

  for (let beat = 0; beat < LOOP_BEATS; beat += 8) {
    const chord = chordAtBeat(CHORDS, beat);
    const { root, third, fifth } = chordNotes(chord);
    const dur = 8 * BEAT + 1.2;
    const offset = beatToSample(beat);

    addToStereo(left, right, warmPad(root, dur, 0.18, Math.sin(beat * 0.4) * 0.3), offset);
    addToStereo(left, right, warmPad(third, dur, 0.12, Math.cos(beat * 0.4) * 0.3), offset);
    addToStereo(left, right, warmPad(fifth, dur, 0.1, -Math.sin(beat * 0.4) * 0.3), offset);

    // air layer — 2 oktav yukarı
    const shimmerRoot = root * 4;
    const shimmerFifth = fifth * 4;
    addToStereo(left, right, shimmerAir(shimmerRoot, dur, 0.18, -0.4), offset);
    addToStereo(left, right, shimmerAir(shimmerFifth, dur, 0.12, 0.4), offset);

    // ultra-high shimmer — 3 oktav yukarı
    const highRoot = root * 8;
    addToStereo(left, right, highShimmer(highRoot, dur, 0.05, 0.45), offset);
  }

  applyFades(left, right, 0, 4, 60, 64);
  return toStereo(left, right, duration);
}

/** Bass pulse: her 2 beat'te akor kökü. */
function renderBassTrack(duration: number): SynthesisResult {
  const left = emptyBuffer(duration);
  const right = emptyBuffer(duration);

  for (let beat = 0; beat < LOOP_BEATS; beat += 8) {
    const chord = chordAtBeat(CHORDS, beat);
    for (let b = 0; b < 8; b += 2) {
      const offset = beatToSample(beat + b);
      const freq = chord.root / 2;
      const pan = (b % 4 === 0) ? -0.15 : 0.15;
      addToStereo(left, right, bassPulse2(freq, BEAT * 1.3, 0.22, pan), offset);
    }
  }

  applyFades(left, right, 8, 10, 54, 58);
  return toStereo(left, right, duration);
}

/** Perküsyon: kick her 2 beat, snare her 4 beat (off 2), hihat her beat. */
function renderPercussionTrack(duration: number): SynthesisResult {
  const left = emptyBuffer(duration);
  const right = emptyBuffer(duration);

  for (let b = 16; b < LOOP_BEATS; b++) {
    const offset = beatToSample(b);
    if (offset >= left.length) break;

    if (b % 2 === 0) {
      addToStereo(left, right, cinematicKick(50, BEAT * 0.9, 0.35, 0.05 * (b % 4 === 0 ? -1 : 1)), offset);
    }
    if (b % 4 === 2) {
      addToStereo(left, right, darkSnare2(BEAT * 0.45, 0.2, 0.1), offset);
    }

    // open hi-hat on every beat + off-beat
    addToStereo(left, right, openHiHat(BEAT * 0.25, 0.12, 0.25), offset);
    const halfOffset = beatToSample(b + 0.5);
    if (halfOffset < left.length) {
      addToStereo(left, right, openHiHat(BEAT * 0.2, 0.08, -0.25), halfOffset);
    }
  }

  applyFades(left, right, 16, 18, 54, 58);
  return toStereo(left, right, duration);
}

/** 16th-note arpeggio: beat 24-56. */
function buildArpPattern(chord: ChordDef) {
  const root = chord.root * 2;
  const third = root * (chord.type === 'minor' ? MINOR_3 : MAJOR_3);
  const fifth = root * FIFTH;
  const octave = root * 2;

  const half = [
    { freq: root, velocity: 1.0 },
    { freq: third, velocity: 0.6 },
    { freq: fifth, velocity: 0.75 },
    { freq: octave, velocity: 0.85 },
    { freq: fifth, velocity: 0.65 },
    { freq: third, velocity: 0.55 },
    { freq: root, velocity: 0.9 },
    { freq: fifth, velocity: 0.6 },
  ];
  return [...half, ...half];
}

function renderArpTrack(duration: number): SynthesisResult {
  const left = emptyBuffer(duration);
  const right = emptyBuffer(duration);

  const arpChords = [CHORDS[3]!, CHORDS[0]!, CHORDS[1]!, CHORDS[2]!]; // Bb, Cm, Ab, Eb
  let beatCounter = 24;
  for (const chord of arpChords) {
    const pattern = buildArpPattern(chord);
    for (let i = 0; i < pattern.length; i++) {
      const note = pattern[i]!;
      const offset = beatToSample(beatCounter);
      if (offset >= left.length) break;
      const noteDur = Math.min(0.5 * BEAT + 0.35, duration - beatCounter * BEAT);
      const pan = Math.sin(i * 0.6) * 0.35;
      addToStereo(left, right, arpSaw(note.freq, noteDur, note.velocity, pan), offset);
      beatCounter += 0.5;
    }
  }

  applyFades(left, right, 24, 26, 50, 54);
  return toStereo(left, right, duration);
}

/** Lead melody: beat 24-48. */
function renderLeadTrack(duration: number): SynthesisResult {
  const left = emptyBuffer(duration);
  const right = emptyBuffer(duration);

  let beatCounter = 24;
  for (const note of LEAD_MELODY) {
    const offset = beatToSample(beatCounter);
    if (offset >= left.length) break;
    const noteDur = note.beats * BEAT;
    addToStereo(left, right, bellLead(note.freq, noteDur, note.velocity ?? 1, note.pan ?? 0), offset);
    beatCounter += note.beats;
  }

  applyFades(left, right, 24, 26, 44, 48);
  return toStereo(left, right, duration);
}

// --- Ana render ---

function renderIronVein(): SynthesisResult {
  const left = emptyBuffer(FILE_DURATION);
  const right = emptyBuffer(FILE_DURATION);

  addToStereo(left, right, renderDroneTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderPadTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderBassTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderPercussionTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderArpTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderLeadTrack(FILE_DURATION), 0);

  const [mL, mR] = masterMix(left, right);

  // Katman fade'leri zaten uçları sessizle; master sadece click önleyici kısa fade.
  const fadeBeats = 0.02 / BEAT;
  applyFades(mL, mR, 0, fadeBeats, LOOP_BEATS - fadeBeats, LOOP_BEATS);

  return toStereo(mL, mR, FILE_DURATION);
}

const result = renderIronVein();
writeWav(outPath, result, 1.0);
console.log(`Generated: ${outPath} (${result.duration.toFixed(2)}s, ${result.sampleRate}Hz)`);
