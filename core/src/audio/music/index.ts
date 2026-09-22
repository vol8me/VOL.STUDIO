/** @volstudio/core/audio/music
 *
 *  Web Audio tabanlı müzik motoru.
 *  Önceden üretilmiş OGG/MP3 stem'leri çalar, adaptive gain ve crossfade destekler.
 *  Runtime melodi/procedural üretim yok — tüm müzik build-time'da üretilir.
 */

export type * from './types';

export { MusicEngine } from './engine';
export { MusicPlaylist } from './playlist';
export type { MusicPlaylistOptions } from './playlist';
export { MusicMixer } from './mixer';
export { MusicScheduler } from './scheduler';
export { StemLoader } from './loader';
export { resolveStemGain } from './gain-resolver';
export {
  assertEngineCompatible,
  barDurationSeconds,
  barsToFrames,
  beatDurationSeconds,
  MASTERING_PATHS,
  MUSIC_ASSET_SPEC_SCHEMA,
  MUSIC_RUNTIME_CAPABILITIES,
  toMusicTrack,
  validateMusicAssetSpec,
} from './spec';
export type {
  MusicAssetSpecV1,
  MusicPlaybackMode,
  MusicStemSpecV1,
  MusicTrackOptions,
  MusicTransitionSpecV1,
} from './spec';
