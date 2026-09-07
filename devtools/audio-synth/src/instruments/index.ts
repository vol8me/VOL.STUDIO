/**
 * Enstrüman modelleri: bir enstrüman AİLESİNİN fiziksel davranışı.
 *
 * Bir model, `SynthParams` ile ifade EDİLEMEYEN yapı taşır — gecikme hattı,
 * rezonatör, uyarım — ve çıktısı doğrudan `SynthesisResult`tır. Bu yüzden
 * `presets/`ten ayrıdır: preset ad verilmiş bir parametre kümesidir ve yeni
 * DSP taşımaz. `guitar` bir presettir; `PluckedString` bir modeldir.
 *
 * Model burada, yani BUILD zamanında yaşar. Motorun çaldığı şey offline
 * render edilmiş tampondur; canlı sentez istenirse bu katmana değil, ayrı bir
 * çalışma zamanı katmanına gider.
 */

export { pluck } from './strings/plucked';
export type { PluckParams } from './strings/plucked';
export { piano } from './keyboard/piano';
export type { PianoParams } from './keyboard/piano';
