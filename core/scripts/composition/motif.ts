/**
 * Melodi / motif motoru — kısa motifler ve varyasyonları.
 */

import { transpose } from '../audio-mix';
import { createRandom } from '../../src/audio/synth/random';
import type { SequenceNote } from '../../src/audio/synth/types';

export type Scale = number[];

/** Büyük ölçek. */
export const MAJOR_SCALE: Scale = [0, 2, 4, 5, 7, 9, 11];

/** Minör ölçek. */
export const MINOR_SCALE: Scale = [0, 2, 3, 5, 7, 8, 10];

/** Boş beşli / süspansiyon. */
export const SUSPENDED_SCALE: Scale = [0, 2, 5, 7, 10];

export interface MotifOptions {
  /** Motif kök frekansı (Hz). frequencies verilmezse gerekli. */
  root?: number;
  /** Ölçek yarım ses offsetleri. */
  scale?: Scale;
  /** Notaların derece indeksleri. Verilmezse rastgele üretilir. */
  degrees?: number[];
  /** Doğrudan frekans değerleri. Verilirse root/scale/degrees yok sayılır. */
  frequencies?: number[];
  /** Her notanın süresi (saniye) — tek değer veya dizi. */
  durations?: number | number[];
  /** Notalar arası bekleme süresi (saniye). */
  delays?: number | number[];
  /** Nota sayısı. */
  length?: number;
  /** Register ofseti (oktav). */
  octave?: number;
  /** Deterministik seçim için seed. */
  seed?: number;
}

/** Ölçek derecesinden frekans üretir. */
function degreeToFreq(root: number, scale: Scale, degreeIndex: number, octave: number): number {
  const noteIndex = degreeIndex % scale.length;
  const octaves = Math.floor(degreeIndex / scale.length) + octave;
  const semitones = scale[noteIndex]! + octaves * 12;
  return transpose(root, semitones);
}

/** Tek değeri veya diziyi indeks ile okur. */
function pick<T>(value: T | T[], index: number): T {
  return Array.isArray(value) ? value[index % value.length]! : value;
}

/**
 * Kısa bir motif üretir.
 *
 * Verilen dereceler varsa onları kullanır; yoksa ölçekten deterministik
 * seçimle 3-6 nota üretir.
 */
export function generateMotif(options: MotifOptions): SequenceNote[] {
  const {
    root,
    scale = MAJOR_SCALE,
    degrees,
    frequencies,
    durations = 0.5,
    delays = 0,
    length = 4,
    octave = 0,
    seed = 1,
  } = options;

  const random = createRandom(seed);
  const noteCount = frequencies?.length ?? degrees?.length ?? length;
  const notes: SequenceNote[] = [];

  for (let i = 0; i < noteCount; i++) {
    let freq: number | undefined;
    if (frequencies) {
      freq = frequencies[i];
    } else {
      const degreeIndex = degrees?.[i] ?? Math.floor(random.next() * scale.length);
      if (!root) throw new Error('generateMotif: root veya frequencies gerekli.');
      freq = degreeToFreq(root, scale, degreeIndex, octave);
    }
    const duration = pick(durations, i);
    const delay = i === 0 ? 0 : pick(delays, i - 1);
    notes.push({
      freq,
      duration,
      delay,
    });
  }

  return notes;
}

/** Motifi verilen yarım ses kadar transpoze eder. */
export function transposeMotif(motif: SequenceNote[], semitones: number): SequenceNote[] {
  return motif.map((note) => ({
    ...note,
    freq: note.freq ? transpose(note.freq, semitones) : undefined,
    semitone: note.semitone !== undefined ? note.semitone + semitones : undefined,
  }));
}

/** Motifi tersine çevirir (inversiyon) — aralıkları aynaya yansıtır. */
export function invertMotif(motif: SequenceNote[]): SequenceNote[] {
  if (motif.length === 0) return [];
  const first = motif[0]!;
  return motif.map((note) => ({
    ...note,
    freq: first.freq && note.freq ? 2 * first.freq - note.freq : undefined,
  }));
}

/** Motifi retrograde (ters sıra) çevirir. */
export function reverseMotif(motif: SequenceNote[]): SequenceNote[] {
  return [...motif].reverse();
}
