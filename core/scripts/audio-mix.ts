/**
 * Müzik üretimi için mix temeli.
 *
 * Eski `music-utils.ts`'in yerini alır. Üç şeyi baştan doğru yapar:
 *
 * 1. **Voice'lar normalize edilmez.** Eski enstrümanlar `synth()`'i varsayılan
 *    `normalize: true` ile çağırıyordu; bu her notayı/pad'i/drone'u tek tek
 *    0.95 tepeye çekip katmanlar arası doğal dinamiği yok ediyordu. Mix dengesi
 *    tamamen `gain` sabitlerine kalıyor, sesin kendi karakteri kayboluyordu.
 *    Bu dosyadaki `addVoice` normalize'ı ÇAĞIRANIN sorumluluğunda bırakır; ses
 *    paletleri voice başına `normalize: false` geçmelidir.
 *
 * 2. **Üst üste binen transientler sample-exact hizalanmaz.** Ölçümle görüldü:
 *    tek tek hiçbir enstrüman click üretmiyordu (en yüksek fark 0.247) ama
 *    kick + snare + hi-hat aynı örneğe düşünce farklar toplanıp 0.36'ya
 *    çıkıyordu — duyulur bir sertlik. `humanizeOffset` her vuruşa deterministik
 *    birkaç ms kaydırma verir.
 *
 * 3. **Buffer sonunda kesilen voice'lar sızdırmaz.** `addVoice` hedefin sonuna
 *    taşan voice'a kısa bir kapanış rampası uygular; aksi halde loop
 *    sınırında sıfır olmayan bir örnekle kesilip tık üretiyordu.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { SynthesisResult } from '../src/audio/synth/types';
import { writeOgg } from '../src/audio/synth/writer';

export const SAMPLE_RATE = 44100;

// --- Stereo mix buffer ---

export interface StereoMix {
  left: Float32Array;
  right: Float32Array;
  duration: number;
}

export function createMix(duration: number): StereoMix {
  const length = Math.floor(duration * SAMPLE_RATE);
  return { left: new Float32Array(length), right: new Float32Array(length), duration };
}

/** Buffer sonunda kesilen voice'un tık bırakmaması için kapanış rampası (ms). */
const TRUNCATION_GUARD_MS = 8;

/**
 * Voice'u mix'e ekler. Mono voice iki kanala da yazılır.
 *
 * Voice hedefin sonuna taşıyorsa taşan kısım atılır ve son
 * `TRUNCATION_GUARD_MS` içinde kosinüs rampasıyla sıfıra indirilir — sert
 * kesme loop sınırında duyulur bir tık bırakıyordu.
 */
export function addVoice(mix: StereoMix, voice: SynthesisResult, offsetSamples: number): void {
  const srcL = voice.channels[0];
  if (!srcL) return;
  const srcR = voice.channels[1] ?? srcL;

  const targetLength = mix.left.length;
  const offset = Math.max(0, Math.floor(offsetSamples));
  if (offset >= targetLength) return;

  const available = targetLength - offset;
  const copyLength = Math.min(srcL.length, available);
  const truncated = copyLength < srcL.length;
  const guardSamples = truncated
    ? Math.min(Math.floor((TRUNCATION_GUARD_MS / 1000) * SAMPLE_RATE), copyLength)
    : 0;
  const guardStart = copyLength - guardSamples;

  for (let i = 0; i < copyLength; i++) {
    let gain = 1;
    if (guardSamples > 0 && i >= guardStart) {
      const t = (i - guardStart) / guardSamples;
      gain = 0.5 + 0.5 * Math.cos(Math.PI * t);
    }
    mix.left[offset + i] += srcL[i]! * gain;
    mix.right[offset + i] += srcR[i]! * gain;
  }
}

// --- Zamanlama ---

export interface BeatClock {
  /** Beat süresi (saniye). */
  beatDuration: number;
  /** Beat numarasını örnek indeksine çevirir. */
  toSample(beat: number): number;
  /**
   * Vuruşa deterministik mikro kaydırma verir (örnek cinsinden).
   *
   * Aynı beat'te tetiklenen birden çok perküsyon voice'unun transient'leri
   * sample-exact üst üste binerse farkları toplanıp yapay bir sertlik
   * üretiyor. `voiceId` farklı olan voice'lar birkaç ms ayrışır. Kaydırma
   * beat ve voiceId'den türetilir — rastgele değil, üretim tekrarlanabilir
   * kalır.
   */
  humanize(beat: number, voiceId: number, maxMs?: number): number;
}

export function createBeatClock(bpm: number): BeatClock {
  const beatDuration = 60 / bpm;

  const toSample = (beat: number): number => Math.floor(beat * beatDuration * SAMPLE_RATE);

  const humanize = (beat: number, voiceId: number, maxMs = 6): number => {
    // 32-bit tam sayı hash (FNV benzeri karıştırma) — aynı girdi her zaman
    // aynı kaydırmayı verir.
    let h = (Math.round(beat * 16) * 0x9e3779b1) ^ (voiceId * 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 15), 0x2545f491);
    const unit = ((h >>> 0) % 1000) / 1000; // [0,1)
    const offsetMs = unit * maxMs;
    return Math.floor((offsetMs / 1000) * SAMPLE_RATE);
  };

  return { beatDuration, toSample, humanize };
}

// --- Zarf / kenar işleme ---

/**
 * Mix'in başına ve sonuna kısa kosinüs rampası uygular.
 *
 * Loop'lanan parçalarda uzun fade YAPILMAZ: loop sınırında sesi sıfıra
 * indirmek her turda duyulur bir boşluk yaratır. Burada amaç yalnızca ilk/son
 * örneğin sıfırdan farklı olmasından doğan tıkı engellemek.
 */
export function applyEdgeGuard(mix: StereoMix, guardMs = 12): void {
  const n = Math.min(Math.floor((guardMs / 1000) * SAMPLE_RATE), Math.floor(mix.left.length / 2));
  if (n <= 0) return;

  for (let i = 0; i < n; i++) {
    const gain = 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
    mix.left[i]! *= gain;
    mix.right[i]! *= gain;
    const j = mix.left.length - 1 - i;
    mix.left[j]! *= gain;
    mix.right[j]! *= gain;
  }
}

/** Beat aralığında kosinüs fade — katman girişi/çıkışı için (müzikal, uzun). */
export function fadeRange(
  mix: StereoMix,
  clock: BeatClock,
  startBeat: number,
  endBeat: number,
  direction: 'in' | 'out',
): void {
  const s = Math.max(0, clock.toSample(startBeat));
  const e = Math.min(mix.left.length, clock.toSample(endBeat));
  if (e <= s) return;

  for (let i = s; i < e; i++) {
    const t = (i - s) / (e - s);
    const gain =
      direction === 'in' ? 0.5 - 0.5 * Math.cos(Math.PI * t) : 0.5 + 0.5 * Math.cos(Math.PI * t);
    mix.left[i]! *= gain;
    mix.right[i]! *= gain;
  }

  if (direction === 'out') {
    for (let i = e; i < mix.left.length; i++) {
      mix.left[i] = 0;
      mix.right[i] = 0;
    }
  }
}

// --- Master zincir ---

/**
 * DC bileşenini süzer (tek kutuplu highpass, ~5 Hz).
 *
 * Ölçümde mevcut asset'lerde 2.2e-3'e kadar DC offset görüldü. Duyulmaz ama
 * headroom yer ve toplamda asimetrik clipping riski yaratır.
 */
function dcBlock(buffer: Float32Array): void {
  const cutoff = 5;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = rc / (rc + 1 / SAMPLE_RATE);
  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < buffer.length; i++) {
    const input = buffer[i]!;
    const output = alpha * (prevOut + input - prevIn);
    buffer[i] = output;
    prevIn = input;
    prevOut = output;
  }
}

/** Yumuşak doygunluk — tepe kırpma yerine kademeli sıkıştırma. */
function softSaturate(x: number): number {
  return Math.tanh(x);
}

export interface MasterOptions {
  /**
   * Hedef ortalama seviye (dBFS RMS). Algılanan yükseklik burada belirlenir.
   *
   * Sabit tepeye normalize etmek (eski davranış) yanıltıcıydı: yoğun bir doku
   * ile seyrek bir doku aynı tepeye çekilince yoğun olan çok daha yüksek
   * duyuluyordu. Arka plan müziği için RMS hedefi doğru ölçüdür.
   * Menü müziği ~-17, oyun içi ambiyans ~-20 civarı.
   */
  targetRmsDb?: number;
  /** Tepe tavanı (lineer). RMS hedefi bunu aşarsa doygunlukla geri çekilir. */
  peakCeiling?: number;
  /**
   * Doygunluk sürüşü. 1 = etkisiz. 1'in üzerinde tepe noktalarını yumuşatır,
   * gövdeyi öne çıkarır. Endüstriyel karakterde hafif doygunluk istenir.
   */
  drive?: number;
}

/**
 * Master zincir: DC süzme → doygunluk → RMS hedefi → tepe tavanı.
 *
 * Seviye ayarı EN SONDA ve TEK KEZ uygulanır. Voice bazında normalize etmek
 * (eski davranış) katmanlar arası dinamiği yok ediyordu.
 */
export function masterChain(mix: StereoMix, options: MasterOptions = {}): SynthesisResult {
  const { targetRmsDb = -17, peakCeiling = 0.92, drive = 1 } = options;
  const { left, right } = mix;

  dcBlock(left);
  dcBlock(right);

  if (drive !== 1) {
    for (let i = 0; i < left.length; i++) {
      left[i] = softSaturate(left[i]! * drive);
      right[i] = softSaturate(right[i]! * drive);
    }
  }

  const n = left.length;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    sumSq += (left[i]! * left[i]! + right[i]! * right[i]!) / 2;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, n));
  if (rms > 0) {
    const scale = Math.pow(10, targetRmsDb / 20) / rms;
    for (let i = 0; i < n; i++) {
      left[i]! *= scale;
      right[i]! *= scale;
    }
  }

  // Tepe tavanı: RMS hedefi tek tek transientleri tavanın üstüne çıkarabilir.
  // Sert kırpma yerine tanh ile yumuşak sıkıştırma — kırpma harmonik
  // distorsiyon üretip cızırtı olarak duyulur.
  let peak = 0;
  for (let i = 0; i < n; i++) {
    peak = Math.max(peak, Math.abs(left[i]!), Math.abs(right[i]!));
  }
  if (peak > peakCeiling) {
    const k = peak / peakCeiling;
    for (let i = 0; i < n; i++) {
      left[i] = softSaturate((left[i]! / peakCeiling) * k) * peakCeiling;
      right[i] = softSaturate((right[i]! / peakCeiling) * k) * peakCeiling;
    }
  }

  return { channels: [left, right], sampleRate: SAMPLE_RATE, duration: mix.duration };
}

/**
 * Tek atımlık sesler (SFX) için master: DC süzme → doygunluk → tepe hedefi.
 *
 * SFX'te RMS hedefi yanlış ölçü: 80 ms'lik bir tık ile 2 saniyelik bir çöküş
 * aynı RMS'e çekilirse tık duyulmaz seviyeye iner. Kısa seslerde algılanan
 * yükseklik tepeye çok daha yakın. Olay bazında tepe hedefi verilerek doğal
 * hiyerarşi kurulur (UI tıkı kısık, ölüm sesi yüksek).
 */
export function masterPeak(mix: StereoMix, targetPeak: number, drive = 1): SynthesisResult {
  const { left, right } = mix;

  dcBlock(left);
  dcBlock(right);

  if (drive !== 1) {
    for (let i = 0; i < left.length; i++) {
      left[i] = softSaturate(left[i]! * drive);
      right[i] = softSaturate(right[i]! * drive);
    }
  }

  let peak = 0;
  for (let i = 0; i < left.length; i++) {
    peak = Math.max(peak, Math.abs(left[i]!), Math.abs(right[i]!));
  }
  if (peak > 0) {
    const scale = targetPeak / peak;
    for (let i = 0; i < left.length; i++) {
      left[i]! *= scale;
      right[i]! *= scale;
    }
  }

  return { channels: [left, right], sampleRate: SAMPLE_RATE, duration: mix.duration };
}

// --- Nota / akor yardımcıları ---

/** Yarım ses oranı — eşit tamperaman. */
const SEMITONE = Math.pow(2, 1 / 12);

/** Bir frekansı verilen yarım ses kadar kaydırır. */
export function transpose(freq: number, semitones: number): number {
  return freq * Math.pow(SEMITONE, semitones);
}

/** Müzik üretimi için nötr akor tipleri. */
export type ChordType =
  | 'fifth'
  | 'minor'
  | 'major'
  | 'sus2'
  | 'sus4'
  | 'octave'
  | 'minor7'
  | 'major7'
  | 'dom7'
  | 'add9';

export interface ChordDef {
  root: number;
  type: ChordType;
}

/** Akorun frekanslarını döndürür (kök dahil). */
export function chordFreqs(chord: ChordDef): number[] {
  const { root, type } = chord;
  switch (type) {
    case 'fifth':
      return [root, transpose(root, 7)];
    case 'minor':
      return [root, transpose(root, 3), transpose(root, 7)];
    case 'major':
      return [root, transpose(root, 4), transpose(root, 7)];
    case 'sus2':
      return [root, transpose(root, 2), transpose(root, 7)];
    case 'sus4':
      return [root, transpose(root, 5), transpose(root, 7)];
    case 'octave':
      return [root, root * 2];
    case 'minor7':
      return [root, transpose(root, 3), transpose(root, 7), transpose(root, 10)];
    case 'major7':
      return [root, transpose(root, 4), transpose(root, 7), transpose(root, 11)];
    case 'dom7':
      return [root, transpose(root, 4), transpose(root, 7), transpose(root, 10)];
    case 'add9':
      return [root, transpose(root, 4), transpose(root, 7), transpose(root, 14)];
  }
}

/** Verilen beat'te çalan akoru döndürür. */
export function chordAtBeat(chords: ChordDef[], beat: number, chordBeats: number): ChordDef {
  return chords[Math.floor(beat / chordBeats) % chords.length]!;
}

// --- CLI ---

/** `<out.wav> <out.ogg>` argümanlarını okur, doğrular, klasörlerini oluşturur. */
export function parseOggArg(scriptName: string): string {
  const oggArg = process.argv[2];
  if (!oggArg) {
    console.error(`Kullanim: tsx scripts/${scriptName} <out.ogg>`);
    process.exit(1);
  }
  const oggPath = resolve(oggArg);
  if (!existsSync(dirname(oggPath))) mkdirSync(dirname(oggPath), { recursive: true });
  return oggPath;
}

/**
 * Parçayı OGG olarak yazar ve sonucu loglar.
 *
 * Tek format bilinçli bir karardır. Önceden WAV (kayıpsız kaynak) + OGG
 * (shipped) çifti üretiliyordu; WAV'lar repoda 54 MB yer kaplıyor ve her
 * yeniden üretimde git geçmişine yeni blob ekliyordu. Üretim deterministik
 * olduğu için asıl kaynak WAV değil bu script'lerin kendisidir — aynı koddan
 * her zaman aynı ses çıkar, dolayısıyla kayıpsız kopyayı saklamanın karşılığı
 * yok. iOS gerektiğinde `convert-audio.ts` OGG'den MP3 üretir.
 */
export function writeTrack(oggPath: string, result: SynthesisResult): void {
  writeOgg(oggPath, result);
  console.log(`Generated: ${oggPath} (${result.duration.toFixed(2)}s, ${result.sampleRate}Hz)`);
}
