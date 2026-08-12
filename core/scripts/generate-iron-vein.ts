/**
 * Ana menü teması 1 — "Iron Vein"
 *
 * Karakter: **AĞIRLIK.** Derin maden / kazı. Alt register hâkim, tempo çok
 * yavaş, olaylar seyrek. Üç menü temasının en boğuk ve en ağır olanı.
 *
 * Kimlik ayrımı (diğer iki tema ile karışmaması için bilinçli seçimler):
 * - Register: enerji 30-300 Hz arasında toplanır; üst bant yalnızca gürültü
 *   yatağıyla doldurulur, parlak vurgu (glassPing) hiç kullanılmaz.
 * - Ritim: yapısal darbe 8 beat'te bir — nefes alacak kadar seyrek.
 * - Armoni: iki akor, 32 beat'te bir değişir. Hipnotik durgunluk kasıtlı.
 * - Palet: reactorHum + subThrob + deepImpact + metalClank. Hava/cam yok.
 *
 * Loop: 64 beat. Yataklar tüm uzunluk boyunca sürer, uçlarda yalnızca
 * milisaniyelik koruma rampası var — loop sınırında boşluk duyulmaz.
 */

import {
  createMix,
  createBeatClock,
  addVoice,
  applyEdgeGuard,
  masterChain,
  chordFreqs,
  parseOggArg,
  writeTrack,
  type ChordDef,
} from './audio-mix';
import { generateProgressionFromPool } from './composition/harmony';
import { generateArrangement } from './composition/arrangement';
import {
  reactorHum,
  subThrob,
  atmosphereBed,
  coldPad,
  deepImpact,
  metalClank,
  machineTick,
  signalTone,
  filteredPulse,
} from './industrial-voices';

const oggPath = parseOggArg('generate-iron-vein.ts');

// --- Zaman ---

const BPM = 62;
const LOOP_BEATS = 64;
const clock = createBeatClock(BPM);
const DURATION = LOOP_BEATS * clock.beatDuration;

// --- Perde paleti (D kökü, boş beşli ağırlıklı) ---

const D1 = 36.71;
const D2 = 73.42;
const A2 = 110.0;
const D3 = 146.83;
const F3 = 174.61;
const A3 = 220.0;
const Bb1 = 29.14;
const Bb2 = 58.27;

/** İki akor, 32 beat'te bir değişir — durgunluk kasıtlı. */
const CHORD_POOL: ChordDef[] = [
  { root: D2, type: 'fifth' },
  { root: Bb2, type: 'fifth' },
];
const CHORDS: ChordDef[] = generateProgressionFromPool(CHORD_POOL, 2, 0, 0, 1);
const CHORD_BEATS = 32;

/** Belirtilen beat'te katman aktif mi? */
function isLayerActive(layer: string, beat: number): boolean {
  const event = ARRANGEMENT.events.find((e) => e.layer === layer);
  if (!event) return false;
  return beat >= event.startBeat && beat < event.endBeat;
}

/** Parça formu — katmanların giriş/çıkış eğrisi. */
const ARRANGEMENT = generateArrangement({
  totalBeats: LOOP_BEATS,
  layers: [
    'subThrob',
    'reactorHum',
    'atmosphere',
    'coldPad',
    'deepImpact',
    'metalClank',
    'machineTick',
    'filteredPulse',
    'signalTone',
  ],
  intensityPoints: [
    [0, 0.35],
    [16, 0.55],
    [32, 0.85],
    [48, 0.75],
    [64, 0.4],
  ],
  layerRanges: {
    subThrob: [0, LOOP_BEATS],
    reactorHum: [0, LOOP_BEATS],
    atmosphere: [0, LOOP_BEATS],
    coldPad: [0, LOOP_BEATS],
    deepImpact: [16, LOOP_BEATS],
    metalClank: [38, LOOP_BEATS],
    machineTick: [24, 56],
    filteredPulse: [32, LOOP_BEATS],
    signalTone: [40, LOOP_BEATS],
  },
});

const mix = createMix(DURATION);

// --- Katman 1: sub yatak (tüm uzunluk) ---
// Kök D1 sabit. Parçanın zemini; hiç değişmez, akor değişimine tepki vermez.
// Seviye ölçümle ayarlandı: daha yüksek değerlerde alt bant %45'i aşıp mix'i
// çamurlaştırıyor ve küçük hoparlörlerde gövde kayboluyor.
addVoice(mix, subThrob(D1, DURATION, 0.2, 0, 101), 0);

// --- Katman 2: reaktör uğultusu (tüm uzunluk) ---
// İki farklı oktavda, hafif pan ayrımıyla: tek kaynak yerine "birden çok
// makine" hissi. Detune atımları birbirine kilitlenmesin diye seed farklı.
addVoice(mix, reactorHum(D2, DURATION, 0.15, -0.25, 102), 0);
addVoice(mix, reactorHum(Bb1 * 2, DURATION, 0.1, 0.3, 103), 0);

// --- Katman 3: atmosfer yatağı (tüm uzunluk) ---
// Üst bandı shimmer yerine gürültü zemini doldurur. Bu tema en boğuk olan
// olduğu için parlaklık kasıtlı olarak referansın altında.
for (const voice of atmosphereBed(DURATION, { level: 1.0, brightness: 0.6, seedBase: 104 })) {
  addVoice(mix, voice, 0);
}

// --- Katman 4: soğuk pad (akor dokusu) ---
// Her akor kendi buffer'ında render edilir; kuyruk için akor süresine ek
// süre verilir, `addVoice` taşmayı yumuşakça keser.
for (let beat = 0; beat < LOOP_BEATS; beat += CHORD_BEATS) {
  const chord = CHORDS[(beat / CHORD_BEATS) % CHORDS.length]!;
  const tones = chordFreqs(chord);
  const padDuration = CHORD_BEATS * clock.beatDuration + 3.0;
  const offset = clock.toSample(beat);

  tones.forEach((freq, i) => {
    // Akor sesleri stereo alanda ayrılır: kök ortada, beşli kenarda.
    const pan = i === 0 ? 0 : i % 2 === 1 ? -0.35 : 0.35;
    const gain = i === 0 ? 0.15 : 0.1;
    addVoice(mix, coldPad(freq, padDuration, gain, pan, 110 + beat + i), offset);
  });
}

// --- Katman 5: yapısal darbe (beat 16'dan sonra, 8 beat'te bir) ---
// Kick değil: perde düşüşlü ağır kütle. Seyrek olması ağırlık hissini kurar.
for (let beat = 16; beat < LOOP_BEATS; beat += 8) {
  if (!isLayerActive('deepImpact', beat)) continue;
  const offset = clock.toSample(beat) + clock.humanize(beat, 1, 4);
  addVoice(mix, deepImpact(D1 * 1.6, 0.42, 0, 130 + beat), offset);
}

// --- Katman 6: metal darbe (beat 32'dan sonra, 16 beat'te bir + ofset) ---
// Yapısal darbeyle aynı ana düşmemesi için 6 beat kaydırıldı; üst üste binen
// transientler yapay sertlik üretiyordu.
for (let beat = 38; beat < LOOP_BEATS; beat += 16) {
  if (!isLayerActive('metalClank', beat)) continue;
  const offset = clock.toSample(beat) + clock.humanize(beat, 2, 6);
  addVoice(mix, metalClank(A3, 0.3, beat % 32 === 6 ? -0.4 : 0.4, 140 + beat), offset);
}

// --- Katman 7: röle tıkırtısı (beat 24-56, 4 beat'te bir) ---
// Hi-hat'in endüstriyel karşılığı ama tiz değil: kuru, orta bantta.
for (let beat = 24; beat < 56; beat += 4) {
  if (!isLayerActive('machineTick', beat)) continue;
  const offset = clock.toSample(beat + 2) + clock.humanize(beat, 3, 8);
  addVoice(mix, machineTick(1250, 0.13, (beat / 4) % 2 === 0 ? -0.3 : 0.3, 150 + beat), offset);
}

// --- Katman 8: mekanik bas dizisi (beat 32-64) ---
// Akorun kökünü ritmik olarak tekrarlar; parçanın ikinci yarısına ilerleme
// hissi katar. Melodi değil, nabız.
for (let beat = 32; beat < LOOP_BEATS; beat += 4) {
  if (!isLayerActive('filteredPulse', beat)) continue;
  const chord = CHORDS[Math.floor(beat / CHORD_BEATS) % CHORDS.length]!;
  const offset = clock.toSample(beat) + clock.humanize(beat, 4, 5);
  addVoice(mix, filteredPulse(chord.root, clock.beatDuration * 1.6, 0.2, 0, 160 + beat), offset);
}

// --- Katman 9: sinyal motifi (beat 40'tan sonra) ---
// Üç nota. Mindustry'de melodi kısa bir motiften ibarettir; burada da öyle.
const MOTIF: { freq: number; beat: number; beats: number }[] = [
  { freq: D3, beat: 40, beats: 4 },
  { freq: F3, beat: 46, beats: 3 },
  { freq: A2, beat: 52, beats: 6 },
];
for (const note of MOTIF) {
  if (!isLayerActive('signalTone', note.beat)) continue;
  const offset = clock.toSample(note.beat);
  addVoice(
    mix,
    signalTone(
      note.freq,
      note.beats * clock.beatDuration,
      0.17,
      note.beat % 8 === 0 ? -0.2 : 0.25,
      170 + note.beat,
    ),
    offset,
  );
}

// --- Master ---
// Kenar koruması loop için kısa tutulur. Hafif doygunluk endüstriyel
// karakterin parçası: tepe noktalarını yumuşatıp gövdeyi öne çıkarır.
applyEdgeGuard(mix, 14);
const result = masterChain(mix, { targetRmsDb: -17, peakCeiling: 0.92, drive: 1.15 });

writeTrack(oggPath, result);
