/**
 * Enstrüman modelleri: bir enstrüman AİLESİNİN fiziksel davranışı.
 *
 * Bir model, `SynthParams` ile ifade EDİLEMEYEN yapı taşır — gecikme hattı,
 * rezonatör, uyarım — ve çıktısı doğrudan `SynthesisResult`tır. Bu yüzden
 * `presets/`ten ayrıdır: preset ad verilmiş bir parametre kümesidir ve yeni
 * DSP taşımaz. `guitar` bir presettir; `pluck` bir modeldir.
 *
 * Model burada, yani BUILD zamanında yaşar. Motorun çaldığı şey offline
 * render edilmiş tampondur; canlı sentez istenirse bu katmana değil, ayrı bir
 * çalışma zamanı katmanına gider.
 */

export { pluck } from './strings/plucked';
export type { PluckParams } from './strings/plucked';
export { bowedString } from './strings/bowed';
export type { BowedStringParams } from './strings/bowed';
export { piano } from './keyboard/piano';
export type { PianoParams } from './keyboard/piano';
export { airColumn } from './wind/airColumn';
export type { AirColumnParams } from './wind/airColumn';
export { brass } from './brass/brass';
export type { BrassParams } from './brass/brass';
export { formant } from './voice/formant';
export type { FormantParams } from './voice/formant';
