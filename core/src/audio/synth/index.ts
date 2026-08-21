/**
 * @volstudio/core/audio/synth
 *
 * Prosedürel ses sentez motoru.
 * Node.js ve tarayıcıda çalışabilecek şekilde saf matematikle yazılmıştır.
 * WAV yazma işlemi ayrı `@volstudio/core/audio/synth/writer` subpath'inde bulunur.
 */

export type * from './types';

export { getWaveSampleConstantFreq, getWaveSampleWithPhase } from './waveforms';
export { WhiteNoise, PinkNoise, BrownNoise, createNoiseSource } from './noise';
export { Envelope, applyCurve } from './envelope';
export {
  LowpassFilter,
  HighpassFilter,
  BiquadFilter,
  Cascade4Filter,
  createFilter,
  getCutoffAtTime,
} from './filter';
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
export { pluck } from './physical';
export type { PluckParams } from './physical';
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
