/**
 * Ana menü teması 2 — "Black Tide"
 *
 * Karakter: **HAREKET.** Çalışan tesis / korozyon. Orta register hâkim,
 * sürekli mekanik ritim var. Üç menü temasının en "meşgul" olanı.
 *
 * Kimlik ayrımı (Iron Vein ve Crimson Horizon ile karışmaması için):
 * - Register: enerji orta bantta toplanır; sub kasıtlı olarak Iron Vein'in
 *   belirgin altında — bu tema ağırlık değil hareket anlatır.
 * - Ritim: konveyör takırtısı 2 beat'te bir, röle tıkırtısı her beat.
 *   Sürekli ama monoton olmayan bir mekanik nabız.
 * - Armoni: dört akor, 16 beat'te bir değişir. Süspansiyon ağırlıklı —
 *   çözülmeyen, huzursuz bir renk.
 * - Palet: conveyorRattle + pressureHiss + cableTension + filteredPulse.
 *   Ağır yapısal darbe (deepImpact) yalnızca akor başlarında.
 *
 * Loop: 64 beat @ 74 BPM.
 */

import {
  createMix,
  createBeatClock,
  addVoice,
  applyEdgeGuard,
  masterChain,
  chordFreqs,
  chordAtBeat,
  parseWavOggArgs,
  writeTrack,
  type ChordDef,
} from './audio-mix';
import {
  reactorHum,
  subThrob,
  atmosphereBed,
  coldPad,
  deepImpact,
  metalClank,
  machineTick,
  pressureHiss,
  conveyorRattle,
  cableTension,
  filteredPulse,
} from './industrial-voices';

const { wavPath, oggPath } = parseWavOggArgs('generate-black-tide.ts');

// --- Zaman ---

const BPM = 74;
const LOOP_BEATS = 64;
const clock = createBeatClock(BPM);
const DURATION = LOOP_BEATS * clock.beatDuration;

// --- Perde paleti (A kökü, süspansiyon ağırlıklı) ---

const A1 = 55.0;
const A2 = 110.0;
const C3 = 130.81;
const D3 = 146.83;
const E3 = 164.81;
const G3 = 196.0;
const A3 = 220.0;
const F2 = 87.31;
const C2 = 65.41;
const G2 = 98.0;

/** Dört akor, 16 beat'te bir — Iron Vein'in iki akorlu durgunluğunun tersi. */
const CHORDS: ChordDef[] = [
  { root: A2, type: 'sus2' },
  { root: F2, type: 'fifth' },
  { root: C2, type: 'sus4' },
  { root: G2, type: 'fifth' },
];
const CHORD_BEATS = 16;

const mix = createMix(DURATION);

// --- Katman 1: sub yatak ---
// Iron Vein'den belirgin düşük: bu tema ağırlıkla değil hareketle anlatıyor.
addVoice(mix, subThrob(A1, DURATION, 0.13, 0, 201), 0);

// --- Katman 2: reaktör uğultusu ---
addVoice(mix, reactorHum(A2, DURATION, 0.12, -0.3, 202), 0);

// --- Katman 3: atmosfer yatağı ---
// Iron Vein'den parlak: orta-üst bant hareketi taşıyor.
for (const voice of atmosphereBed(DURATION, { level: 0.95, brightness: 1.2, seedBase: 204 })) {
  addVoice(mix, voice, 0);
}

// --- Katman 4: soğuk pad (akor dokusu, 16 beat'te bir) ---
for (let beat = 0; beat < LOOP_BEATS; beat += CHORD_BEATS) {
  const chord = chordAtBeat(CHORDS, beat, CHORD_BEATS);
  const tones = chordFreqs(chord);
  const padDuration = CHORD_BEATS * clock.beatDuration + 2.2;
  const offset = clock.toSample(beat);

  tones.forEach((freq, i) => {
    // Süspansiyon sesi (ikinci ton) kenara atılır: merkezde kalırsa akor
    // fazla "tonal" duyuluyor, kenarda huzursuzluk hissi korunuyor.
    const pan = i === 0 ? -0.1 : i === 1 ? 0.45 : -0.4;
    const gain = i === 0 ? 0.13 : 0.085;
    addVoice(mix, coldPad(freq, padDuration, gain, pan, 210 + beat + i), offset);
  });
}

// --- Katman 5: konveyör ritmi (2 beat'te bir, tüm parça) ---
// Bu temanın imzası. Sürekli çalışan bir bant; frekans hafifçe değişerek
// monotonluğu kırıyor.
for (let beat = 0; beat < LOOP_BEATS; beat += 2) {
  const offset = clock.toSample(beat) + clock.humanize(beat, 1, 7);
  const freq = beat % 8 === 0 ? 300 : beat % 8 === 4 ? 360 : 330;
  const pan = (beat / 2) % 2 === 0 ? -0.35 : 0.35;
  addVoice(mix, conveyorRattle(freq, 0.14, pan, 220 + beat), offset);
}

// --- Katman 6: röle tıkırtısı (her beat, beat 8'den sonra) ---
// Konveyörün arasını dolduran ince grid. Vurgu her 4. beat'te güçlenir.
for (let beat = 8; beat < LOOP_BEATS; beat++) {
  const offset = clock.toSample(beat) + clock.humanize(beat, 2, 9);
  const accent = beat % 4 === 0;
  addVoice(
    mix,
    machineTick(
      accent ? 1500 : 1150,
      accent ? 0.13 : 0.075,
      beat % 2 === 0 ? -0.28 : 0.3,
      230 + beat,
    ),
    offset,
  );
}

// --- Katman 7: yapısal darbe (akor başlarında) ---
// Seyrek ve yalnızca akor değişiminde: ritmi taşımıyor, yapıyı işaretliyor.
for (let beat = 0; beat < LOOP_BEATS; beat += CHORD_BEATS) {
  const offset = clock.toSample(beat) + clock.humanize(beat, 3, 4);
  addVoice(mix, deepImpact(A1 * 1.5, 0.3, 0, 240 + beat), offset);
}

// --- Katman 8: basınç boşalması (8 beat'te bir, ofsetli) ---
// Ritmik gride nefes katar. Konveyörle aynı ana düşmemesi için 3 beat kaydı.
for (let beat = 11; beat < LOOP_BEATS; beat += 8) {
  const offset = clock.toSample(beat) + clock.humanize(beat, 4, 8);
  addVoice(mix, pressureHiss(0.17, beat % 16 === 3 ? 0.45 : -0.45, 250 + beat, 2800), offset);
}

// --- Katman 9: mekanik bas ostinato (beat 16-56) ---
// Akor köküne kilitli, 8'lik nabız. Parçanın "yürüyen" hissini bu kurar.
for (let beat = 16; beat < 56; beat += 1) {
  if (beat % 2 === 1) continue; // yalnızca çift beat'ler — çok kalabalık olmasın
  const chord = chordAtBeat(CHORDS, beat, CHORD_BEATS);
  const offset = clock.toSample(beat) + clock.humanize(beat, 5, 5);
  addVoice(mix, filteredPulse(chord.root, clock.beatDuration * 1.3, 0.16, 0, 260 + beat), offset);
}

// --- Katman 10: gerilmiş kablo motifi (beat 24'ten sonra) ---
// Melodi değil, tekrarlayan kısa figür — Mindustry'de motif hipnotiktir.
const CABLE_FIGURE = [A3, E3, G3, D3, C3, E3];
for (let i = 0; i < CABLE_FIGURE.length; i++) {
  const beat = 24 + i * 5;
  if (beat >= LOOP_BEATS) break;
  const offset = clock.toSample(beat) + clock.humanize(beat, 6, 6);
  addVoice(
    mix,
    cableTension(
      CABLE_FIGURE[i]!,
      clock.beatDuration * 3,
      0.85,
      i % 2 === 0 ? -0.32 : 0.34,
      500 + i,
    ),
    offset,
  );
}

// --- Katman 11: metal vurgu (32 beat'te bir) ---
for (let beat = 30; beat < LOOP_BEATS; beat += 32) {
  const offset = clock.toSample(beat) + clock.humanize(beat, 7, 6);
  addVoice(mix, metalClank(A3 * 1.5, 0.26, 0.4, 270 + beat), offset);
}

// --- Master ---
applyEdgeGuard(mix, 14);
const result = masterChain(mix, { targetRmsDb: -17, peakCeiling: 0.92, drive: 1.2 });

writeTrack(wavPath, oggPath, result);
