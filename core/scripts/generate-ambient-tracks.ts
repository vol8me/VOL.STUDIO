/**
 * Oyun içi ambiyans + ölüm parçaları — Mindustry karakteri.
 *
 * Üç parça: `void-whisper` (düşman az), `iron-tide` (düşman çok),
 * `last-ember` (ölüm ekranı).
 *
 * ## Spektral tasarım kararı
 *
 * Ambiyans parçaları SFX'lerin ALTINDA çalar. SFX enerjisi ağırlıklı olarak
 * 200-3000 Hz bandında. Bu yüzden ambiyansta orta bant kasıtlı olarak
 * boşaltıldı: gövde alt bantta (<150 Hz), doku üst bantta (>5 kHz) taşınıyor.
 * Böylece müzik mekân hissi verirken ateş/hasar/vuruş seslerini maskelemiyor.
 * Menü temalarında böyle bir kısıt yok — orada SFX yalnızca UI blip'i.
 *
 * ## Crossfade uyumu
 *
 * `void-whisper` ve `iron-tide` oyun içinde düşman sayısına göre birbirine
 * crossfade ediliyor (bkz. `games/vol-hell/src/config/music.ts`). İkisi de
 * AYNI tempo ve AYNI uzunlukta üretilir; farklı tempoda olsalar geçiş
 * ritmik olarak çakışırdı.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SynthesisResult } from '../src/audio/synth/types';
import {
  createMix,
  createBeatClock,
  addVoice,
  applyEdgeGuard,
  fadeRange,
  masterChain,
  chordFreqs,
  chordAtBeat,
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
  metalClank,
  machineTick,
  pressureHiss,
  conveyorRattle,
  signalTone,
  glassPing,
  filteredPulse,
} from './industrial-voices';
import { writeOgg } from '../src/audio/synth/writer';

// --- CLI ---

const outDirArg = process.argv[2];
if (!outDirArg) {
  console.error('Kullanim: tsx scripts/generate-ambient-tracks.ts <out-dir>');
  process.exit(1);
}
const outDir = resolve(outDirArg);

// --- Ortak zaman ---
// void-whisper ve iron-tide crossfade ile geçtiği için tempo/uzunluk aynı.

const AMBIENT_BPM = 68;
const AMBIENT_BEATS = 64;
const ambientClock = createBeatClock(AMBIENT_BPM);
const AMBIENT_DURATION = AMBIENT_BEATS * ambientClock.beatDuration;

// --- Perde paleti (D kökü — menü temalarından bağımsız, oyun içi kimlik) ---

const D1 = 36.71;
const D2 = 73.42;
const A2 = 110.0;
const D3 = 146.83;
const F3 = 174.61;
const A3 = 220.0;
const G2 = 98.0;
const C3 = 130.81;

/**
 * void-whisper — düşman az/yok. Boşluk ve tekinsiz sakinlik.
 *
 * Neredeyse hiç olay yok: iki uzun akor, gürültü zemini, çok seyrek vurgu.
 * Oyuncunun dikkatini çekmemesi gerekiyor — fark edilirse başarısız.
 */
function renderVoidWhisper(): SynthesisResult {
  const clock = ambientClock;
  const mix = createMix(AMBIENT_DURATION);

  const CHORDS: ChordDef[] = [
    { root: D2, type: 'fifth' },
    { root: G2, type: 'sus2' },
  ];
  const CHORD_BEATS = 32;

  // Alt bant gövde — SFX ile çakışmayan bölge.
  addVoice(mix, subThrob(D1, AMBIENT_DURATION, 0.24, 0, 401), 0);
  addVoice(mix, reactorHum(D2, AMBIENT_DURATION, 0.09, -0.3, 402), 0);

  // Atmosfer: orta bant kısık, hava yüksek. `brightness` yüksek ama `level`
  // düşük — doku var, kalabalık yok.
  for (const voice of atmosphereBed(AMBIENT_DURATION, {
    level: 0.7,
    brightness: 1.6,
    seedBase: 404,
    spread: 0.5,
  })) {
    addVoice(mix, voice, 0);
  }
  addVoice(mix, airDraft(AMBIENT_DURATION, 0.09, 0.45, 410), 0);
  addVoice(mix, airDraft(AMBIENT_DURATION, 0.07, -0.48, 411), 0);

  // Pad: kısık ve geniş. Orta bandı doldurmaması için gain düşük.
  for (let beat = 0; beat < AMBIENT_BEATS; beat += CHORD_BEATS) {
    const chord = CHORDS[(beat / CHORD_BEATS) % CHORDS.length]!;
    const padDuration = CHORD_BEATS * clock.beatDuration + 3.5;
    const offset = clock.toSample(beat);
    chordFreqs(chord).forEach((freq, i) => {
      addVoice(
        mix,
        coldPad(freq, padDuration, i === 0 ? 0.075 : 0.05, i === 0 ? -0.3 : 0.38, 420 + beat + i),
        offset,
      );
    });
  }

  // Çok seyrek olaylar: düzensiz aralıklarla iki ping, bir basınç.
  addVoice(mix, glassPing(transpose(D3, 7), 0.07, 0.45, 430), clock.toSample(13));
  addVoice(mix, glassPing(A3, 0.055, -0.42, 431), clock.toSample(43));
  addVoice(mix, pressureHiss(0.07, -0.4, 432, 5200), clock.toSample(27));
  addVoice(mix, deepImpact(D1 * 1.4, 0.16, 0, 433), clock.toSample(0));

  applyEdgeGuard(mix, 16);
  // En kısık parça: oyun sesleri her zaman üstte kalmalı.
  return masterChain(mix, { targetRmsDb: -22, peakCeiling: 0.9, drive: 1.0 });
}

/**
 * iron-tide — düşman çok. Baskı ve tehdit.
 *
 * void-whisper'ın üzerine ritmik nabız, artan uğultu ve mekanik grid ekler.
 * Combat müziği değil: hâlâ ambiyans, ama tedirgin ve ilerleyen.
 * Orta bant kısıtı burada da geçerli — SFX yoğunluğu bu parçada en yüksek.
 */
function renderIronTide(): SynthesisResult {
  const clock = ambientClock;
  const mix = createMix(AMBIENT_DURATION);

  const CHORDS: ChordDef[] = [
    { root: D2, type: 'minor' },
    { root: C3, type: 'fifth' },
    { root: D2, type: 'sus4' },
    { root: A2, type: 'fifth' },
  ];
  const CHORD_BEATS = 16;

  // Gövde: void-whisper'dan güçlü. Tehdit ağırlıkla anlatılır.
  addVoice(mix, subThrob(D1, AMBIENT_DURATION, 0.3, 0, 501), 0);
  addVoice(mix, reactorHum(D2, AMBIENT_DURATION, 0.16, -0.28, 502), 0);
  addVoice(mix, reactorHum(A2, AMBIENT_DURATION, 0.09, 0.32, 503), 0);

  for (const voice of atmosphereBed(AMBIENT_DURATION, {
    level: 0.8,
    brightness: 1.45,
    seedBase: 504,
    spread: 0.45,
  })) {
    addVoice(mix, voice, 0);
  }

  for (let beat = 0; beat < AMBIENT_BEATS; beat += CHORD_BEATS) {
    const chord = chordAtBeat(CHORDS, beat, CHORD_BEATS);
    const padDuration = CHORD_BEATS * clock.beatDuration + 2.5;
    const offset = clock.toSample(beat);
    chordFreqs(chord).forEach((freq, i) => {
      addVoice(
        mix,
        coldPad(
          freq,
          padDuration,
          i === 0 ? 0.085 : 0.055,
          i === 0 ? 0 : i === 1 ? -0.4 : 0.4,
          520 + beat + i,
        ),
        offset,
      );
    });
  }

  // Nabız: 4 beat'te bir yapısal darbe. Sabit ve kaçınılmaz.
  for (let beat = 0; beat < AMBIENT_BEATS; beat += 4) {
    const offset = clock.toSample(beat) + clock.humanize(beat, 1, 5);
    addVoice(mix, deepImpact(D1 * 1.5, 0.26, 0, 530 + beat), offset);
  }

  // Mekanik grid: 2 beat'te bir tıkırtı. Orta-üst bantta, kısa — SFX'i
  // maskelemeyecek kadar ince.
  for (let beat = 1; beat < AMBIENT_BEATS; beat += 2) {
    const offset = clock.toSample(beat) + clock.humanize(beat, 2, 9);
    addVoice(mix, machineTick(1350, 0.06, beat % 4 === 1 ? -0.35 : 0.35, 540 + beat), offset);
  }

  // Konveyör dokusu: ikinci yarıda devreye girer, baskıyı artırır.
  for (let beat = 32; beat < AMBIENT_BEATS; beat += 4) {
    const offset = clock.toSample(beat + 2) + clock.humanize(beat, 3, 7);
    addVoice(mix, conveyorRattle(340, 0.075, beat % 8 === 0 ? 0.4 : -0.4, 550 + beat), offset);
  }

  // Bas ostinato: akor köküne kilitli, ilerleme hissi.
  for (let beat = 16; beat < AMBIENT_BEATS; beat += 8) {
    const chord = chordAtBeat(CHORDS, beat, CHORD_BEATS);
    const offset = clock.toSample(beat) + clock.humanize(beat, 4, 5);
    addVoice(mix, filteredPulse(chord.root, clock.beatDuration * 2.2, 0.1, 0, 560 + beat), offset);
  }

  // Metal vurgu: 16 beat'te bir, uzak.
  for (let beat = 14; beat < AMBIENT_BEATS; beat += 16) {
    const offset = clock.toSample(beat) + clock.humanize(beat, 5, 6);
    addVoice(mix, metalClank(F3, 0.12, beat % 32 === 14 ? -0.45 : 0.45, 570 + beat), offset);
  }

  applyEdgeGuard(mix, 16);
  // void-whisper'dan 2 dB yüksek: geçiş duyulur olmalı ama SFX hâlâ üstte.
  return masterChain(mix, { targetRmsDb: -20, peakCeiling: 0.9, drive: 1.12 });
}

/**
 * last-ember — ölüm ekranı. Sistemin kapanışı.
 *
 * Loop YAPMAZ (`config/music.ts`'te `loop: false`), bu yüzden sonda gerçek
 * bir fade-out var: reaktör durur, ışıklar söner, yalnızca gürültü zemini
 * kalır. İnen sinyal motifi kapanışı anlatır.
 */
function renderLastEmber(): SynthesisResult {
  const BPM = 50;
  const BEATS = 26;
  const clock = createBeatClock(BPM);
  const duration = BEATS * clock.beatDuration;
  const mix = createMix(duration);

  // Açılış darbesi: ölüm anının ağırlığı.
  addVoice(mix, deepImpact(D1 * 1.3, 0.4, 0, 601), 0);
  addVoice(mix, metalClank(D3, 0.22, 0.3, 602), clock.toSample(0.5));

  // Zemin: başta güçlü, sonda sönecek.
  addVoice(mix, subThrob(D1, duration, 0.26, 0, 603), 0);
  addVoice(mix, reactorHum(D2, duration, 0.14, -0.3, 604), 0);

  for (const voice of atmosphereBed(duration, {
    level: 0.9,
    brightness: 1.3,
    seedBase: 605,
    spread: 0.48,
  })) {
    addVoice(mix, voice, 0);
  }
  addVoice(mix, airDraft(duration, 0.1, 0.45, 610), 0);

  // Tek akor, tüm parça: hareket yok, karar verilmiş.
  const padDuration = duration + 2.0;
  chordFreqs({ root: D2, type: 'minor' }).forEach((freq, i) => {
    addVoice(
      mix,
      coldPad(
        freq,
        padDuration,
        i === 0 ? 0.12 : 0.07,
        i === 0 ? 0 : i === 1 ? -0.4 : 0.4,
        620 + i,
      ),
      0,
    );
  });

  // İnen sinyal motifi: kapanış. Her nota bir önceki kadar uzun ama daha kısık.
  const DESCENT: { freq: number; beat: number; beats: number; gain: number }[] = [
    { freq: A3, beat: 2, beats: 4, gain: 0.17 },
    { freq: F3, beat: 7, beats: 4, gain: 0.14 },
    { freq: D3, beat: 12, beats: 5, gain: 0.12 },
    { freq: A2, beat: 18, beats: 6, gain: 0.1 },
  ];
  for (const note of DESCENT) {
    addVoice(
      mix,
      signalTone(
        note.freq,
        note.beats * clock.beatDuration,
        note.gain,
        note.beat % 4 === 2 ? -0.25 : 0.28,
        630 + note.beat,
      ),
      clock.toSample(note.beat),
    );
  }

  // Son basınç boşalması: sistemin havasının kaçışı.
  addVoice(mix, pressureHiss(0.16, 0, 640, 2400), clock.toSample(16));

  // Gerçek fade-out: loop olmadığı için sonda sessizliğe inmek doğru.
  fadeRange(mix, clock, BEATS - 8, BEATS, 'out');
  applyEdgeGuard(mix, 14);
  return masterChain(mix, { targetRmsDb: -19, peakCeiling: 0.92, drive: 1.1 });
}

// --- Üretim ---

const tracks: { name: string; dir: string; render: () => SynthesisResult }[] = [
  { name: 'void-whisper', dir: 'gameplay', render: renderVoidWhisper },
  { name: 'iron-tide', dir: 'gameplay', render: renderIronTide },
  { name: 'last-ember', dir: 'death', render: renderLastEmber },
];

for (const track of tracks) {
  const trackDir = join(outDir, track.dir);
  if (!existsSync(trackDir)) mkdirSync(trackDir, { recursive: true });

  const result = track.render();
  const oggPath = join(trackDir, `${track.name}.ogg`);
  writeOgg(oggPath, result);
  console.log(`Generated: ${oggPath} (${result.duration.toFixed(2)}s, ${result.sampleRate}Hz)`);
}
