/**
 * Armoni motoru — stil profillerinden otomatik akor ilerlemesi üretir.
 */

import { transpose, type ChordDef, type ChordType } from '../audio-mix';
import { createRandom } from '../../src/audio/synth/random';

/** 12-ton eşit tamperamada yarım ses offsetleri. */
export type Scale = number[];

/** Büyük ölçek (Ionian). */
export const MAJOR_SCALE: Scale = [0, 2, 4, 5, 7, 9, 11];

/** Minör ölçek (Aeolian). */
export const MINOR_SCALE: Scale = [0, 2, 3, 5, 7, 8, 10];

/** Boş beşli / süspansiyon odaklı soğuk ölçek. */
export const SUSPENDED_SCALE: Scale = [0, 2, 5, 7, 10];

/** Akor tercihini tanımlar. */
export interface ChordChoice {
  degreeIndex: number;
  type: ChordType;
}

export interface ProgressionOptions {
  /** İlk akorun kök frekansı (Hz). */
  root: number;
  /** Ölçek yarım ses offsetleri. */
  scale?: Scale;
  /** Her akorun kaç beat kalacağı. */
  changeBeats: number;
  /** Toplam akor sayısı. */
  length: number;
  /** Tonik (ilk derece) ağırlığı. 0 = serbest, 1 = her adımda tonik. */
  tonicWeight?: number;
  /** Kullanılabilir akor tipleri. */
  chordTypes?: ChordType[];
  /** Deterministik seçim için seed. */
  seed?: number;
  /** Sabit akor listesi verilmek isterse. Verilirse bunu ilerletir. */
  fixedChords?: ChordDef[];
}

/** Ölçek derecesinden frekans üretir. */
function degreeToFreq(root: number, scale: Scale, degreeIndex: number): number {
  const octaves = Math.floor(degreeIndex / scale.length);
  const index = degreeIndex % scale.length;
  const semitones = scale[index]! + octaves * 12;
  return transpose(root, semitones);
}

/**
 * Basit bir akor ilerlemesi üretir.
 *
 * Algoritma:
 * - Her adımda tonik ağırlığına göre tonike dönme şansı vardır.
 * - Tonik seçilmezse ölçekten rastgele (seed'li) derece seçilir.
 * - Ardışık aynı akor tekrarlanmaz.
 */
export function generateProgression(options: ProgressionOptions): ChordDef[] {
  const {
    root,
    scale = MAJOR_SCALE,
    length,
    tonicWeight = 0.3,
    chordTypes = ['major'],
    seed = 1,
    fixedChords,
  } = options;

  if (fixedChords && fixedChords.length > 0) {
    const result: ChordDef[] = [];
    for (let i = 0; i < length; i++) {
      result.push(fixedChords[i % fixedChords.length]!);
    }
    return result;
  }

  const random = createRandom(seed);
  const result: ChordDef[] = [];

  for (let i = 0; i < length; i++) {
    let degreeIndex: number;
    const useTonic = random.next() < tonicWeight;
    if (useTonic) {
      degreeIndex = 0;
    } else {
      degreeIndex = Math.floor(random.next() * scale.length);
    }

    // Ardışık tekrarı engelle.
    if (i > 0 && degreeIndex === 0 && random.next() < 0.5) {
      degreeIndex = 1 + Math.floor(random.next() * (scale.length - 1));
    }

    const type = chordTypes[Math.floor(random.next() * chordTypes.length)]!;
    result.push({
      root: degreeToFreq(root, scale, degreeIndex),
      type,
    });
  }

  return result;
}

/** Verilen akor havuzundan tonik ağırlıklı ilerleme üretir. */
export function generateProgressionFromPool(
  chordPool: ChordDef[],
  length: number,
  tonicIndex = 0,
  tonicWeight = 0.4,
  seed = 1,
): ChordDef[] {
  const random = createRandom(seed);
  const result: ChordDef[] = [];
  for (let i = 0; i < length; i++) {
    let index =
      random.next() < tonicWeight ? tonicIndex : Math.floor(random.next() * chordPool.length);
    if (i > 0 && index === result[i - 1]!.root) {
      index = (index + 1 + Math.floor(random.next() * (chordPool.length - 1))) % chordPool.length;
    }
    result.push(chordPool[index]!);
  }
  return result;
}
