/** Ses düzenleme tarifi — zamanlar FRAME cinsindedir. */

export type AudioFadeCurve = 'linear' | 'exponential' | 'logarithmic';

export interface AudioTrimOperation {
  kind: 'trim';
  startFrame: number;
  endFrame: number;
}

export interface AudioGainOperation {
  kind: 'gain';
  /** Desibel; negatif değer kısar. */
  decibels: number;
}

export interface AudioFadeOperation {
  kind: 'fadeIn' | 'fadeOut';
  startFrame: number;
  durationFrames: number;
  curve?: AudioFadeCurve;
}

export interface AudioNormalizeOperation {
  kind: 'normalize';
  mode: 'peak' | 'lufs';
  /** peak için dBFS hedefi, lufs için LUFS hedefi. */
  target: number;
}

export interface AudioReverseOperation {
  kind: 'reverse';
}

export interface AudioChannelOperation {
  kind: 'channels';
  target: 1 | 2;
  /** Stereo kanalları takas et. */
  swap?: boolean;
}

export interface AudioResampleOperation {
  kind: 'resample';
  sampleRate: number;
}

export interface AudioFilterOperation {
  kind: 'highpass' | 'lowpass';
  frequency: number;
}

export interface AudioEqOperation {
  kind: 'eq';
  frequency: number;
  gainDb: number;
  q: number;
}

export interface AudioDynamicsOperation {
  kind: 'compressor' | 'limiter';
  thresholdDb: number;
  ratio?: number;
  attackMs?: number;
  releaseMs?: number;
}

export type AudioEditOperation =
  | AudioTrimOperation
  | AudioGainOperation
  | AudioFadeOperation
  | AudioNormalizeOperation
  | AudioReverseOperation
  | AudioChannelOperation
  | AudioResampleOperation
  | AudioFilterOperation
  | AudioEqOperation
  | AudioDynamicsOperation;

export interface AudioLoopRegion {
  startFrame: number;
  endFrame: number;
  crossfadeFrames: number;
}

export interface AudioSourceReference {
  assetId?: string;
  path?: string;
  revision?: string;
}

export interface AudioOutputConfig {
  path?: string;
  format: 'ogg' | 'wav';
  sampleRate?: number;
  /** Vorbis kalitesi -1..10. */
  vorbisQuality?: number;
}

/**
 * `.volaudio.json` şeması.
 *
 * Zamanlar kayan noktalı SANİYE değil FRAME tutar: saniye, sample-rate
 * değiştiğinde kayar ve trim sınırları bir örnek kayarak tık sesi üretir.
 */
export interface VolAudioDocumentV1 {
  schemaVersion: 1;
  source: AudioSourceReference;
  operations: AudioEditOperation[];
  loop?: AudioLoopRegion;
  output: AudioOutputConfig;
  metadata?: Record<string, unknown>;
}

export const AUDIO_DOCUMENT_SUFFIX = '.volaudio.json';

export interface AudioRenderRequest {
  expectedRevision: string;
  operations: AudioEditOperation[];
}

export interface AudioRenderResponse {
  assetId: string;
  revision: string;
  bytes: number;
}

export interface AudioPeakLevel {
  /** Bu seviyede bir peak kaç frame'i temsil ediyor. */
  framesPerPeak: number;
  /** Kanal başına `[min, max, min, max, …]`. */
  channels: Float32Array[];
}

export interface AudioPeakPyramid {
  sampleRate: number;
  channelCount: number;
  frameCount: number;
  levels: AudioPeakLevel[];
}
