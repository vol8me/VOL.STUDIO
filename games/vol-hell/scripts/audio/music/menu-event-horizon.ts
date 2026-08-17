/**
 * EVENT HORIZON — Ana menü 2.
 *
 * A minör (frigyen renkli, Bb basamağı), 100 BPM, 4/4, 32 bar (128 vuruş,
 * ~76.8 s), dikişsiz loop. Karakter: hareket — olay ufkuna doğru sabit,
 * durdurulamaz bir sürüklenme. Hollow Signal'ın ağırlığına karşı bu parça
 * nabız üzerine kuruludur: bas 8'likleri hiç durmaz, enerji katman katman
 * ritmin üstüne biner.
 *
 * Form (8'er barlık dört faz):
 *   A  (bar 0-7)   nabız     — sürekli bas 8'likleri + pad, ritim yok
 *   B  (bar 8-15)  yürüyüş   — senkoplu kick + tik, pluck vurguları
 *   C  (bar 16-23) doruk     — arpej + lead uzun notaları, tam ritim
 *   D  (bar 24-31) boşluk    — ritim düşer, nabız yalnız kalır, riser loop'a bağlar
 *
 * Armoni (1 bar / akor, 4 barlık döngü): Am — Bb — Am — G.
 */

import { createMix, addVoice, masterize, edgeGuard } from '../lib/mix';
import type { StereoMix } from '../lib/mix';
import { beatSec, hz } from '../lib/theory';
import type { NoteEvent } from '../lib/theory';
import { placeNotes, placeHits, everyBar } from '../lib/track';
import type { TrackDef } from '../lib/track';
import { kick, snare, tick, openTick } from '../palette/percussion';
import { subBass, pulseBass } from '../palette/bass';
import { tensionPad } from '../palette/pads';
import { voidPluck, nightLead } from '../palette/keys';
import { tonalRiser, subDrop, deepImpact } from '../palette/fx';

const BPM = 100;
const BEATS = 128;
const WRAP = true;

/** 1 bar / akor, 4 barlık döngü. */
const CHORDS: Array<{ root: string; pad: string[]; arp: string[] }> = [
  { root: 'A1', pad: ['A2', 'E3'], arp: ['A2', 'C3', 'E3', 'A3'] },
  { root: 'Bb1', pad: ['Bb2', 'F3'], arp: ['Bb2', 'D3', 'F3', 'Bb3'] },
  { root: 'A1', pad: ['A2', 'C3'], arp: ['A2', 'C3', 'E3', 'C4'] },
  { root: 'G1', pad: ['G2', 'D3'], arp: ['G2', 'B2', 'D3', 'G3'] },
];

/** B fazı pluck vurguları (faz-yerel vuruşlar) — senkopu çizer. */
const PLUCK_ACCENTS: NoteEvent[] = [
  { note: 'A3', beat: 1.5, dur: 0.75 },
  { note: 'E3', beat: 3.5, dur: 0.75 },
  { note: 'F3', beat: 5.5, dur: 0.75 },
  { note: 'D3', beat: 7.5, dur: 0.75 },
  { note: 'A3', beat: 9.5, dur: 0.75 },
  { note: 'C4', beat: 11.5, dur: 0.75 },
  { note: 'B3', beat: 13.5, dur: 0.75 },
  { note: 'G3', beat: 15.5, dur: 0.75 },
];

/** C fazı lead hattı — uzun notalarla inen frigyen çizgi. */
const LEAD_LINE: NoteEvent[] = [
  { note: 'E4', beat: 0, dur: 6 },
  { note: 'D4', beat: 8, dur: 6 },
  { note: 'C4', beat: 16, dur: 4 },
  { note: 'Bb3', beat: 20, dur: 4 },
  { note: 'A3', beat: 24, dur: 7 },
];

/** Kesintisiz bas nabzı — her 8'likte kök, bar sonunda oktav sıçrama. */
function layPulse(mix: StereoMix, fromBar: number, toBar: number, seed: number, gain = 1): void {
  const beat = beatSec(BPM);
  for (let bar = fromBar; bar < toBar; bar++) {
    const chord = CHORDS[bar % CHORDS.length];
    if (!chord) continue;
    const root = hz(chord.root) * 2;
    for (let eighth = 0; eighth < 8; eighth++) {
      const isLift = eighth === 7; // bar kapanışında oktav yukarı nefes
      addVoice(
        mix,
        pulseBass(isLift ? root * 2 : root, 0.3, seed + bar * 8 + eighth),
        (bar * 4 + eighth * 0.5) * beat,
        { wrap: WRAP, gain: gain * (eighth % 2 === 0 ? 1 : 0.72) },
      );
    }
  }
}

/** Pad zemini — her barda iki sesli gerilim pad'i. */
function layPads(mix: StereoMix, fromBar: number, toBar: number, seed: number): void {
  const beat = beatSec(BPM);
  for (let bar = fromBar; bar < toBar; bar += 2) {
    const chord = CHORDS[bar % CHORDS.length];
    if (!chord) continue;
    const dur = 8 * beat;
    chord.pad.forEach((note, i) => {
      addVoice(mix, tensionPad(hz(note), dur, seed + bar * 5 + i), bar * 4 * beat, {
        wrap: WRAP,
        pan: i === 0 ? -0.18 : 0.18,
      });
    });
  }
}

/** C fazı arpeji — akor tonlarında yükselen 8'likler. */
function layArp(mix: StereoMix, fromBar: number, toBar: number, seed: number): void {
  const beat = beatSec(BPM);
  const flow = [0, 1, 2, 3, 2, 1]; // yukarı-aşağı akış; son çeyrek nefes bırakır
  for (let bar = fromBar; bar < toBar; bar++) {
    const chord = CHORDS[bar % CHORDS.length];
    if (!chord) continue;
    flow.forEach((step, i) => {
      const target = chord.arp[step] ?? chord.arp[0] ?? 'A3';
      addVoice(mix, voidPluck(hz(target), 0.32, seed + bar * 6 + i), (bar * 4 + i * 0.5) * beat, {
        wrap: WRAP,
        gain: i === 0 ? 0.8 : 0.65,
        pan: i % 2 === 0 ? 0.22 : -0.22,
      });
    });
  }
}

function build(): StereoMix {
  const mix = createMix((BEATS * 60) / BPM);
  const beat = beatSec(BPM);

  // — Zemin: pad her fazda, sub bas her akor kökünde (2 bar nefesli) —
  layPads(mix, 0, 32, 100);
  for (let bar = 0; bar < 32; bar += 2) {
    const chord = CHORDS[bar % CHORDS.length];
    if (!chord) continue;
    addVoice(mix, subBass(hz(chord.root), 8 * beat, 120 + bar), bar * 4 * beat, {
      wrap: WRAP,
      gain: 0.75,
    });
  }

  // — A fazı: yalnız nabız (giriş kimliği) —
  layPulse(mix, 0, 8, 200, 0.85);

  // — B fazı: nabız + senkoplu ritim + pluck vurguları —
  layPulse(mix, 8, 16, 210);
  placeHits(mix, everyBar([0, 1.75, 2.5], 8, 16), BPM, kick, {
    baseSeed: 220,
    wrap: WRAP,
    gain: 0.7,
  });
  placeHits(mix, everyBar([1, 3], 8, 16), BPM, tick, {
    baseSeed: 230,
    wrap: WRAP,
    gain: 0.6,
    pan: 0.12,
  });
  placeNotes(
    mix,
    PLUCK_ACCENTS.map((e) => ({ ...e, beat: e.beat + 32 })),
    BPM,
    voidPluck,
    { baseSeed: 240, wrap: WRAP, durScale: 1.4, pan: -0.15 },
  );

  // — C fazı: doruk — tam ritim + arpej + lead —
  layPulse(mix, 16, 24, 250);
  placeHits(mix, everyBar([0, 1.75, 2.5], 16, 24), BPM, kick, {
    baseSeed: 260,
    wrap: WRAP,
    gain: 0.8,
  });
  placeHits(mix, everyBar([2], 16, 24), BPM, snare, { baseSeed: 270, wrap: WRAP, gain: 0.5 });
  placeHits(mix, everyBar([0.5, 1.5, 2.5, 3.5], 16, 24), BPM, openTick, {
    baseSeed: 280,
    wrap: WRAP,
    gain: 0.55,
    pan: -0.12,
  });
  layArp(mix, 16, 24, 290);
  placeNotes(
    mix,
    LEAD_LINE.map((e) => ({ ...e, beat: e.beat + 64 })),
    BPM,
    nightLead,
    { baseSeed: 300, wrap: WRAP, durScale: 1.05 },
  );

  // — D fazı: boşluk — nabız yalnız, seyrek pluck yankısı —
  layPulse(mix, 24, 32, 310, 0.7);
  placeNotes(
    mix,
    [
      { note: 'A3', beat: 98, dur: 1 },
      { note: 'E3', beat: 104, dur: 1 },
      { note: 'C4', beat: 110, dur: 1 },
      { note: 'Bb3', beat: 116, dur: 1.5 },
    ],
    BPM,
    voidPluck,
    { baseSeed: 320, wrap: WRAP, durScale: 2, gain: 0.6, pan: 0.2 },
  );

  // — Dikişler: doruğa impact, çözülmeye sub düşüşü, loop'a riser —
  addVoice(mix, deepImpact(400), 64 * beat - 0.012, { wrap: WRAP, gain: 0.75 });
  addVoice(mix, subDrop(410), 96 * beat, { wrap: WRAP, gain: 0.65 });
  addVoice(mix, tonalRiser(6 * beat, hz('A1'), 420), 122 * beat, { wrap: WRAP, gain: 0.75 });

  masterize(mix, { peakTarget: 0.9, rmsTargetDb: -17 });
  edgeGuard(mix, 4);
  return mix;
}

/** Event Horizon track tanımı. */
export const eventHorizon: TrackDef = {
  id: 'event-horizon',
  file: 'main-menu/event-horizon.ogg',
  bpm: BPM,
  beats: BEATS,
  loop: true,
  rmsTargetDb: -17,
  build,
};
