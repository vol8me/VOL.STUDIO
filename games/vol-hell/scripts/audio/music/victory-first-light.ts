/**
 * FIRST LIGHT — Zafer ekranı.
 *
 * D (minörden majöre çözülür), 92 BPM, 4/4, 32 vuruş (~20.9 s), loop YOK.
 * Karakter: boşluktan çıkış — koşu 20 dalgayı devirdi. Yükselen motif ve
 * sıcak pad, son barda D majör üzerinde durulur. Tema karanlık kalır ama
 * ilk kez nefes alır.
 */

import { MUSIC_TIMING } from '@/config/musicTiming';
import { createMix, addVoice, masterize } from '../lib/mix';
import type { StereoMix } from '../lib/mix';
import { beatSec, hz } from '../lib/theory';
import type { NoteEvent } from '../lib/theory';
import { placeNotes } from '../lib/track';
import type { TrackDef } from '../lib/track';
import { subBass } from '../palette/bass';
import { warmPad } from '../palette/pads';
import { glassKey, nightLead } from '../palette/keys';
import { deepImpact } from '../palette/fx';

/**
 * Tempo ve uzunluk `src/config/musicTiming.ts`ten gelir — çalma
 * config'iyle aynı kaynak. Buraya sayı yazmak, `loopEnd` ile bestenin
 * sessizce ayrışmasına yol açardı (bkz. o dosyanın başındaki not).
 */
const { bpm: BPM, beats: BEATS } = MUSIC_TIMING['first-light'];

/** Yükselen zafer motifi — D eksenli, son adımda majör 3'lüye (F#) varır. */
const ASCENT: NoteEvent[] = [
  { note: 'D4', beat: 0.5, dur: 1.5 },
  { note: 'F4', beat: 2.5, dur: 1.5 },
  { note: 'A4', beat: 4.5, dur: 2 },
  { note: 'G4', beat: 7.5, dur: 1.5 },
  { note: 'A4', beat: 10, dur: 2.5 },
  { note: 'C5', beat: 13.5, dur: 2 },
  { note: 'D5', beat: 16.5, dur: 4, gain: 1.05 },
  { note: 'A4', beat: 22, dur: 2 },
  { note: 'F#4', beat: 25, dur: 5, gain: 0.9 },
];

/** Akor yürüyüşü: Dm → Bb → C → D majör (picardy çözülmesi). */
const PADS: Array<{ notes: string[]; beat: number; dur: number }> = [
  { notes: ['D3', 'F3', 'A3'], beat: 0, dur: 8 },
  { notes: ['Bb2', 'D3', 'F3'], beat: 8, dur: 8 },
  { notes: ['C3', 'E3', 'G3'], beat: 16, dur: 8 },
  { notes: ['D3', 'F#3', 'A3', 'D4'], beat: 24, dur: 8 },
];

/** Kapanış arpeji — D majör üzerinde cam tuş yankıları. */
const CODA: NoteEvent[] = [
  { note: 'D4', beat: 24.5, dur: 1 },
  { note: 'F#4', beat: 25.5, dur: 1 },
  { note: 'A4', beat: 26.5, dur: 1 },
  { note: 'D5', beat: 27.5, dur: 3, gain: 0.85 },
];

function build(): StereoMix {
  const mix = createMix((BEATS * 60) / BPM);
  const beat = beatSec(BPM);

  addVoice(mix, deepImpact(100), 0.01, { gain: 0.85 });

  for (const [i, pad] of PADS.entries()) {
    pad.notes.forEach((note, j) => {
      addVoice(mix, warmPad(hz(note), pad.dur * beat, 200 + i * 7 + j), pad.beat * beat, {
        pan: j === 0 ? -0.18 : j === pad.notes.length - 1 ? 0.18 : 0,
      });
    });
    const rootNote = pad.notes[0];
    if (rootNote) {
      addVoice(mix, subBass(hz(rootNote) / 2, pad.dur * beat, 260 + i), pad.beat * beat, {
        gain: 0.75,
      });
    }
  }

  placeNotes(mix, ASCENT, BPM, nightLead, { baseSeed: 300, durScale: 1.2 });
  placeNotes(mix, CODA, BPM, glassKey, { baseSeed: 400, durScale: 1.7, pan: 0.1 });

  masterize(mix, { peakTarget: 0.9, rmsTargetDb: -16.5 });
  return mix;
}

/** First Light track tanımı. */
export const firstLight: TrackDef = {
  id: 'first-light',
  file: 'end/first-light.ogg',
  bpm: BPM,
  beats: BEATS,
  loop: false,
  rmsTargetDb: -16.5,
  build,
};
