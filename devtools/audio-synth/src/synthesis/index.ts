/**
 * Sentez teknikleri: parametreden örneğe giden YOLLAR.
 *
 * Buradaki hiçbir şey tek başına bir enstrüman değildir. Osilatör, gürültü,
 * zarf, filtre ve örnek kaynağı birer YAPI TAŞIDIR; onları `SynthParams`a göre
 * birleştiren `engine/`dir. Bir enstrümanın kimliği bu taşların seçiminden
 * değil, onları bir arada tutan modelden gelir (`instruments/`).
 */

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
  decodeWav,
  resampleLinear,
  trimSamples,
  loopSamples,
  applyEnvelopeToSample,
  processSample,
  mixSampleLayer,
} from './sample';
