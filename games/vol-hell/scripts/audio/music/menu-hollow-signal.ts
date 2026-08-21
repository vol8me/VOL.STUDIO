/**
 * HOLLOW SIGNAL — Ana menü 1.
 *
 * D minör, 84 BPM, 4/4, 32 bar (128 vuruş, ~91.4 s), dikişsiz loop.
 * Karakter: ağır çekim yerçekimi — boşlukta dönen bir istasyonun iç sesi.
 *
 * Form (8'er barlık dört faz):
 *   A  (bar 0-7)   giriş     — pad + sub + seyrek cam motif (M1)
 *   B  (bar 8-15)  gelişme   — kalp atışı kick + bas deseni + motif cevabı (M2)
 *   C  (bar 16-23) doruk     — ritim tamamlanır, gece lead'i melodiyi taşır
 *   D  (bar 24-31) çözülme   — ritim çekilir, motif yankıları loop'a bağlanır
 *
 * Armoni (2 bar / akor): Dm — Bb — Gm — Am.
 */

import { MUSIC_TIMING } from '@/config/musicTiming';
import { createMix, addVoice, masterize, edgeGuard } from '../lib/mix';
import type { StereoMix } from '../lib/mix';
import { beatSec, hz } from '../lib/theory';
import type { NoteEvent } from '../lib/theory';
import { placeNotes, placeHits, everyBar } from '../lib/track';
import type { TrackDef } from '../lib/track';
import { kick, snare, tick } from '../palette/percussion';
import { subBass, pulseBass } from '../palette/bass';
import { voidPad } from '../palette/pads';
import { glassKey, nightLead } from '../palette/keys';
import { deepImpact, tonalRiser, subDrop } from '../palette/fx';

/**
 * Tempo ve uzunluk `src/config/musicTiming.ts`ten gelir — çalma
 * config'iyle aynı kaynak. Buraya sayı yazmak, `loopEnd` ile bestenin
 * sessizce ayrışmasına yol açardı (bkz. o dosyanın başındaki not).
 */
const { bpm: BPM, beats: BEATS } = MUSIC_TIMING['hollow-signal'];

const WRAP = true;

/** 2 bar / akor döngüsü: [sub bas kökü, pad sesleri]. */
const CHORDS: Array<{ root: string; pad: string[] }> = [
  { root: 'D2', pad: ['D3', 'F3', 'A3'] },
  { root: 'Bb1', pad: ['Bb2', 'D3', 'F3'] },
  { root: 'G1', pad: ['G2', 'Bb2', 'D3'] },
  { root: 'A1', pad: ['A2', 'C3', 'E3'] },
];

/** M1 — soru motifi (A fazı, Dm üzerinde açılır). Vuruşlar faz-yerel. */
const MOTIF_M1: NoteEvent[] = [
  { note: 'A3', beat: 2, dur: 1.5 },
  { note: 'D4', beat: 6, dur: 2 },
  { note: 'F4', beat: 10.5, dur: 1.5 },
  { note: 'D4', beat: 13, dur: 2 },
  { note: 'Bb3', beat: 18, dur: 2.5 },
  { note: 'A3', beat: 22, dur: 2 },
  { note: 'C4', beat: 26, dur: 1.5 },
  { note: 'A3', beat: 28.5, dur: 2.5 },
];

/** M2 — cevap motifi (B fazı, daha hareketli). */
const MOTIF_M2: NoteEvent[] = [
  { note: 'D4', beat: 2, dur: 1 },
  { note: 'E4', beat: 3.5, dur: 1 },
  { note: 'F4', beat: 6, dur: 2 },
  { note: 'D4', beat: 10, dur: 1.5 },
  { note: 'C4', beat: 12.5, dur: 1.5 },
  { note: 'Bb3', beat: 18, dur: 2 },
  { note: 'D4', beat: 21, dur: 1.5 },
  { note: 'E4', beat: 26, dur: 2 },
  { note: 'A3', beat: 29, dur: 2.5 },
];

/** C fazı melodisi — 8 barlık kavis, Gm üzerindeki G4 doruğuyla. */
const LEAD_MELODY: NoteEvent[] = [
  { note: 'D4', beat: 0, dur: 2 },
  { note: 'F4', beat: 2, dur: 1 },
  { note: 'E4', beat: 3, dur: 1 },
  { note: 'D4', beat: 4, dur: 2 },
  { note: 'A3', beat: 6, dur: 2 },
  { note: 'C4', beat: 8, dur: 2 },
  { note: 'D4', beat: 10, dur: 1 },
  { note: 'E4', beat: 11, dur: 1 },
  { note: 'F4', beat: 12, dur: 4 },
  { note: 'G4', beat: 16, dur: 2 },
  { note: 'F4', beat: 18, dur: 1 },
  { note: 'E4', beat: 19, dur: 1 },
  { note: 'D4', beat: 20, dur: 2 },
  { note: 'F4', beat: 22, dur: 2 },
  { note: 'E4', beat: 24, dur: 2 },
  { note: 'C4', beat: 26, dur: 2 },
  { note: 'D4', beat: 28, dur: 4 },
];

/** Akor zeminini verilen bar aralığına döşer (pad + sub bas). */
function layHarmony(mix: StereoMix, fromBar: number, toBar: number, seed: number): void {
  const beat = beatSec(BPM);
  const chordBeats = 8; // 2 bar
  for (let bar = fromBar; bar < toBar; bar += 2) {
    const chord = CHORDS[(bar >> 1) % CHORDS.length];
    if (!chord) continue;
    const at = bar * 4 * beat;
    const dur = chordBeats * beat;
    addVoice(mix, subBass(hz(chord.root), dur, seed + bar), at, { wrap: WRAP, gain: 0.9 });
    chord.pad.forEach((note, i) => {
      addVoice(mix, voidPad(hz(note), dur, seed + bar * 7 + i), at, {
        wrap: WRAP,
        pan: i === 0 ? -0.2 : i === 2 ? 0.2 : 0,
      });
    });
  }
}

/** B fazından itibaren kullanılan bas deseni: kök 8'likleri (bar-yerel 0, 1.5, 3). */
function layBassPattern(mix: StereoMix, fromBar: number, toBar: number, seed: number): void {
  const beat = beatSec(BPM);
  for (let bar = fromBar; bar < toBar; bar++) {
    const chord = CHORDS[(bar >> 1) % CHORDS.length];
    if (!chord) continue;
    const rootUp = hz(chord.root) * 2; // pulseBass sub'ın bir oktav üstünde
    for (const [i, offset] of [0, 1.5, 3].entries()) {
      addVoice(mix, pulseBass(rootUp, 0.42, seed + bar * 3 + i), (bar * 4 + offset) * beat, {
        wrap: WRAP,
        gain: 0.85,
      });
    }
  }
}

function build(): StereoMix {
  const mix = createMix((BEATS * 60) / BPM);
  const beat = beatSec(BPM);

  // — Armoni zemini: dört fazın tamamı —
  layHarmony(mix, 0, 32, 100);

  // — A fazı: seyrek cam motifi (M1) —
  placeNotes(mix, MOTIF_M1, BPM, glassKey, { baseSeed: 200, wrap: WRAP, durScale: 1.6 });

  // — B fazı: kalp atışı + bas deseni + M2 —
  placeHits(mix, everyBar([0, 2.5], 8, 16), BPM, kick, { baseSeed: 300, wrap: WRAP, gain: 0.6 });
  layBassPattern(mix, 8, 16, 310);
  placeNotes(
    mix,
    MOTIF_M2.map((e) => ({ ...e, beat: e.beat + 32 })),
    BPM,
    glassKey,
    { baseSeed: 320, wrap: WRAP, durScale: 1.6 },
  );

  // — C fazı: tam ritim + lead melodisi —
  placeHits(mix, everyBar([0, 2.5], 16, 24), BPM, kick, { baseSeed: 400, wrap: WRAP, gain: 0.75 });
  placeHits(mix, everyBar([2], 16, 24), BPM, snare, { baseSeed: 410, wrap: WRAP, gain: 0.55 });
  placeHits(mix, everyBar([0.5, 1.5, 2.5, 3.5], 16, 24), BPM, tick, {
    baseSeed: 420,
    wrap: WRAP,
    gain: 0.7,
    pan: 0.15,
  });
  layBassPattern(mix, 16, 24, 430);
  placeNotes(
    mix,
    LEAD_MELODY.map((e) => ({ ...e, beat: e.beat + 64 })),
    BPM,
    nightLead,
    { baseSeed: 440, wrap: WRAP, durScale: 1.15 },
  );

  // — D fazı: çözülme — motif yankıları + seyrek tik, loop'a köprü —
  addVoice(mix, subDrop(500), 96 * beat, { wrap: WRAP, gain: 0.7 });
  placeNotes(
    mix,
    MOTIF_M1.map((e) => ({ ...e, beat: e.beat + 96, gain: 0.6 })),
    BPM,
    glassKey,
    { baseSeed: 510, wrap: WRAP, durScale: 1.8, pan: -0.1 },
  );
  placeHits(mix, everyBar([1.5, 3.5], 24, 30), BPM, tick, {
    baseSeed: 520,
    wrap: WRAP,
    gain: 0.45,
    pan: -0.15,
  });

  // — Dikişler: C fazına giren impact, loop'a dönen riser —
  addVoice(mix, deepImpact(600), 64 * beat - 0.012, { wrap: WRAP, gain: 0.8 });
  addVoice(mix, tonalRiser(8 * beat, hz('D2'), 610), 120 * beat, { wrap: WRAP, gain: 0.8 });

  masterize(mix, { peakTarget: 0.9, rmsTargetDb: -17 });
  edgeGuard(mix, 4);
  return mix;
}

/** Hollow Signal track tanımı. */
export const hollowSignal: TrackDef = {
  id: 'hollow-signal',
  file: 'main-menu/hollow-signal.ogg',
  bpm: BPM,
  beats: BEATS,
  loop: true,
  rmsTargetDb: -17,
  build,
};
