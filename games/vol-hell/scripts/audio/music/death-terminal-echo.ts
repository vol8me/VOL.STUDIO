/**
 * TERMINAL ECHO — Ölüm ekranı.
 *
 * D minör, 56 BPM, 4/4, 24 vuruş (~25.7 s), loop YOK — parça kendi içinde
 * söner. Karakter: sinyalin kesilişi — inen cam motifi, altında çöken pad
 * ve zeminden çekilen sub. Son çan yankısı sessizliğe bırakılır.
 */

import { MUSIC_TIMING } from '@/config/musicTiming';
import { createMix, addVoice, masterize } from '../lib/mix';
import type { StereoMix } from '../lib/mix';
import { beatSec, hz } from '../lib/theory';
import type { NoteEvent } from '../lib/theory';
import { placeNotes } from '../lib/track';
import type { TrackDef } from '../lib/track';
import { subBass } from '../palette/bass';
import { voidPad } from '../palette/pads';
import { glassKey } from '../palette/keys';
import { subDrop } from '../palette/fx';

/**
 * Tempo ve uzunluk `src/config/musicTiming.ts`ten gelir — çalma
 * config'iyle aynı kaynak. Buraya sayı yazmak, `loopEnd` ile bestenin
 * sessizce ayrışmasına yol açardı (bkz. o dosyanın başındaki not).
 */
const { bpm: BPM, beats: BEATS } = MUSIC_TIMING['terminal-echo'];

/** İnen veda motifi — her nota bir öncekinden aşağıda, aralıklar açılır. */
const DESCENT: NoteEvent[] = [
  { note: 'D4', beat: 1, dur: 2 },
  { note: 'C4', beat: 4, dur: 2 },
  { note: 'Bb3', beat: 7.5, dur: 2.5 },
  { note: 'A3', beat: 11, dur: 3 },
  { note: 'F3', beat: 15, dur: 3, gain: 0.8 },
  { note: 'D3', beat: 19, dur: 4, gain: 0.7 },
];

/** Akor çöküşü: Dm → Bb → Gm → D (kök). */
const PADS: Array<{ notes: string[]; beat: number; dur: number; gain: number }> = [
  { notes: ['D3', 'F3', 'A3'], beat: 0, dur: 6, gain: 1 },
  { notes: ['Bb2', 'D3', 'F3'], beat: 6, dur: 6, gain: 0.85 },
  { notes: ['G2', 'Bb2', 'D3'], beat: 12, dur: 6, gain: 0.7 },
  { notes: ['D2', 'A2'], beat: 18, dur: 6, gain: 0.55 },
];

function build(): StereoMix {
  const mix = createMix((BEATS * 60) / BPM);
  const beat = beatSec(BPM);

  addVoice(mix, subDrop(100), 0.01, { gain: 0.8 });
  addVoice(mix, subBass(hz('D2'), 10 * beat, 110), 0, { gain: 0.8 });

  for (const [i, pad] of PADS.entries()) {
    pad.notes.forEach((note, j) => {
      addVoice(mix, voidPad(hz(note), pad.dur * beat, 200 + i * 5 + j), pad.beat * beat, {
        gain: pad.gain,
        pan: j === 0 ? -0.15 : j === pad.notes.length - 1 ? 0.15 : 0,
      });
    });
  }

  placeNotes(mix, DESCENT, BPM, glassKey, { baseSeed: 300, durScale: 1.9 });

  masterize(mix, { peakTarget: 0.88, rmsTargetDb: -18 });
  return mix;
}

/** Terminal Echo track tanımı. */
export const terminalEcho: TrackDef = {
  id: 'terminal-echo',
  file: 'end/terminal-echo.ogg',
  bpm: BPM,
  beats: BEATS,
  loop: false,
  rmsTargetDb: -18,
  build,
};
