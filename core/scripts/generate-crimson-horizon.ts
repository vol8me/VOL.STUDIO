/**
 * Ana menü teması 3 — "Crimson Horizon"
 *
 * Karakter: **BOŞLUK.** Terk edilmiş yüzey / uzak tehdit. Üst register ve
 * hava hâkim, ritim neredeyse yok. Üç menü temasının en geniş ve en seyrek
 * olanı.
 *
 * Kimlik ayrımı (Iron Vein ve Black Tide ile karışmaması için):
 * - Register: enerji üst bantta; sub yalnızca zemin olarak var, orta bant
 *   kasıtlı boş bırakıldı — mekân hissi boşluktan doğar.
 * - Ritim: sabit grid YOK. Olaylar 12-16 beat aralıklarla, düzensiz.
 *   Dinleyici bir nabız yakalayamaz; bu tedirginlik kasıtlı.
 * - Armoni: iki akor ama çok yavaş (32 beat) ve boş beşli/oktav — en nötr,
 *   en "tonalitesiz" seçim.
 * - Palet: airDraft + coldPad + glassPing hâkim. Konveyör/röle/bas ostinato
 *   hiç yok — Black Tide'ın tam tersi.
 *
 * Loop: 48 beat @ 52 BPM (en uzun bar süresi, en yavaş tema).
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
  transpose,
  type ChordDef,
} from './audio-mix';
import {
  reactorHum,
  subThrob,
  atmosphereBed,
  coldPad,
  airDraft,
  deepImpact,
  glassPing,
  signalTone,
  pressureHiss,
} from './industrial-voices';

const oggPath = parseOggArg('generate-crimson-horizon.ts');

// --- Zaman ---

const BPM = 52;
const LOOP_BEATS = 48;
const clock = createBeatClock(BPM);
const DURATION = LOOP_BEATS * clock.beatDuration;

// --- Perde paleti (E kökü, boş beşli / oktav) ---

const E1 = 41.2;
const E2 = 82.41;
const B2 = 123.47;
const E3 = 164.81;
const G3 = 196.0;
const B3 = 246.94;
const E4 = 329.63;
const C3 = 130.81;

/** İki akor, 32/16 beat — asimetrik bölünme, döngü hissini bulanıklaştırır. */
const CHORDS: ChordDef[] = [
  { root: E2, type: 'fifth' },
  { root: C3, type: 'octave' },
];
const CHORD_BEATS = 24;

const mix = createMix(DURATION);

// --- Katman 1: sub zemin ---
// Yalnızca zemin: bu temada bas karakter taşımıyor, mekânı tutuyor.
addVoice(mix, subThrob(E1, DURATION, 0.15, 0, 301), 0);

// --- Katman 2: uzak reaktör (çok kısık) ---
// Duyulur bir uğultu değil, varlığı hissedilen bir arka plan.
addVoice(mix, reactorHum(E2, DURATION, 0.07, 0.35, 302), 0);

// --- Katman 3: atmosfer yatağı (en parlak ayar) ---
// Üç temanın en parlağı. `level` düşük + `brightness` yüksek bilinçli bir
// çift ayar: gövde bandını (900 Hz) kısıp üst bantları öne çıkarır. Yalnızca
// brightness yükseltmek yetmiyordu — gövde bandı da `level` ile ölçekleniyor
// ve parlaklık farkını ölçümde bastırıyordu.
for (const voice of atmosphereBed(DURATION, {
  level: 0.8,
  brightness: 2.3,
  seedBase: 304,
  spread: 0.5,
})) {
  addVoice(mix, voice, 0);
}

// --- Katman 4: hava akımı (iki kanal, farklı seed) ---
// Bu temanın imzası. Yavaş filtre LFO'su ile nefes alan bir yapı.
// Seviye ölçümle kısıldı: airDraft 220-900 Hz bandında ve fazlası temanın
// parlaklık kimliğini geri götürüyordu.
addVoice(mix, airDraft(DURATION, 0.07, -0.5, 310), 0);
addVoice(mix, airDraft(DURATION, 0.055, 0.5, 311), 0);

// --- Katman 5: soğuk pad (geniş, yavaş) ---
for (let beat = 0; beat < LOOP_BEATS; beat += CHORD_BEATS) {
  const chord = CHORDS[(beat / CHORD_BEATS) % CHORDS.length]!;
  const tones = chordFreqs(chord);
  const padDuration = CHORD_BEATS * clock.beatDuration + 4.0;
  const offset = clock.toSample(beat);

  tones.forEach((freq, i) => {
    const pan = i === 0 ? -0.28 : 0.42;
    addVoice(mix, coldPad(freq, padDuration, i === 0 ? 0.1 : 0.08, pan, 320 + beat + i), offset);
    // Oktav üstü ince katman: geniş ve havadar dokuyu güçlendirir.
    addVoice(mix, coldPad(freq * 2, padDuration, 0.045, -pan, 330 + beat + i), offset);
  });
}

// --- Katman 6: cam vurgular (düzensiz aralıklar) ---
// Sabit grid YOK: 7, 19, 29, 41 — asal benzeri aralıklar nabız algısını
// engeller. Bu temanın tedirginliği buradan gelir.
const PING_BEATS: { beat: number; freq: number }[] = [
  { beat: 7, freq: E4 },
  { beat: 19, freq: B3 },
  { beat: 29, freq: transpose(E4, 3) },
  { beat: 41, freq: G3 },
];
for (const ping of PING_BEATS) {
  const offset = clock.toSample(ping.beat) + clock.humanize(ping.beat, 1, 10);
  addVoice(
    mix,
    glassPing(ping.freq, 0.14, ping.beat % 2 === 1 ? -0.45 : 0.45, 340 + ping.beat),
    offset,
  );
}

// --- Katman 7: uzak sinyal (iki uzun nota) ---
// Melodi değil: ufuktan gelen iki işaret.
addVoice(mix, signalTone(B2, clock.beatDuration * 8, 0.15, -0.2, 350), clock.toSample(12));
addVoice(mix, signalTone(E3, clock.beatDuration * 10, 0.13, 0.25, 351), clock.toSample(32));

// --- Katman 8: çok seyrek yapısal darbe ---
// Tüm parçada iki kez. Ritim kurmuyor, mekânın büyüklüğünü işaretliyor.
for (const beat of [0, 24]) {
  const offset = clock.toSample(beat) + clock.humanize(beat, 2, 5);
  addVoice(mix, deepImpact(E1 * 1.4, 0.24, 0, 360 + beat), offset);
}

// --- Katman 9: uzak basınç (bir kez, ortada) ---
addVoice(mix, pressureHiss(0.12, 0.4, 370, 4200), clock.toSample(35));

// --- Master ---
// Doygunluk en düşük: bu temanın geniş ve temiz kalması gerekiyor, sıkıştırma
// mekân hissini daraltıyor.
applyEdgeGuard(mix, 16);
const result = masterChain(mix, { targetRmsDb: -18, peakCeiling: 0.92, drive: 1.05 });

writeTrack(oggPath, result);
