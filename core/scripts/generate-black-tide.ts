/**
 * Ana menü müziği 2 — "Black Tide" v2
 * D minor, 90 BPM. Gizemli, melodik karanlık fantezi.
 *
 * Geliştirmeler:
 * - Loop uç noktaları Dm akorunda buluşur.
 * - Shimmer ve high air ile üst frekanslar açılır.
 * - Pluck telleri ve sinematik stringlerle karakter ayrılır.
 */

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
  parseWavOggArgs,
  writeMenuTrack,
  type ChordDef,
} from './music-utils';
import {
  deepSubBass,
  darkDrone,
  warmPad,
  shimmerAir,
  highShimmer,
  bassPulse2,
  pluckString,
  bellLead,
  cinematicStrings2,
  cinematicKick,
  darkSnare2,
  openHiHat,
} from './menu-music-instruments';

// --- CLI ---

const { wavPath, oggPath } = parseWavOggArgs('generate-black-tide.ts');

// --- Sabitler ---

const BPM = 90;
const BEAT = 60 / BPM;
const LOOP_BEATS = 96;
const FILE_DURATION = LOOP_BEATS * BEAT;

const { beatToSample, applyFades } = createBeatUtils(BEAT);

// --- D minor paleti ---

const D2 = 73.42;
const A2 = 110.0;
const Bb2 = 116.54;
const C3 = 130.81;
const D3 = 146.83;
const E3 = 164.81;
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

// --- Akor ilerlemesi: Dm Am Bb F C Gm A Dm
//     16 beat | 16 beat | 16 beat | 16 beat | 8 beat | 8 beat | 8 beat | 8 beat

const CHORDS: ChordDef[] = [
  { root: D3, type: 'minor' },
  { root: A2, type: 'minor' },
  { root: Bb2, type: 'major' },
  { root: F3, type: 'major' },
  { root: C3, type: 'major' },
  { root: G3, type: 'minor' },
  { root: A2, type: 'major' },
  { root: D3, type: 'minor' },
];

const CHORD_BEATS = [16, 16, 16, 16, 8, 8, 8, 8];
function chordAtIndex(i: number) {
  return CHORDS[i]!;
}
function startBeatOf(i: number) {
  let s = 0;
  for (let j = 0; j < i; j++) s += CHORD_BEATS[j]!;
  return s;
}
function chordAtBeatCustom(beat: number) {
  let s = 0;
  for (let i = 0; i < CHORDS.length; i++) {
    s += CHORD_BEATS[i]!;
    if (beat < s) return CHORDS[i]!;
  }
  return CHORDS[0]!;
}

// --- Lead melodi (beat 32-80) ---

const LEAD_MELODY = [
  // Bb (32-48)
  { freq: Bb3, beats: 4, velocity: 0.9, pan: 0.15 },
  { freq: D4, beats: 3, velocity: 0.8, pan: -0.15 },
  { freq: F4, beats: 3, velocity: 0.85, pan: 0.1 },
  { freq: D4, beats: 4, velocity: 0.75, pan: -0.1 },
  // F (48-64)
  { freq: A3, beats: 4, velocity: 0.9, pan: 0.2 },
  { freq: C4, beats: 3, velocity: 0.8, pan: -0.2 },
  { freq: F4, beats: 3, velocity: 0.85, pan: 0.15 },
  { freq: C4, beats: 4, velocity: 0.75, pan: -0.15 },
  // C (64-72)
  { freq: G3, beats: 3, velocity: 0.85, pan: 0.1 },
  { freq: E4, beats: 2, velocity: 0.8, pan: -0.1 },
  { freq: C4, beats: 3, velocity: 0.75, pan: 0.0 },
  // Gm (72-80)
  { freq: Bb3, beats: 3, velocity: 0.85, pan: 0.15 },
  { freq: D4, beats: 2, velocity: 0.8, pan: -0.1 },
  { freq: G3, beats: 3, velocity: 0.75, pan: 0.0 },
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

  // D2 sabit sub foundation
  addToStereo(left, right, deepSubBass(D2, duration, 0.22, 0), 0);
  addToStereo(left, right, darkDrone(D2, duration, 0.08, 0), 0);

  for (let i = 0; i < CHORDS.length; i++) {
    const chord = chordAtIndex(i);
    const beat = startBeatOf(i);
    const dur = CHORD_BEATS[i]! * BEAT + 0.8;
    const bassFreq = chord.root / 2;
    addToStereo(
      left,
      right,
      deepSubBass(bassFreq, dur, 0.14, Math.sin(i * 0.5) * 0.25),
      beatToSample(beat),
    );
  }

  applyFades(left, right, 0, 4, 92, 96);
  return toStereo(left, right, duration);
}

function renderPadTrack(duration: number): SynthesisResult {
  const left = emptyBuffer(duration);
  const right = emptyBuffer(duration);

  for (let i = 0; i < CHORDS.length; i++) {
    const chord = chordAtIndex(i);
    const beat = startBeatOf(i);
    const dur = CHORD_BEATS[i]! * BEAT + 1.2;
    const { root, third, fifth } = chordNotes(chord);
    const offset = beatToSample(beat);

    addToStereo(left, right, warmPad(root, dur, 0.16, Math.sin(i * 0.4) * 0.3), offset);
    addToStereo(left, right, warmPad(third, dur, 0.11, Math.cos(i * 0.4) * 0.3), offset);
    addToStereo(left, right, warmPad(fifth, dur, 0.09, -Math.sin(i * 0.4) * 0.3), offset);

    addToStereo(left, right, shimmerAir(root * 4, dur, 0.18, -0.4), offset);
    addToStereo(left, right, shimmerAir(fifth * 4, dur, 0.12, 0.4), offset);
    addToStereo(left, right, highShimmer(root * 8, dur, 0.05, 0.45), offset);
  }

  applyFades(left, right, 0, 4, 92, 96);
  return toStereo(left, right, duration);
}

function renderBassTrack(duration: number): SynthesisResult {
  const left = emptyBuffer(duration);
  const right = emptyBuffer(duration);

  for (let i = 0; i < CHORDS.length; i++) {
    const chord = chordAtIndex(i);
    const beat = startBeatOf(i);
    const len = CHORD_BEATS[i]!;
    const pulseSpacing = 2;
    for (let b = 0; b < len; b += pulseSpacing) {
      const offset = beatToSample(beat + b);
      const freq = chord.root / 2;
      const pan = b % 4 === 0 ? -0.1 : 0.1;
      addToStereo(left, right, bassPulse2(freq, BEAT * 1.3, 0.22, pan), offset);
    }
  }

  applyFades(left, right, 8, 10, 86, 90);
  return toStereo(left, right, duration);
}

function renderPercussionTrack(duration: number): SynthesisResult {
  const left = emptyBuffer(duration);
  const right = emptyBuffer(duration);

  for (let b = 16; b < LOOP_BEATS; b++) {
    const offset = beatToSample(b);
    if (offset >= left.length) break;

    if (b % 2 === 0) {
      addToStereo(
        left,
        right,
        cinematicKick(50, BEAT * 0.9, 0.32, 0.05 * (b % 4 === 0 ? -1 : 1)),
        offset,
      );
    }
    if (b % 4 === 2) {
      addToStereo(left, right, darkSnare2(BEAT * 0.45, 0.18, 0.1), offset);
    }

    addToStereo(left, right, openHiHat(BEAT * 0.25, 0.12, 0.25), offset);
    const halfOffset = beatToSample(b + 0.5);
    if (halfOffset < left.length) {
      addToStereo(left, right, openHiHat(BEAT * 0.2, 0.08, -0.25), halfOffset);
    }
  }

  applyFades(left, right, 16, 18, 86, 90);
  return toStereo(left, right, duration);
}

function buildArpPattern(chord: ChordDef) {
  const root = chord.root * 2;
  const third = root * (chord.type === 'minor' ? MINOR_3 : MAJOR_3);
  const fifth = root * FIFTH;
  const octave = root * 2;
  return [
    { freq: root, velocity: 1.0 },
    { freq: fifth, velocity: 0.7 },
    { freq: third, velocity: 0.6 },
    { freq: octave, velocity: 0.85 },
    { freq: fifth, velocity: 0.65 },
    { freq: third, velocity: 0.55 },
    { freq: root, velocity: 0.9 },
    { freq: fifth, velocity: 0.6 },
  ];
}

function renderArpTrack(duration: number): SynthesisResult {
  const left = emptyBuffer(duration);
  const right = emptyBuffer(duration);

  // Arp chords: Am(16-32) Bb(32-48) F(48-64) C(64-72) Gm(72-80)
  const arpIndices = [1, 2, 3, 4, 5];
  let beatCounter = 16;
  for (const i of arpIndices) {
    const chord = chordAtIndex(i);
    const pattern = buildArpPattern(chord);
    const len = i === 4 || i === 5 ? 8 : 16; // last two chords 8 beats
    const reps = len / 4;
    for (let r = 0; r < reps; r++) {
      for (let j = 0; j < pattern.length; j++) {
        const note = pattern[j]!;
        const offset = beatToSample(beatCounter);
        if (offset >= left.length) break;
        const noteDur = Math.min(0.5 * BEAT + 0.35, duration - beatCounter * BEAT);
        const pan = Math.sin(j * 0.6) * 0.35;
        addToStereo(left, right, pluckString(note.freq, noteDur, note.velocity, pan), offset);
        beatCounter += 0.5;
      }
    }
  }

  applyFades(left, right, 16, 18, 78, 82);
  return toStereo(left, right, duration);
}

function renderLeadTrack(duration: number): SynthesisResult {
  const left = emptyBuffer(duration);
  const right = emptyBuffer(duration);

  let beatCounter = 32;
  for (const note of LEAD_MELODY) {
    const offset = beatToSample(beatCounter);
    if (offset >= left.length) break;
    const noteDur = note.beats * BEAT;
    addToStereo(
      left,
      right,
      bellLead(note.freq, noteDur, note.velocity ?? 1, note.pan ?? 0),
      offset,
    );
    beatCounter += note.beats;
  }

  applyFades(left, right, 32, 34, 78, 82);
  return toStereo(left, right, duration);
}

function renderStringsTrack(duration: number): SynthesisResult {
  const left = emptyBuffer(duration);
  const right = emptyBuffer(duration);

  for (let i = 0; i < CHORDS.length; i++) {
    const chord = chordAtIndex(i);
    const beat = startBeatOf(i);
    const dur = CHORD_BEATS[i]! * BEAT + 1.0;
    const { root, third, fifth } = chordNotes(chord);
    const offset = beatToSample(beat);

    addToStereo(left, right, cinematicStrings2(root, dur, 0.16, Math.sin(i * 0.3) * 0.4), offset);
    addToStereo(left, right, cinematicStrings2(third, dur, 0.12, -Math.sin(i * 0.3) * 0.4), offset);
    addToStereo(left, right, cinematicStrings2(fifth, dur, 0.1, Math.cos(i * 0.3) * 0.35), offset);
  }

  applyFades(left, right, 0, 6, 90, 96);
  return toStereo(left, right, duration);
}

// --- Ana render ---

function renderBlackTide(): SynthesisResult {
  const left = emptyBuffer(FILE_DURATION);
  const right = emptyBuffer(FILE_DURATION);

  addToStereo(left, right, renderDroneTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderPadTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderStringsTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderBassTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderPercussionTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderArpTrack(FILE_DURATION), 0);
  addToStereo(left, right, renderLeadTrack(FILE_DURATION), 0);

  const [mL, mR] = masterMix(left, right);
  const fadeBeats = 0.02 / BEAT;
  applyFades(mL, mR, 0, fadeBeats, LOOP_BEATS - fadeBeats, LOOP_BEATS);

  return toStereo(mL, mR, FILE_DURATION);
}

const result = renderBlackTide();
writeMenuTrack(wavPath, oggPath, result);
