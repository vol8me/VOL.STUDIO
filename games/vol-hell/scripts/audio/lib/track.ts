/**
 * Track tanımı ve nota yerleştirme yardımcıları.
 *
 * Her müzik/ambiyans parçası bir `TrackDef` ihraç eder; generate script'leri
 * bu tanımları döngüyle üretir. `bpm` ve `beats` alanları runtime config'iyle
 * (src/config/music.ts) BİREBİR eşleşmek zorundadır — loopEnd oradan hesaplanır.
 */

import type { SynthesisResult } from '@volstudio/core/audio/synth';
import type { StereoMix } from './mix';
import { addVoice, humanize } from './mix';
import type { NoteEvent } from './theory';
import { beatSec, hz } from './theory';

/** Üretilecek bir parçanın tam tanımı. */
export interface TrackDef {
  /** Parça kimliği — dosya adı ve config anahtarıyla aynı. */
  id: string;
  /** Base dizine göre çıkış yolu (örn. 'main-menu/hollow-signal.ogg'). */
  file: string;
  /** Tempo. Ambiyans gibi ölçüsüz parçalarda dosya uzunluğu hesabı içindir. */
  bpm: number;
  /** Toplam vuruş sayısı — parça süresi = beats * 60 / bpm. */
  beats: number;
  /** Parça loop'lanacak mı? Loop parçalarında kuyruklar başa sarılır. */
  loop: boolean;
  /** Master RMS hedefi (dBFS). */
  rmsTargetDb: number;
  /** Parçayı üretir. */
  build(): StereoMix;
}

/** Melodik voice imzası — frekans, süre (saniye), seed. */
export type MelodicVoice = (frequency: number, duration: number, seed: number) => SynthesisResult;

/** Perküsif voice imzası — yalnız seed alır. */
export type PercussiveVoice = (seed: number) => SynthesisResult;

/** Nota yerleştirme seçenekleri. */
export interface PlaceOptions {
  /** Seed tabanı — aynı taban aynı üretimi verir. */
  baseSeed: number;
  /** Tüm olaylara uygulanan kazanç çarpanı. Varsayılan 1. */
  gain?: number;
  /** Stereo pan (-1..1). Varsayılan 0. */
  pan?: number;
  /** Loop parçası mı (kuyruk sarma). Varsayılan false. */
  wrap?: boolean;
  /** Nota süresi çarpanı — legato/staccato ayarı. Varsayılan 1. */
  durScale?: number;
}

/** Nota olaylarını melodik voice ile mix'e yerleştirir. */
export function placeNotes(
  mix: StereoMix,
  events: NoteEvent[],
  bpm: number,
  voice: MelodicVoice,
  options: PlaceOptions,
): void {
  const beat = beatSec(bpm);
  const { baseSeed, gain = 1, pan = 0, wrap = false, durScale = 1 } = options;
  events.forEach((event, index) => {
    const rendered = voice(hz(event.note), event.dur * beat * durScale, baseSeed + index);
    addVoice(mix, rendered, event.beat * beat, { gain: gain * (event.gain ?? 1), pan, wrap });
  });
}

/** Vuruş yerleştirme seçenekleri. */
export interface HitOptions extends PlaceOptions {
  /** Vuruş başına insanileştirme yayılımı (ms). Varsayılan 3. */
  humanizeMs?: number;
}

/** Perküsif vuruşları (vuruş listesi) mix'e yerleştirir. */
export function placeHits(
  mix: StereoMix,
  beats: number[],
  bpm: number,
  voice: PercussiveVoice,
  options: HitOptions,
): void {
  const beat = beatSec(bpm);
  const { baseSeed, gain = 1, pan = 0, wrap = false, humanizeMs = 3 } = options;
  beats.forEach((beatPos, index) => {
    const at = beatPos * beat + humanize(baseSeed, index, humanizeMs);
    addVoice(mix, voice(baseSeed + index), at, { gain, pan, wrap });
  });
}

/** Bar bazlı deseni tüm aralığa açar: her bar için desen vuruşları eklenir. */
export function everyBar(
  pattern: number[],
  fromBar: number,
  toBarExclusive: number,
  beatsPerBar = 4,
): number[] {
  const beats: number[] = [];
  for (let bar = fromBar; bar < toBarExclusive; bar++) {
    for (const offset of pattern) {
      beats.push(bar * beatsPerBar + offset);
    }
  }
  return beats;
}
