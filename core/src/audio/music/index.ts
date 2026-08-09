/** @volstudio/core/audio/music
 *
 *  Profesyonel, Web Audio tabanlı müzik motoru.
 *  Stem (katman) tabanlı adaptive müzik, crossfade, stinger ve
 *  prosedürel ambient/drone/pad üretimi sağlar.
 */

export type * from './types';

export { MusicEngine } from './engine';
export { MusicMixer } from './mixer';
export { MusicScheduler } from './scheduler';
export { StemLoader } from './loader';
export { resolveStemGain } from './gain-resolver';
export { ProceduralStemGenerator } from './procedural';
export { ambientNoiseParams, bassParams, droneParams, padParams } from './procedural-presets';
export { Instrument } from './instrument';
export type { InstrumentName, MelodicPhrase, MelodicNote, InstrumentParams } from './instrument';
export { MelodicEngine } from './melodic';
export type { MelodicPlayOptions } from './melodic';
