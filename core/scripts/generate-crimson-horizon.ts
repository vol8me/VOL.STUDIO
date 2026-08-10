/**
 * Ana menü müziği 3 — "Crimson Horizon" v2
 * A minor / E major, 85 BPM. Sinematik, büyüleyici karanlık.
 *
 * Geliştirmeler:
 * - Loop Am akoru ile başlar ve biter.
 * - Cinematic strings + brass stab ile dramatik profil.
 * - Shimmer/air ile üst tını zenginliği.
 * - LFO, pan ve filter envelope ile hareket.
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
  brassStab,
  cinematicStrings2,
  cinematicKick,
  darkSnare2,
  openHiHat,
} from './menu-music-instruments';

// --- CLI ---

const outDirArg = process.argv[2];
if (!outDirArg) {
  console.error('Kullanim: tsx scripts/generate-crimson-horizon.ts <out.wav>');
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

// --- A minor / E major paleti ---

const A2 = 110.00;
const C3 = 130.81;
const D3 = 146.83;
const E3 = 164.81;
const F3 = 174.61;
const G3 = 196.00;
const A3 = 220.00;
const B3 = 246.94;
const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63;
const F4 = 349.23;
const G4 = 392.00;
const A4 = 440.00;
const B4 = 493.88;
const C5 = 523.25;

// --- Akor ilerlemesi: Am F C G Am F E Am
//     8 beat başına, sonu başa döngüye uyar.

const CHORDS: ChordDef[] = [
  { root: A3, type: 'minor' },
  { root: F3, type: 'major' },
  { root: C3, type: 'major' },
  { root: G3, type: 'major' },
  { root: A3, type: 'minor' },
  { root: F3, type: 'major' },
  { root: E3, type: 'major' },
  { root: A2, type: 'minor' },
];

// --- Lead melodi (beat 24-48) ---

const LEAD_MELODY = [
  // Am (24-32)
  { freq: A3, beats: 2, velocity: 1.0, pan: 0.15 },
  { freq: C4, beats: 1.5, velocity: 0.9, pan: -0.15 },
  { freq: E4, beats: 2, velocity: 0.85, pan: 0.1 },
  { freq: C4, beats: 1.5, velocity: 0.8, pan: 0.0 },
  { freq: A3, beats: 1, velocity: 0.75, pan: 0.15 },
  // F (32-40)
  { freq: F3, beats: 2, velocity: 0.9, pan: -0.2 },
  { freq: A3, beats: 1.5, velocity: 0.85, pan: 0.2 },
  { freq: C4, beats: 2, velocity: 0.8, pan: -0.15 },
  { freq: F4, beats: 1.5, velocity: 0.75, pan: 0.15 },
  { freq: A3, beats: 1, velocity: 0.7, pan: 0.0 },
  // C (40-48)
  { freq: E3, beats: 2, velocity: 0.9, pan: 0.15 },
  { freq: G3, beats: 1.5, velocity: 0.85, pan: -0.15 },
  { freq: C4, beats: 2, velocity: 0.8, pan: 0.1 },
  { freq: G3, beats: 1.5, velocity: 0.75, pan: -0.1 },
  { freq: E4, beats: 1, velocity: 0.7, pan: 0.0 },
];

// --- Track render'ları ---

function chordNotes(chord: ChordDef, octave = 1) {
  const root = chord.root * octave;
  const third = root * (chord.type === 'minor' ? MINOR_3 : MAJOR_3);
  const fifth = root * FIFTH;
  return { root, third, fifth };
}

function renderDroneTrack(duration: number): SynthesisResult {
  const left = emptyBuffer(duration);
  const right = emptyBuffer(duration);

  addToStereo(left, right, deepSubBass(A2, duration, 0.22, 0), 0);
  addToStereo(left, right, darkDrone(A2, duration, 0.08, 0), 0);

  for (let beat = 0; beat < LOOP_BEATS; beat += 8) {
    const chord = chordAtBeat(CHORDS, beat);
    const dur = 8 * BEAT + 0.8;
    const bassFreq = chord.root / 2;
    addToStereo(left, right, deepSubBass(bassFreq, dur, 0.14, Math.sin(beat * 0.5) * 0.25), beatToSample(beat));
  }

  applyFades(left, right, 0, 4, 60, 64);
  return toStereo(left, right, duration);
}

function renderPadTrack(duration: number): SynthesisResult {
  const left = emptyBuffer(duration);
  const right = emptyBuffer(duration);

  for (let beat = 0; beat < LOOP_BEATS; beat += 8) {
    const chord = chordAtBeat(CHORDS, beat);
    const { root, third, fifth } = chordNotes(chord);
    const dur = 8 * BEAT + 1.2;
    const offset = beatToSample(beat);

    addToStereo(left, right, warmPad(root, dur, 0.16, Math.sin(beat * 0.4) * 0.3), offset);
    addToStereo(left, right, warmPad(third, dur, 0.11, Math.cos(beat * 0.4) * 0.3), offset);
    addToStereo(left, right, warmPad(fifth, dur, 0.09, -Math.sin(beat * 0.4) * 0.3), offset);

    addToStereo(left, right, shimmerAir(root * 4, dur, 0.18, -0.4), offset);
    addToStereo(left, right, shimmerAir(fifth * 4, dur, 0.12, 0.4), offset);
    addToStereo(left, right, highShimmer(root * 8, dur, 0.05, 0.45), offset);
  }

  applyFades(left, right, 0, 4, 60, 64);
  return toStereo(left, right, duration);
}

function renderStringsTrack(duration: number): SynthesisResult {
  const left = emptyBuffer(duration);
  const right = emptyBuffer(duration);

  for (let beat = 0; beat < LOOP_BEATS; beat += 8) {
    const chord = chordAtBeat(CHORDS, beat);
    const { root, third, fifth } = chordNotes(chord);
    const dur = 8 * BEAT + 1.0;
    const offset = beatToSample(beat);

    addToStereo(left, right, cinematicStrings2(root, dur, 0.16, Math.sin(beat * 0.3) * 0.4), offset);
    addToStereo(left, right, cinematicStrings2(third, dur, 0.12, -Math.sin(beat * 0.3) * 0.4), offset);
    addToStereo(left, right, cinematicStrings2(fifth, dur, 0.1, Math.cos(beat * 0.3) * 0.35), offset);
  }

  applyFades(left, right, 0, 6, 60, 64);
  return toStereo(left, right, duration);
}

function renderBrassTrack(duration: number): SynthesisResult {
  const left = emptyBuffer(duration);
  const right = emptyBuffer(duration);

  // Brass swells on downbeats of each 8-beat chord, with extra E major emphasis
  for (let beat = 0; beat < LOOP_BEATS; beat += 8) {
    const chord = chordAtBeat(CHORDS, beat);
    const { root } = chordNotes(chord);
    const dur = 2 * BEAT;
    const offset = beatToSample(beat);
    const idx = beat / 8;
    addToStereo(left, right, brassStab(root, dur, 0.22, idx % 2 === 0 ? -0.3 : 0.3), offset);

    if (beat === 48) { // E major chord at 48-56
      addToStereo(left, right, brassStab(root * 2, BEAT * 1.5, 0.18, 0.4), beatToSample(beat + 4));
      addToStereo(left, right, brassStab(root * 2 * (MAJOR_3), BEAT * 1.5, 0.14, -0.4), beatToSample(beat + 5));
    }
  }

  applyFades(left, right, 8, 12, 52, 56);
  return toStereo(left, right, duration);
}

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

    addToStereo(left, right, openHiHat(BEAT * 0.25, 0.12, 0.25), offset);
    const halfOffset = beatToSample(b + 0.5);
    if (halfOffset < left.length) {
      addToStereo(left, right, openHiHat(BEAT * 0.2, 0.08, -0.25), halfOffset);
    }
  }

  applyFades(left, right, 16, 18, 54, 58);
  return toStereo(left, right, duration);
}

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

  const arpChords = [CHORDS[3]!, CHORDS[0]!, CHORDS[1]!, CHORDS[2]!]; // G, Am, F, C
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

  applyFades(left, right, 24, 26, 46, 50);
  return toStereo(left, right, duration);
}

// --- Ana render ---

function renderCrimsonHorizon(): SynthesisResult {
  const left = emptyBuffer(FILE_DURATION);
  const right = emptyBuffer(FILE_DURATION);

  addToStereo(left, right, renderDroneTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderPadTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderStringsTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderBrassTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderBassTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderPercussionTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderArpTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderLeadTrack(FILE_DURATION), 0);

  const [mL, mR] = masterMix(left, right);
  const fadeBeats = 0.02 / BEAT;
  applyFades(mL, mR, 0, fadeBeats, LOOP_BEATS - fadeBeats, LOOP_BEATS);

  return toStereo(mL, mR, FILE_DURATION);
}

const result = renderCrimsonHorizon();
writeWav(outPath, result, 1.0);
console.log(`Generated: ${outPath} (${result.duration.toFixed(2)}s, ${result.sampleRate}Hz)`);
