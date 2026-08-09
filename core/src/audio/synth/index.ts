/**
 * @volstudio/core/audio/synth
 *
 * Prosedürel ses sentez motoru.
 * Node.js ve tarayıcıda çalışabilecek şekilde saf matematikle yazılmıştır.
 * WAV yazma işlemi ayrı `@volstudio/core/audio/synth/writer` subpath'inde bulunur.
 */

export type * from './types';

export { getWaveSample, getWaveSampleWithPhase } from './waveforms';
export { WhiteNoise, PinkNoise, BrownNoise, createNoiseSource } from './noise';
export { Envelope, applyCurve } from './envelope';
export { LowpassFilter, HighpassFilter, getCutoffAtTime } from './filter';
export {
  Bitcrusher,
  Chorus,
  DelayLine,
  Distortion,
  Flanger,
  Phaser,
  Reverb,
  StereoWidener,
  getPanGains,
} from './effects';
export { applyGlobalEffects, synthesize, synth, normalize, mix } from './engine';
export { compose } from './sequencer';
export {
  decodeWav,
  resampleLinear,
  trimSamples,
  loopSamples,
  applyEnvelopeToSample,
  processSample,
  mixSampleLayer,
} from './sample';

export * as Presets from './presets';
