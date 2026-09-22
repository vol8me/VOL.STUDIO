import { CONCERT_A, SCALES } from '../arrange/pitch';
import { AudioParamError } from '../guard/errors';

/**
 * Müzik katmanının perde aritmetiği MIDI sayısıyla yapılır: aralık, oktav
 * kaydırma ve ses yürütme tamsayı toplamıdır, nota adıyla yapılınca her
 * adımda metin ayrıştırmak gerekirdi. Adlar yalnız sınırlarda (program
 * belgesi ve rapor) kullanılır.
 */
export const MIDI_A4 = 69;
export const MIDI_MIN = 0;
export const MIDI_MAX = 127;

const PITCH_CLASS: Readonly<Record<string, number>> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const NOTE_PATTERN = /^([A-G][#b]?)(-?\d)$/;

export type ScaleName = keyof typeof SCALES;

export function isScaleName(value: unknown): value is ScaleName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SCALES, value);
}

export function scaleSteps(name: ScaleName): readonly number[] {
  return SCALES[name];
}

export function scaleNames(): ScaleName[] {
  return Object.keys(SCALES).sort() as ScaleName[];
}

/** `'C4'` → 60. Bilimsel perde gösterimi; oktav C'de artar. */
export function noteToMidi(note: string, path = 'note'): number {
  const match = NOTE_PATTERN.exec(note);
  if (!match) throw new AudioParamError(path, 'type', 'nota adı olmalı (ör. C4, F#3)', note);
  const midi = PITCH_CLASS[match[1]] + (Number(match[2]) + 1) * 12;
  if (midi < MIDI_MIN || midi > MIDI_MAX) {
    throw new AudioParamError(
      path,
      'range',
      `MIDI ${MIDI_MIN}–${MIDI_MAX} aralığında olmalı`,
      note,
    );
  }
  return midi;
}

export function midiToNote(midi: number): string {
  const index = ((Math.round(midi) % 12) + 12) % 12;
  return `${SHARP_NAMES[index]}${Math.floor(Math.round(midi) / 12) - 1}`;
}

export function midiToHz(midi: number): number {
  return CONCERT_A * Math.pow(2, (midi - MIDI_A4) / 12);
}

export function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

/**
 * Dizinin `index`. derecesinin MIDI değeri; indeks dizi uzunluğunu aşınca
 * oktav taşar (`scaleDegree` ile aynı sözleşme, MIDI karşılığı).
 */
export function degreeToMidi(rootMidi: number, scale: readonly number[], index: number): number {
  if (scale.length === 0) throw new AudioParamError('scale', 'range', 'boş dizi derece veremez', 0);
  const octave = Math.floor(index / scale.length);
  const step = ((index % scale.length) + scale.length) % scale.length;
  return rootMidi + scale[step] + octave * 12;
}

/** Perde sınıfı dizinin içinde mi (oktavdan bağımsız). */
export function inSystem(midi: number, rootMidi: number, scale: readonly number[]): boolean {
  const relative = (((pitchClass(midi) - pitchClass(rootMidi)) % 12) + 12) % 12;
  return scale.some((step) => ((step % 12) + 12) % 12 === relative);
}

/** Notayı verilen aralığa oktav katlayarak taşır; aralık bir oktavdan darsa en yakın uca gider. */
export function foldIntoRange(midi: number, lowMidi: number, highMidi: number): number {
  let value = midi;
  while (value < lowMidi && value + 12 <= highMidi + 11) value += 12;
  while (value > highMidi && value - 12 >= lowMidi - 11) value -= 12;
  return Math.min(highMidi, Math.max(lowMidi, value));
}
