/** @volstudio/core/audio/music
 *
 *  Web Audio tabanlı müzik motoru.
 *  Önceden üretilmiş WAV stem'leri çalar, adaptive gain ve crossfade destekler.
 *  Runtime melodi/procedural üretim yok — tüm müzik build-time'da üretilir.
 */

export type * from './types';

export { MusicEngine } from './engine';
export { MusicMixer } from './mixer';
export { MusicScheduler } from './scheduler';
export { StemLoader } from './loader';
export { resolveStemGain } from './gain-resolver';
export { Instrument } from './instrument';
export type { InstrumentName, InstrumentParams } from './instrument';
