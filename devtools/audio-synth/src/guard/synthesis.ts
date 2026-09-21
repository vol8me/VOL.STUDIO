import type { Curve, FilterType, LfoTarget, Waveform } from '../types';
import { AudioParamError } from './errors';
import {
  checkArray,
  checkChoice,
  checkNumber,
  checkObject,
  readBoolean,
  readChoice,
  readNumber,
  requireNumber,
  type ParamObject,
} from './read';

export type TonalWave = Exclude<Waveform, 'noise' | 'pink' | 'brown'>;

export const TONAL_WAVES: readonly TonalWave[] = [
  'sine',
  'triangle',
  'sawtooth',
  'square',
  'pulse',
];
export const WAVEFORMS: readonly Waveform[] = [...TONAL_WAVES, 'noise', 'pink', 'brown'];
export const CURVES: readonly Curve[] = ['linear', 'exponential', 'cosine'];
const FILTER_TYPES: readonly FilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch'];
const LFO_TARGETS: readonly LfoTarget[] = ['pitch', 'filter', 'amplitude'];

const SECONDS = { min: 0 } as const;
const UNIT = { min: 0, max: 1 } as const;

export interface ResolvedEnvelope {
  readonly attack: number;
  readonly hold: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
  readonly sustainLevel: number;
  readonly curve: Curve;
  readonly loop: boolean;
}

const ENVELOPE_KEYS = [
  'attack',
  'hold',
  'decay',
  'sustain',
  'release',
  'sustainLevel',
  'curve',
  'loop',
];

export function resolveEnvelope(params: unknown, path: string): ResolvedEnvelope {
  const o = checkObject(params, path, ENVELOPE_KEYS);
  return {
    attack: readNumber(o, 'attack', path, SECONDS, 0),
    hold: readNumber(o, 'hold', path, SECONDS, 0),
    decay: readNumber(o, 'decay', path, SECONDS, 0),
    sustain: readNumber(o, 'sustain', path, SECONDS, 0),
    release: readNumber(o, 'release', path, SECONDS, 0),
    sustainLevel: readNumber(o, 'sustainLevel', path, UNIT, 0.5),
    curve: readChoice(o, 'curve', path, CURVES, 'exponential'),
    loop: readBoolean(o, 'loop', path, false),
  };
}

export interface ResolvedFilter {
  readonly type: FilterType;
  readonly poles: 1 | 2 | 4;
  readonly cutoff: number;
  readonly slide: number;
  readonly resonance: number;
  /** `resonance`ın biquad Q karşılığı: 0 → 0.707 (Butterworth), 1 → 20. */
  readonly q: number;
  readonly envelope?: ResolvedEnvelope;
  readonly envAmount: number;
}

const FILTER_KEYS = ['cutoff', 'slide', 'resonance', 'type', 'poles', 'envelope', 'envAmount'];

/**
 * `kind` alanın yuvasıdır (`lowpass`/`highpass`); `type` verilmezse tip
 * yuvadan gelir. 1 kutuplu RC yalnız alçak/yüksek geçiren olabilir — bant
 * geçiren ya da çentik istenip 1 kutup çıkarsa bu SESSİZCE başka bir filtre
 * render etmek olurdu, o yüzden birleşim reddedilir.
 */
export function resolveFilter(
  params: unknown,
  path: string,
  kind: 'lowpass' | 'highpass',
): ResolvedFilter {
  const o = checkObject(params, path, FILTER_KEYS);
  const cutoff = requireNumber(o, 'cutoff', path, { above: 0 });
  const slide = readNumber(o, 'slide', path, {}, 0);
  const resonance = readNumber(o, 'resonance', path, UNIT, 0);
  const type = readChoice(o, 'type', path, FILTER_TYPES, kind);
  let poles: 1 | 2 | 4 = resonance > 0 ? 2 : 1;
  if (o.poles !== undefined) {
    if (o.poles !== 1 && o.poles !== 2 && o.poles !== 4) {
      throw new AudioParamError(`${path}.poles`, 'type', '1, 2 ya da 4 olmalı', o.poles);
    }
    poles = o.poles;
  }
  if (poles === 1 && (type === 'bandpass' || type === 'notch')) {
    throw new AudioParamError(
      `${path}.type`,
      'combination',
      `1 kutuplu filtre yalnız lowpass/highpass olabilir; ${type} için poles 2 ya da 4 verilmeli`,
      type,
    );
  }
  return {
    type,
    poles,
    cutoff,
    slide,
    resonance,
    q: resonance > 0 ? 0.707 + resonance * 19.293 : 0.707,
    envelope:
      o.envelope === undefined ? undefined : resolveEnvelope(o.envelope, `${path}.envelope`),
    envAmount: readNumber(o, 'envAmount', path, UNIT, 0),
  };
}

export interface ResolvedFm {
  readonly modulatorWave: TonalWave;
  readonly ratio: number;
  readonly index: number;
  readonly modulatorLevel: number;
  readonly feedback: number;
  readonly modulatorEnvelope?: ResolvedEnvelope;
}

const FM_KEYS = [
  'modulatorWave',
  'ratio',
  'index',
  'modulatorLevel',
  'feedback',
  'modulatorEnvelope',
];

export function resolveFm(params: unknown, path: string): ResolvedFm {
  const o = checkObject(params, path, FM_KEYS);
  return {
    modulatorWave: readChoice(o, 'modulatorWave', path, TONAL_WAVES, 'sine'),
    ratio: readNumber(o, 'ratio', path, { min: 0 }, 1),
    index: readNumber(o, 'index', path, { min: 0 }, 0),
    modulatorLevel: readNumber(o, 'modulatorLevel', path, { min: 0 }, 1),
    feedback: readNumber(o, 'feedback', path, { min: -0.99, max: 0.99 }, 0),
    modulatorEnvelope:
      o.modulatorEnvelope === undefined
        ? undefined
        : resolveEnvelope(o.modulatorEnvelope, `${path}.modulatorEnvelope`),
  };
}

export interface ResolvedHarmonic {
  readonly ratio: number;
  readonly gain: number;
  readonly phase: number;
}

export function resolveHarmonics(params: unknown, path: string): ResolvedHarmonic[] {
  return checkArray(params, path).map((item, index) => {
    const at = `${path}[${index}]`;
    const o = checkObject(item, at, ['ratio', 'gain', 'phase']);
    return {
      ratio: requireNumber(o, 'ratio', at, { above: 0 }),
      gain: requireNumber(o, 'gain', at, UNIT),
      phase: readNumber(o, 'phase', at, {}, 0),
    };
  });
}

export interface ResolvedPitchJump {
  readonly amount: number;
  readonly time: number;
  readonly duration: number;
}

export function resolvePitchJump(params: unknown, path: string): ResolvedPitchJump {
  const o = checkObject(params, path, ['amount', 'time', 'duration']);
  return {
    amount: requireNumber(o, 'amount', path),
    time: requireNumber(o, 'time', path, UNIT),
    duration: readNumber(o, 'duration', path, { above: 0 }, 0.01),
  };
}

export interface ResolvedLfo {
  readonly target: LfoTarget;
  readonly rate: number;
  readonly depth: number;
  readonly wave: TonalWave;
  readonly phase: number;
}

export function resolveLfos(params: unknown, path: string): ResolvedLfo[] {
  return checkArray(params, path).map((item, index) => {
    const at = `${path}[${index}]`;
    const o = checkObject(item, at, ['target', 'rate', 'depth', 'wave', 'phase']);
    if (o.target === undefined) {
      throw new AudioParamError(`${at}.target`, 'required', 'zorunlu alan eksik', undefined);
    }
    const target = checkChoice(o.target, `${at}.target`, LFO_TARGETS);
    return {
      target,
      rate: requireNumber(o, 'rate', at, { min: 0 }),
      depth: requireNumber(o, 'depth', at, target === 'amplitude' ? UNIT : {}),
      wave: readChoice(o, 'wave', at, TONAL_WAVES, 'sine'),
      phase: readNumber(o, 'phase', at, {}, 0),
    };
  });
}

export type SampleData = Float32Array | ArrayBuffer | Uint8Array;

export interface ResolvedSample {
  readonly data: SampleData;
  readonly sampleRate?: number;
  readonly trim?: { readonly start: number; readonly end?: number };
  readonly pitchShift: number;
  readonly loop: boolean;
  readonly loopCrossfade: boolean;
  readonly gain: number;
  readonly envelope?: ResolvedEnvelope;
}

const SAMPLE_KEYS = [
  'data',
  'sampleRate',
  'trim',
  'pitchShift',
  'loop',
  'loopCrossfade',
  'gain',
  'envelope',
];

function resolveTrim(value: unknown, path: string): ResolvedSample['trim'] {
  const o: ParamObject = checkObject(value, path, ['start', 'end']);
  return {
    start: readNumber(o, 'start', path, SECONDS, 0),
    end: o.end === undefined ? undefined : checkNumber(o.end, `${path}.end`),
  };
}

/**
 * `data` Float32Array ise örnekler de sınırda taranır: kaynak veride tek bir
 * NaN, resample ve zarf zincirinden geçip tüm mix'e bulaşır.
 */
export function resolveSample(params: unknown, path: string): ResolvedSample {
  const o = checkObject(params, path, SAMPLE_KEYS);
  const data = o.data;
  if (
    !(data instanceof Float32Array || data instanceof ArrayBuffer || data instanceof Uint8Array)
  ) {
    throw new AudioParamError(
      `${path}.data`,
      'type',
      'Float32Array, ArrayBuffer ya da Uint8Array olmalı',
      data,
    );
  }
  if (data instanceof Float32Array) {
    for (let i = 0; i < data.length; i++) {
      if (!Number.isFinite(data[i])) {
        throw new AudioParamError(`${path}.data[${i}]`, 'non-finite', 'sonlu olmalı', data[i]);
      }
    }
  }
  return {
    data,
    sampleRate:
      o.sampleRate === undefined
        ? undefined
        : checkNumber(o.sampleRate, `${path}.sampleRate`, { above: 0 }),
    trim: o.trim === undefined ? undefined : resolveTrim(o.trim, `${path}.trim`),
    pitchShift: readNumber(o, 'pitchShift', path, { min: -60, max: 60 }, 0),
    loop: readBoolean(o, 'loop', path, true),
    loopCrossfade: readBoolean(o, 'loopCrossfade', path, false),
    gain: readNumber(o, 'gain', path, UNIT, 1),
    envelope:
      o.envelope === undefined ? undefined : resolveEnvelope(o.envelope, `${path}.envelope`),
  };
}
