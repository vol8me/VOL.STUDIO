/**
 * Komposisyon primitifleri demo track.
 *
 * Amaç: harmony / motif / arrangement motorlarını ve yeni instruments
 * kütüphanesini bir arada göstermek. Bu track yeni bir asset üretir,
 * mevcut oyun asset'lerinin byte-identicallığını etkilemez.
 */

import { synth } from '../src/audio/synth/engine';
import {
  createMix,
  createBeatClock,
  addVoice,
  applyEdgeGuard,
  masterChain,
  chordFreqs,
  parseWavOggArgs,
  writeTrack,
  type ChordDef,
} from './audio-mix';
import { generateProgression } from './composition/harmony';
import { generateMotif } from './composition/motif';
import { generateArrangement } from './composition/arrangement';
import {
  softBass,
  additivePad,
  brightLead,
  woodPluck,
  warmKeys,
  crystalBell,
} from '../src/audio/synth/presets/instruments';

const { wavPath, oggPath } = parseWavOggArgs('generate-composition-demo.ts');

const BPM = 88;
const LOOP_BEATS = 48;
const clock = createBeatClock(BPM);
const DURATION = LOOP_BEATS * clock.beatDuration;

// Stil: pastoral / fantasy
const ROOT = 146.83; // D3
const SCALE = [0, 2, 4, 5, 7, 9, 11]; // major

const CHORDS: ChordDef[] = generateProgression({
  root: ROOT,
  scale: SCALE,
  changeBeats: 8,
  length: 6,
  chordTypes: ['major', 'major7', 'sus2', 'add9'],
  tonicWeight: 0.45,
  seed: 11,
});

const MOTIF = generateMotif({
  root: ROOT,
  scale: SCALE,
  degrees: [0, 2, 4, 7, 4, 2, 0],
  durations: 0.55,
  delays: clock.beatDuration,
  seed: 21,
});

const ARRANGEMENT = generateArrangement({
  totalBeats: LOOP_BEATS,
  layers: ['pad', 'bass', 'pluck', 'lead', 'keys', 'bell'],
  intensityPoints: [
    [0, 0.2],
    [8, 0.45],
    [16, 0.7],
    [32, 0.9],
    [40, 0.5],
    [48, 0.2],
  ],
  layerRanges: {
    pad: [0, LOOP_BEATS],
    bass: [8, LOOP_BEATS],
    pluck: [16, 40],
    lead: [24, 44],
    keys: [32, 44],
    bell: [40, LOOP_BEATS],
  },
});

function isLayerActive(layer: string, beat: number): boolean {
  const event = ARRANGEMENT.events.find((e) => e.layer === layer);
  if (!event) return false;
  return beat >= event.startBeat && beat < event.endBeat;
}

const mix = createMix(DURATION);

// Pad: akor başına additive sine pad
for (let beat = 0; beat < LOOP_BEATS; beat += 8) {
  const chord = CHORDS[(beat / 8) % CHORDS.length]!;
  const tones = chordFreqs(chord);
  const offset = clock.toSample(beat);
  tones.forEach((freq, i) => {
    if (isLayerActive('pad', beat)) {
      const pad = additivePad(freq, 3.0);
      addVoice(
        mix,
        synth(pad.duration, {
          ...pad,
          gain: 0.13 - i * 0.02,
          pan: (i % 2 === 0 ? -1 : 1) * 0.25,
          seed: 200 + beat + i,
        }),
        offset,
      );
    }
  });
}

// Bass: her 2 beatte bir kök
for (let beat = 8; beat < LOOP_BEATS; beat += 2) {
  const chord = CHORDS[Math.floor(beat / 8) % CHORDS.length]!;
  if (isLayerActive('bass', beat)) {
    const offset = clock.toSample(beat);
    const bass = softBass(chord.root / 2, 0.6);
    addVoice(mix, synth(bass.duration, { ...bass, gain: 0.25, pan: 0, seed: 300 + beat }), offset);
  }
}

// Pluck arpeggio
for (let beat = 16; beat < 40; beat += 1) {
  if (!isLayerActive('pluck', beat)) continue;
  const chord = CHORDS[Math.floor(beat / 8) % CHORDS.length]!;
  const tones = chordFreqs(chord);
  const noteIndex = beat % tones.length;
  const offset = clock.toSample(beat) + clock.humanize(beat, 5, 7);
  const pluck = woodPluck(tones[noteIndex]!, 0.35);
  addVoice(
    mix,
    synth(pluck.duration, {
      ...pluck,
      gain: 0.2,
      pan: beat % 2 === 0 ? -0.35 : 0.35,
      seed: 400 + beat,
    }),
    offset,
  );
}

// Lead motif
let leadBeat = 24;
for (const note of MOTIF) {
  if (leadBeat >= 44) break;
  if (isLayerActive('lead', leadBeat)) {
    const offset = clock.toSample(leadBeat);
    const lead = brightLead(note.freq!, note.duration);
    addVoice(
      mix,
      synth(lead.duration, { ...lead, gain: 0.25, pan: 0, seed: 500 + leadBeat }),
      offset,
    );
  }
  leadBeat += Math.round((note.delay ?? 0) / clock.beatDuration) + 1;
}

// Keys stabs
for (let beat = 32; beat < 44; beat += 4) {
  if (!isLayerActive('keys', beat)) continue;
  const chord = CHORDS[Math.floor(beat / 8) % CHORDS.length]!;
  const tones = chordFreqs(chord);
  const offset = clock.toSample(beat);
  const keys = warmKeys(tones[0]!, 0.6);
  addVoice(mix, synth(keys.duration, { ...keys, gain: 0.2, pan: -0.2, seed: 600 + beat }), offset);
}

// Bell accents
for (let beat = 40; beat < LOOP_BEATS; beat += 4) {
  if (!isLayerActive('bell', beat)) continue;
  const chord = CHORDS[Math.floor(beat / 8) % CHORDS.length]!;
  const offset = clock.toSample(beat);
  const bell = crystalBell(chord.root * 2, 1.0);
  addVoice(
    mix,
    synth(bell.duration, {
      ...bell,
      gain: 0.16,
      pan: beat % 2 === 0 ? -0.4 : 0.4,
      seed: 700 + beat,
    }),
    offset,
  );
}

applyEdgeGuard(mix, 12);
const result = masterChain(mix, { targetRmsDb: -16, peakCeiling: 0.95, drive: 1.05 });

writeTrack(wavPath, oggPath, result);
