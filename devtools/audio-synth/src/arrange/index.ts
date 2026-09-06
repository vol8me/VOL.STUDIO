/**
 * Düzenleme katmanı: notaları müziğe çeviren yüzey.
 *
 * `synthesis/` örnek üretir, `engine/` onları birleştirir, `instruments/` ve
 * `presets/` bir sesin kimliğini verir. Burası bu seslerin ZAMANDA nasıl
 * dizileceğini taşır — perde sözlüğü, çok sesli zaman çizelgesi ve yükseklik
 * eşitleme.
 *
 * Kök yüzeye tek isimle (`Arrange`) girer; içindekiler yüzey sayısını
 * büyütmez.
 */

export { CONCERT_A, noteToHz, transposeNote, SCALES, scaleDegree, scaleChord } from './pitch';
export type { ScaleName } from './pitch';
export { measureRms, measurePeak, softLimit, matchLoudness } from './loudness';
export type { LoudnessOptions } from './loudness';
export { Timeline } from './timeline';
export type { InstrumentFn, NoteEvent, TimelineOptions, RenderOptions } from './timeline';
