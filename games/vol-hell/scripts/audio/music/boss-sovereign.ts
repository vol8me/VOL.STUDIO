/**
 * SOVEREIGN — Boss müziği.
 *
 * C minör (frigyen Db gerilimi), 140 BPM, 4/4, 32 bar (128 vuruş, ~54.9 s),
 * dikişsiz loop. Karakter: hüküm — 20. dalganın efendisi sahnededir.
 * Savaş parçasından ayrışma: dörtlük sürüş yerine senkoplu ağır kick,
 * gallop bas ve yarım ton (C-Db) armonik baskı.
 *
 * Form (8'er barlık dört faz):
 *   A  (bar 0-7)   hüküm    — ağır kick + gallop bas + pad
 *   B  (bar 8-15)  tehdit   — + stab kümeleri + tehditkar motif
 *   C  (bar 16-23) kuşatma  — ritim seyrelir, tom + motif yankısı (sahte nefes)
 *   D  (bar 24-31) infaz    — tam yük + riser, loop başa saldırıyla döner
 *
 * Armoni (1 bar / akor): Cm — Db — Cm — G.
 */

import { createMix, addVoice, masterize, edgeGuard } from '../lib/mix';
import type { StereoMix } from '../lib/mix';
import { beatSec, hz } from '../lib/theory';
import type { NoteEvent } from '../lib/theory';
import { placeNotes, placeHits, everyBar } from '../lib/track';
import type { TrackDef } from '../lib/track';
import { heavyKick, snare, tick, lowTom } from '../palette/percussion';
import { growlBass, subBass } from '../palette/bass';
import { tensionPad } from '../palette/pads';
import { darkStab, nightLead } from '../palette/keys';
import { tonalRiser, deepImpact, subDrop } from '../palette/fx';

const BPM = 140;
const BEATS = 128;
const WRAP = true;

/** 1 bar / akor; Db barı frigyen baskıyı taşır. */
const CHORDS: Array<{ root: string; stab: string[] }> = [
  { root: 'C2', stab: ['C3', 'Eb3', 'G3'] },
  { root: 'Db2', stab: ['Db3', 'F3', 'Ab3'] },
  { root: 'C2', stab: ['C3', 'Eb3', 'G3'] },
  { root: 'G1', stab: ['G2', 'B2', 'D3'] },
];

/** Tehditkar motif — B/D fazlarında lead; dar aralıkta döner, çözülmez. */
const THREAT_MOTIF: NoteEvent[] = [
  { note: 'G4', beat: 0, dur: 3 },
  { note: 'Ab4', beat: 4, dur: 3 },
  { note: 'G4', beat: 8, dur: 2 },
  { note: 'F4', beat: 10, dur: 2 },
  { note: 'Eb4', beat: 12, dur: 3.5 },
  { note: 'G4', beat: 16, dur: 3 },
  { note: 'Ab4', beat: 20, dur: 3 },
  { note: 'B3', beat: 24, dur: 3 },
  { note: 'C4', beat: 28, dur: 3.5 },
];

/** Gallop bas — bar-yerel 0, 0.75, 1.5, 2, 2.75, 3.5 deseninde hırıltı. */
function layGallop(mix: StereoMix, fromBar: number, toBar: number, seed: number, gain = 1): void {
  const beat = beatSec(BPM);
  const pattern = [0, 0.75, 1.5, 2, 2.75, 3.5];
  for (let bar = fromBar; bar < toBar; bar++) {
    const chord = CHORDS[bar % CHORDS.length];
    if (!chord) continue;
    const root = hz(chord.root) * 2;
    pattern.forEach((offset, i) => {
      addVoice(
        mix,
        growlBass(root, 0.26, seed + bar * 6 + i),
        (bar * 4 + offset) * beat,
        // Desenin ilk vuruşu tam, senkoplar hafif geride
        { wrap: WRAP, gain: gain * (i === 0 ? 1 : 0.78) },
      );
    });
  }
}

/** Stab kümeleri — bar-yerel 3.5'te üç sesli küme; tehdit vurgusu. */
function layStabClusters(mix: StereoMix, fromBar: number, toBar: number, seed: number): void {
  const beat = beatSec(BPM);
  for (let bar = fromBar; bar < toBar; bar++) {
    const chord = CHORDS[bar % CHORDS.length];
    if (!chord) continue;
    chord.stab.forEach((note, j) => {
      addVoice(mix, darkStab(hz(note), 0.26, seed + bar * 3 + j), (bar * 4 + 3.5) * beat, {
        wrap: WRAP,
        gain: 0.8,
        pan: j === 0 ? -0.2 : j === 2 ? 0.2 : 0,
      });
    });
  }
}

function build(): StereoMix {
  const mix = createMix((BEATS * 60) / BPM);
  const beat = beatSec(BPM);

  // — Zemin: pad + sub, tüm parça (C fazında tek başına kalır) —
  for (let bar = 0; bar < 32; bar += 2) {
    const chord = CHORDS[bar % CHORDS.length];
    if (!chord) continue;
    addVoice(mix, tensionPad(hz(chord.root) * 4, 8 * beat, 100 + bar), bar * 4 * beat, {
      wrap: WRAP,
      gain: 0.85,
    });
    addVoice(mix, subBass(hz(chord.root), 8 * beat, 110 + bar), bar * 4 * beat, {
      wrap: WRAP,
      gain: 0.7,
    });
  }

  // — Ritim: senkoplu ağır kick (A, B, D), backbeat snare (B, D) —
  placeHits(mix, everyBar([0, 1.5, 2.5], 0, 16), BPM, heavyKick, { baseSeed: 200, wrap: WRAP });
  placeHits(mix, everyBar([0, 1.5, 2.5], 24, 32), BPM, heavyKick, {
    baseSeed: 210,
    wrap: WRAP,
    gain: 1.05,
  });
  placeHits(mix, everyBar([1, 3], 8, 16), BPM, snare, { baseSeed: 220, wrap: WRAP, gain: 0.6 });
  placeHits(mix, everyBar([1, 3], 24, 32), BPM, snare, { baseSeed: 230, wrap: WRAP, gain: 0.7 });
  placeHits(mix, everyBar([0.5, 1.5, 2.5, 3.5], 8, 16), BPM, tick, {
    baseSeed: 240,
    wrap: WRAP,
    gain: 0.5,
    pan: -0.12,
  });
  placeHits(mix, everyBar([0.5, 1.5, 2.5, 3.5], 24, 32), BPM, tick, {
    baseSeed: 250,
    wrap: WRAP,
    gain: 0.6,
    pan: 0.12,
  });

  // — Gallop bas: A, B ve D fazları; C fazında susar (sahte nefes) —
  layGallop(mix, 0, 16, 300);
  layGallop(mix, 24, 32, 310, 1.1);

  // — B fazı: stab kümeleri + tehdit motifi —
  layStabClusters(mix, 8, 16, 400);
  placeNotes(
    mix,
    THREAT_MOTIF.map((e) => ({ ...e, beat: e.beat + 32 })),
    BPM,
    nightLead,
    { baseSeed: 410, wrap: WRAP, durScale: 1.1, gain: 0.9 },
  );

  // — C fazı: kuşatma — tom yürüyüşü + motif yankısı, ritim çekirdeği yok —
  placeHits(mix, everyBar([0, 2, 3], 16, 24), BPM, (seed) => lowTom(hz('C2') * 2, seed), {
    baseSeed: 510,
    wrap: WRAP,
    gain: 0.7,
  });
  placeNotes(
    mix,
    [
      { note: 'C4', beat: 66, dur: 3 },
      { note: 'Db4', beat: 72, dur: 3 },
      { note: 'C4', beat: 78, dur: 2 },
      { note: 'G3', beat: 84, dur: 4 },
    ],
    BPM,
    nightLead,
    { baseSeed: 520, wrap: WRAP, durScale: 1.2, gain: 0.7, pan: -0.1 },
  );

  // — D fazı: infaz — stab + motif geri döner —
  layStabClusters(mix, 24, 32, 600);
  placeNotes(
    mix,
    THREAT_MOTIF.map((e) => ({ ...e, beat: e.beat + 96, gain: 1.05 })),
    BPM,
    nightLead,
    { baseSeed: 610, wrap: WRAP, durScale: 1.1 },
  );

  // — Dikişler —
  addVoice(mix, deepImpact(700), 0.002, { wrap: WRAP, gain: 0.9 });
  addVoice(mix, subDrop(710), 64 * beat, { wrap: WRAP, gain: 0.7 });
  addVoice(mix, tonalRiser(8 * beat, hz('C2'), 720), 88 * beat, { wrap: WRAP, gain: 0.85 });
  addVoice(mix, tonalRiser(6 * beat, hz('G1'), 730), 122 * beat, { wrap: WRAP, gain: 0.8 });

  masterize(mix, { peakTarget: 0.9, rmsTargetDb: -15 });
  edgeGuard(mix, 4);
  return mix;
}

/** Sovereign track tanımı. */
export const sovereign: TrackDef = {
  id: 'sovereign',
  file: 'boss/sovereign.ogg',
  bpm: BPM,
  beats: BEATS,
  loop: true,
  rmsTargetDb: -15,
  build,
};
