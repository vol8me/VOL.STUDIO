import type { Curve, Waveform } from '../types';
import { AudioParamError } from './errors';
import {
  resolveChorusParams,
  resolveDelayParams,
  resolveDistortionParams,
  resolveFlangerParams,
  resolvePan,
  resolvePhaserParams,
  resolveReverbParams,
  resolveStereoWidth,
  type ResolvedChorus,
  type ResolvedDelay,
  type ResolvedDistortion,
  type ResolvedFlanger,
  type ResolvedPhaser,
  type ResolvedReverb,
} from './effects';
import {
  checkChoice,
  checkNumber,
  checkObject,
  checkSampleRate,
  readBoolean,
  readChoice,
  readNumber,
  type ParamObject,
} from './read';
import {
  CURVES,
  WAVEFORMS,
  resolveEnvelope,
  resolveFilter,
  resolveFm,
  resolveHarmonics,
  resolveLfos,
  resolvePitchJump,
  resolveSample,
  type ResolvedEnvelope,
  type ResolvedFilter,
  type ResolvedFm,
  type ResolvedHarmonic,
  type ResolvedLfo,
  type ResolvedPitchJump,
  type ResolvedSample,
} from './synthesis';

export const DEFAULT_SAMPLE_RATE = 44100;

/**
 * Master (bus) efekt zincirinin alanları, zincir sırasıyla. Nota başına
 * render eden bir düzenleyici bunları nota parametrelerinden AYIKLAR ve
 * final mix'e bir kez uygular; liste tek yerde durur ki yeni bir bus efekti
 * eklendiğinde ayıklama listesi ondan geri kalmasın.
 */
export const BUS_EFFECT_KEYS = [
  'delay',
  'flanger',
  'phaser',
  'chorus',
  'pan',
  'reverb',
  'stereoWidth',
] as const;

export interface ResolvedBusEffects {
  readonly delay?: ResolvedDelay;
  readonly flanger?: ResolvedFlanger;
  readonly phaser?: ResolvedPhaser;
  readonly chorus?: ResolvedChorus;
  readonly pan?: number;
  readonly reverb?: ResolvedReverb;
  readonly stereoWidth?: number;
}

export function resolveBusEffects(o: ParamObject, path: string): ResolvedBusEffects {
  const at = (key: string): string => (path === '' ? key : `${path}.${key}`);
  return {
    delay: o.delay === undefined ? undefined : resolveDelayParams(o.delay, at('delay')),
    flanger: o.flanger === undefined ? undefined : resolveFlangerParams(o.flanger, at('flanger')),
    phaser: o.phaser === undefined ? undefined : resolvePhaserParams(o.phaser, at('phaser')),
    chorus: o.chorus === undefined ? undefined : resolveChorusParams(o.chorus, at('chorus')),
    pan: o.pan === undefined ? undefined : resolvePan(o.pan, at('pan')),
    reverb: o.reverb === undefined ? undefined : resolveReverbParams(o.reverb, at('reverb')),
    stereoWidth:
      o.stereoWidth === undefined
        ? undefined
        : resolveStereoWidth(o.stereoWidth, at('stereoWidth')),
  };
}

export interface ResolvedSynthParams {
  readonly sampleRate: number;
  readonly duration: number;
  readonly repeat: number;
  readonly repeatTime: number;
  /** `duration + (repeat - 1) · repeatTime`: çıkış tamponunun gerçek süresi. */
  readonly totalDuration: number;
  readonly seed?: number;
  readonly normalize: boolean;
  readonly waves: readonly Waveform[];
  readonly frequency: number;
  readonly detune: number;
  readonly slide: number;
  readonly slideCurve: Curve;
  readonly pulseWidth: number;
  readonly fm?: ResolvedFm;
  readonly harmonics?: readonly ResolvedHarmonic[];
  readonly sample?: ResolvedSample;
  readonly pitchJump?: ResolvedPitchJump;
  readonly envelope?: ResolvedEnvelope;
  readonly lowpass?: ResolvedFilter;
  readonly highpass?: ResolvedFilter;
  readonly vibratoDepth: number;
  readonly vibratoRate: number;
  readonly tremoloDepth: number;
  readonly tremoloRate: number;
  readonly distortion?: ResolvedDistortion;
  readonly gain: number;
  readonly lfos: readonly ResolvedLfo[];
  readonly bus: ResolvedBusEffects;
}

const SYNTH_KEYS = [
  'sampleRate',
  'seed',
  'normalize',
  'wave',
  'frequency',
  'detune',
  'slide',
  'slideCurve',
  'pulseWidth',
  'fm',
  'harmonics',
  'sample',
  'pitchJump',
  'envelope',
  'lowpass',
  'highpass',
  'vibratoDepth',
  'vibratoRate',
  'tremoloDepth',
  'tremoloRate',
  'distortion',
  'repeat',
  'repeatTime',
  'duration',
  'gain',
  'lfos',
  ...BUS_EFFECT_KEYS,
];

function resolveWaves(value: unknown): readonly Waveform[] {
  if (value === undefined) return ['sine'];
  if (!Array.isArray(value)) return [checkChoice(value, 'wave', WAVEFORMS)];
  if (value.length === 0) throw new AudioParamError('wave', 'range', 'boş dizi olamaz', value);
  return value.map((item, index) => checkChoice(item, `wave[${index}]`, WAVEFORMS));
}

/**
 * `SynthParams` için TEK doğrulama/çözümleme sınırı. Render bundan önce
 * hiçbir tampon ayırmaz; bozuk alan `AudioParamError` ile tam yoluyla
 * reddedilir.
 *
 * Politika: sonlu olmayan değer, yanlış tip, bilinmeyen alan ve belgelenmiş
 * aralığın dışı REDDEDİLİR. Kelepçe yalnız belgelenmiş iki durumda kalır:
 * örnek oranına bağlı Nyquist tavanları (anlık frekans, filtre kesimi,
 * phaser üst frekansı modülasyonla oraya itilebilir) ve kararlılık tavanları
 * (delay feedback 0.99, `pulseWidth` [0.01, 0.99]).
 */
export function resolveSynthParams(params: unknown): ResolvedSynthParams {
  const o = checkObject(params, '', SYNTH_KEYS);
  const sampleRate =
    o.sampleRate === undefined ? DEFAULT_SAMPLE_RATE : checkSampleRate(o.sampleRate, 'sampleRate');
  if (o.duration === undefined) {
    throw new AudioParamError('duration', 'required', 'zorunlu alan eksik', undefined);
  }
  const duration = checkNumber(o.duration, 'duration', { above: 0 });
  if (Math.floor(sampleRate * duration) < 1) {
    throw new AudioParamError('duration', 'range', 'en az bir örnek sürmeli', duration);
  }
  const repeat = readNumber(o, 'repeat', '', { min: 1, integer: true }, 1);
  const repeatTime = readNumber(o, 'repeatTime', '', { min: 0 }, 0);
  const frequency = readNumber(o, 'frequency', '', { above: 0 }, 440);
  if (frequency >= sampleRate / 2) {
    throw new AudioParamError(
      'frequency',
      'range',
      `Nyquist (${sampleRate / 2} Hz) altında olmalı`,
      frequency,
    );
  }

  return {
    sampleRate,
    duration,
    repeat,
    repeatTime,
    totalDuration: duration + (repeat - 1) * repeatTime,
    seed: o.seed === undefined ? undefined : checkNumber(o.seed, 'seed'),
    normalize: readBoolean(o, 'normalize', '', true),
    waves: resolveWaves(o.wave),
    frequency,
    detune: readNumber(o, 'detune', '', {}, 0),
    slide: readNumber(o, 'slide', '', {}, 0),
    slideCurve: readChoice(o, 'slideCurve', '', CURVES, 'exponential'),
    pulseWidth: Math.min(
      0.99,
      Math.max(0.01, readNumber(o, 'pulseWidth', '', { min: 0, max: 1 }, 0.5)),
    ),
    fm: o.fm === undefined ? undefined : resolveFm(o.fm, 'fm'),
    harmonics: o.harmonics === undefined ? undefined : resolveHarmonics(o.harmonics, 'harmonics'),
    sample: o.sample === undefined ? undefined : resolveSample(o.sample, 'sample'),
    pitchJump: o.pitchJump === undefined ? undefined : resolvePitchJump(o.pitchJump, 'pitchJump'),
    envelope: o.envelope === undefined ? undefined : resolveEnvelope(o.envelope, 'envelope'),
    lowpass: o.lowpass === undefined ? undefined : resolveFilter(o.lowpass, 'lowpass', 'lowpass'),
    highpass:
      o.highpass === undefined ? undefined : resolveFilter(o.highpass, 'highpass', 'highpass'),
    vibratoDepth: readNumber(o, 'vibratoDepth', '', { min: 0 }, 0),
    vibratoRate: readNumber(o, 'vibratoRate', '', { min: 0 }, 0),
    tremoloDepth: readNumber(o, 'tremoloDepth', '', { min: 0, max: 1 }, 0),
    tremoloRate: readNumber(o, 'tremoloRate', '', { min: 0 }, 0),
    distortion:
      o.distortion === undefined ? undefined : resolveDistortionParams(o.distortion, 'distortion'),
    gain: readNumber(o, 'gain', '', { min: 0, max: 1 }, 1),
    lfos: o.lfos === undefined ? [] : resolveLfos(o.lfos, 'lfos'),
    bus: resolveBusEffects(o, ''),
  };
}

/** Yalnız bus efektlerini çözer; `applyGlobalEffects`e doğrudan gelen parametre için. */
export function resolveBusParams(params: unknown): ResolvedBusEffects {
  return resolveBusEffects(checkObject(params, '', SYNTH_KEYS), '');
}
