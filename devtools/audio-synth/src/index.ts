/**
 * @volstudio/audio-synth — prosedürel ses sentezi, saf matematik.
 *
 * Dört katman, dört ayrı soru:
 *
 *   synthesis/    Örnek NASIL üretilir? (osilatör, gürültü, zarf, filtre)
 *   engine/       Parametreler nasıl BİRLEŞTİRİLİR? (`SynthParams` → örnek)
 *   instruments/  Bir enstrüman ailesi NASIL DAVRANIR? (fiziksel model)
 *   presets/      Bu sesin ADI ne? (parametre kümesi, yeni DSP taşımaz)
 *   arrange/      Bu sesler ZAMANDA nasıl dizilir? (perde, çizelge, yükseklik)
 *
 * Node ve tarayıcıda çalışır; dosya yazma `@volstudio/audio-synth/writer`
 * alt yolundadır (Node-only).
 */

export type * from './types';

export * from './synthesis';
export {
  Chorus,
  DelayLine,
  Distortion,
  Flanger,
  PhaserEffect,
  Reverb,
  StereoWidener,
  getPanGains,
} from './effects';
export { applyGlobalEffects, synthesize, synth, normalize, limitBuffer, mix } from './engine';
export * from './instruments';
export { compose } from './sequencer';

export * as Presets from './presets';
export * as Arrange from './arrange';
