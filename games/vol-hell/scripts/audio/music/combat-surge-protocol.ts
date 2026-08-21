/**
 * SURGE PROTOCOL — Savaş müziği.
 *
 * E minör, 132 BPM, 4/4, 32 bar (128 vuruş, ~58.2 s), dikişsiz loop.
 * Karakter: baskı — düşman yoğunlaştığında ambiyansın üstüne crossfade ile
 * girer. Dört-dörtlük kick sürükler, bas ostinatosu hiç susmaz; melodik yük
 * bilinçli olarak hafiftir ki oyun SFX'i (200-3000 Hz) maskelenmesin.
 *
 * Form (8'er barlık dört faz):
 *   A  (bar 0-7)   giriş    — kick + bas ostinato + tik
 *   B  (bar 8-15)  baskı    — + snare backbeat + stab vuruşları
 *   C  (bar 16-23) doruk    — + riff (kısa, tekrarlı, koyu)
 *   D  (bar 24-31) nefes    — riff düşer, groove yalın döner, riser loop'lar
 *
 * Armoni (1 bar / akor): Em — Em — C — D, son turda D yerine B gerilimi.
 */

import { MUSIC_TIMING } from '@/config/musicTiming';
import { createMix, addVoice, masterize, edgeGuard } from '../lib/mix';
import type { StereoMix } from '../lib/mix';
import { beatSec, hz } from '../lib/theory';
import type { NoteEvent } from '../lib/theory';
import { placeNotes, placeHits, everyBar } from '../lib/track';
import type { TrackDef } from '../lib/track';
import { kick, heavyKick, snare, tick } from '../palette/percussion';
import { pulseBass, subBass } from '../palette/bass';
import { tensionPad } from '../palette/pads';
import { darkStab, voidPluck } from '../palette/keys';
import { tonalRiser, deepImpact } from '../palette/fx';

/**
 * Tempo ve uzunluk `src/config/musicTiming.ts`ten gelir — çalma
 * config'iyle aynı kaynak. Buraya sayı yazmak, `loopEnd` ile bestenin
 * sessizce ayrışmasına yol açardı (bkz. o dosyanın başındaki not).
 */
const { bpm: BPM, beats: BEATS } = MUSIC_TIMING['surge-protocol'];

const WRAP = true;

/** 1 bar / akor; 4 barlık döngü. `stab` akoru vurgu katmanı içindir. */
const CHORDS: Array<{ root: string; stab: string[] }> = [
  { root: 'E1', stab: ['E3', 'G3', 'B3'] },
  { root: 'E1', stab: ['E3', 'G3', 'B3'] },
  { root: 'C2', stab: ['C3', 'E3', 'G3'] },
  { root: 'D2', stab: ['D3', 'F#3', 'A3'] },
];

/** C fazı riff'i — 2 barlık koyu hücre, 4 kez tekrarlanır (varyasyonlu). */
const RIFF_CELL: NoteEvent[] = [
  { note: 'E3', beat: 0, dur: 0.5 },
  { note: 'G3', beat: 0.75, dur: 0.5 },
  { note: 'E3', beat: 1.5, dur: 0.5 },
  { note: 'B3', beat: 2.5, dur: 0.75 },
  { note: 'A3', beat: 3.25, dur: 0.5 },
  { note: 'G3', beat: 4, dur: 0.5 },
  { note: 'F#3', beat: 5, dur: 0.5 },
  { note: 'E3', beat: 6, dur: 1.5 },
];

/** Bas ostinato — 8'liklerde kök, "and" vuruşları oktav yukarı sıçrar. */
function layOstinato(mix: StereoMix, fromBar: number, toBar: number, seed: number, gain = 1): void {
  const beat = beatSec(BPM);
  for (let bar = fromBar; bar < toBar; bar++) {
    const chord = CHORDS[bar % CHORDS.length];
    if (!chord) continue;
    const root = hz(chord.root) * 2;
    for (let eighth = 0; eighth < 8; eighth++) {
      const lifted = eighth % 2 === 1;
      addVoice(
        mix,
        pulseBass(lifted ? root * 2 : root, 0.24, seed + bar * 8 + eighth),
        (bar * 4 + eighth * 0.5) * beat,
        { wrap: WRAP, gain: gain * (lifted ? 0.6 : 1) },
      );
    }
  }
}

/** Stab katmanı — bar-yerel 1.5 ve 3.5 offbeat'lerinde akor vuruşu. */
function layStabs(mix: StereoMix, fromBar: number, toBar: number, seed: number): void {
  const beat = beatSec(BPM);
  for (let bar = fromBar; bar < toBar; bar++) {
    const chord = CHORDS[bar % CHORDS.length];
    if (!chord) continue;
    for (const [i, offset] of [1.5, 3.5].entries()) {
      chord.stab.forEach((note, j) => {
        addVoice(
          mix,
          darkStab(hz(note), 0.3, seed + bar * 9 + i * 3 + j),
          (bar * 4 + offset) * beat,
          { wrap: WRAP, gain: 0.75, pan: j === 0 ? -0.15 : j === 2 ? 0.15 : 0 },
        );
      });
    }
  }
}

function build(): StereoMix {
  const mix = createMix((BEATS * 60) / BPM);
  const beat = beatSec(BPM);

  // — Zemin: gerilim pad'i yalnızca kök+5'lik, alçak kazançta (SFX bandına saygı) —
  for (let bar = 0; bar < 32; bar += 4) {
    const chord = CHORDS[bar % CHORDS.length];
    if (!chord) continue;
    addVoice(mix, tensionPad(hz(chord.root) * 4, 16 * beat, 100 + bar), bar * 4 * beat, {
      wrap: WRAP,
      gain: 0.7,
    });
    addVoice(mix, subBass(hz(chord.root), 16 * beat, 110 + bar), bar * 4 * beat, {
      wrap: WRAP,
      gain: 0.65,
    });
  }

  // — Ritim çekirdeği: dört-dörtlük kick (A-C fazları), tik 8'likleri —
  placeHits(mix, everyBar([0, 1, 2, 3], 0, 24), BPM, kick, { baseSeed: 200, wrap: WRAP });
  placeHits(mix, everyBar([0, 2], 24, 32), BPM, kick, { baseSeed: 210, wrap: WRAP, gain: 0.85 });
  placeHits(mix, everyBar([0.5, 1.5, 2.5, 3.5], 0, 32), BPM, tick, {
    baseSeed: 220,
    wrap: WRAP,
    gain: 0.55,
    pan: 0.14,
  });

  // — Bas ostinato: tüm parça, D fazında nefes için hafifler —
  layOstinato(mix, 0, 24, 300);
  layOstinato(mix, 24, 32, 310, 0.75);

  // — B fazından itibaren: snare backbeat + stab —
  placeHits(mix, everyBar([1, 3], 8, 24), BPM, snare, { baseSeed: 400, wrap: WRAP, gain: 0.6 });
  layStabs(mix, 8, 16, 410);
  layStabs(mix, 16, 24, 420);

  // — C fazı: riff — 2 barlık hücre 4 tekrar; ağır kick vurgusu bar başlarında —
  for (let rep = 0; rep < 4; rep++) {
    placeNotes(
      mix,
      RIFF_CELL.map((e) => ({ ...e, beat: e.beat + (16 + rep * 2) * 4 })),
      BPM,
      voidPluck,
      { baseSeed: 500 + rep * 20, wrap: WRAP, durScale: 1.3, gain: rep === 3 ? 0.85 : 1 },
    );
  }
  placeHits(mix, everyBar([0], 16, 24), BPM, heavyKick, { baseSeed: 520, wrap: WRAP, gain: 0.5 });

  // — Dikişler: doruk impact'i + loop'a dönen riser —
  addVoice(mix, deepImpact(600), 64 * beat - 0.012, { wrap: WRAP, gain: 0.85 });
  addVoice(mix, tonalRiser(6 * beat, hz('E2'), 610), 122 * beat, { wrap: WRAP, gain: 0.8 });

  masterize(mix, { peakTarget: 0.9, rmsTargetDb: -15.5 });
  edgeGuard(mix, 4);
  return mix;
}

/** Surge Protocol track tanımı. */
export const surgeProtocol: TrackDef = {
  id: 'surge-protocol',
  file: 'combat/surge-protocol.ogg',
  bpm: BPM,
  beats: BEATS,
  loop: true,
  rmsTargetDb: -15.5,
  build,
};
