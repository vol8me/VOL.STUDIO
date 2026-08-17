/** @volstudio/core/audio/music
 *
 *  Web Audio tabanlı müzik motoru.
 *  Önceden üretilmiş OGG/MP3 stem'leri çalar, adaptive gain ve crossfade destekler.
 *  Runtime melodi/procedural üretim yok — tüm müzik build-time'da üretilir.
 */

export type * from './types';

export { MusicEngine } from './engine';
export { MusicMixer } from './mixer';
export { MusicScheduler } from './scheduler';
export { StemLoader } from './loader';
export { resolveStemGain } from './gain-resolver';
