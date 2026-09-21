import type { StereoWidthParams } from '../types';
import { AudioParamError } from './errors';
import { checkNumber, checkObject, readChoice, readNumber, requireNumber } from './read';

const UNIT = { min: 0, max: 1 } as const;
const BIPOLAR_FEEDBACK = { min: -0.95, max: 0.95 } as const;

export interface ResolvedReverb {
  readonly amount: number;
  /** RT60: kuyruğun 60 dB düşmesi için geçen süre (saniye). */
  readonly decay: number;
  readonly roomSize: number;
  readonly damp: number;
  readonly preDelay: number;
}

/**
 * `decay` üst sınırı 60 sn: bunun üstü pratikte bitmeyen sustain'dir ve
 * kuyruk hesabını (tampon boyutu) anlamsızlaştırır. `preDelay` 1 sn üstü
 * ön-gecikme değil ayrı bir yankıdır; ona `delay` efekti karşılık gelir.
 */
export function resolveReverbParams(params: unknown, path: string): ResolvedReverb {
  const o = checkObject(params, path, ['amount', 'decay', 'roomSize', 'damp', 'preDelay']);
  const roomSize = readNumber(o, 'roomSize', path, UNIT, 0.5);
  return {
    amount: readNumber(o, 'amount', path, UNIT, 0.3),
    decay: readNumber(o, 'decay', path, { above: 0, max: 60 }, 0.15 + 0.7 * roomSize),
    roomSize,
    damp: readNumber(o, 'damp', path, UNIT, 0.5),
    preDelay: readNumber(o, 'preDelay', path, { min: 0, max: 1 }, 0),
  };
}

export interface ResolvedDelay {
  readonly time: number;
  readonly feedback: number;
  readonly mix: number;
}

export function resolveDelayParams(params: unknown, path: string): ResolvedDelay {
  const o = checkObject(params, path, ['time', 'feedback', 'mix']);
  return {
    time: requireNumber(o, 'time', path, { above: 0, max: 10 }),
    feedback: readNumber(o, 'feedback', path, UNIT, 0.3),
    mix: readNumber(o, 'mix', path, UNIT, 0.3),
  };
}

export interface ResolvedDistortion {
  readonly amount: number;
  readonly type: 'soft' | 'hard' | 'foldback';
  readonly mix: number;
}

export function resolveDistortionParams(params: unknown, path: string): ResolvedDistortion {
  const o = checkObject(params, path, ['amount', 'type', 'mix']);
  return {
    amount: requireNumber(o, 'amount', path, UNIT),
    type: readChoice(o, 'type', path, ['soft', 'hard', 'foldback'] as const, 'soft'),
    mix: readNumber(o, 'mix', path, UNIT, 1),
  };
}

export interface ResolvedChorus {
  readonly depth: number;
  readonly rate: number;
  readonly mix: number;
}

/** Derinlik 15 ms taban gecikmenin altında kalmalı; 14 ms güvenli üst sınırdır. */
export function resolveChorusParams(params: unknown, path: string): ResolvedChorus {
  const o = checkObject(params, path, ['depth', 'rate', 'mix']);
  return {
    depth: readNumber(o, 'depth', path, { min: 0, max: 14 }, 2),
    rate: readNumber(o, 'rate', path, { min: 0 }, 0.5),
    mix: readNumber(o, 'mix', path, UNIT, 0.3),
  };
}

export interface ResolvedFlanger {
  readonly time: number;
  readonly depth: number;
  readonly rate: number;
  readonly feedback: number;
  readonly mix: number;
}

export function resolveFlangerParams(params: unknown, path: string): ResolvedFlanger {
  const o = checkObject(params, path, ['time', 'depth', 'rate', 'feedback', 'mix']);
  const time = readNumber(o, 'time', path, { min: 0.1, max: 50 }, 1);
  const depth = readNumber(o, 'depth', path, { min: 0 }, 0.5);
  if (depth > time) {
    throw new AudioParamError(
      `${path}.depth`,
      'combination',
      `taban gecikmeyi (time=${time} ms) aşamaz; gecikme negatife düşerdi`,
      depth,
    );
  }
  return {
    time,
    depth,
    rate: readNumber(o, 'rate', path, { min: 0 }, 0.5),
    feedback: readNumber(o, 'feedback', path, BIPOLAR_FEEDBACK, 0),
    mix: readNumber(o, 'mix', path, UNIT, 0.5),
  };
}

export interface ResolvedPhaser {
  readonly minFreq: number;
  readonly maxFreq: number;
  readonly rate: number;
  readonly wave: 'sine' | 'triangle';
  readonly stages: number;
  readonly feedback: number;
  readonly mix: number;
}

export function resolvePhaserParams(params: unknown, path: string): ResolvedPhaser {
  const o = checkObject(params, path, [
    'minFreq',
    'maxFreq',
    'rate',
    'wave',
    'stages',
    'feedback',
    'mix',
  ]);
  const minFreq = readNumber(o, 'minFreq', path, { min: 20, max: 20000 }, 300);
  const maxFreq = readNumber(o, 'maxFreq', path, { min: 20, max: 20000 }, 3000);
  if (!(maxFreq > minFreq)) {
    throw new AudioParamError(
      `${path}.maxFreq`,
      'combination',
      `minFreq (${minFreq} Hz) değerinden büyük olmalı`,
      maxFreq,
    );
  }
  return {
    minFreq,
    maxFreq,
    rate: readNumber(o, 'rate', path, { min: 0 }, 0.5),
    wave: readChoice(o, 'wave', path, ['sine', 'triangle'] as const, 'sine'),
    stages: readNumber(o, 'stages', path, { min: 1, max: 16, integer: true }, 4),
    feedback: readNumber(o, 'feedback', path, BIPOLAR_FEEDBACK, 0),
    mix: readNumber(o, 'mix', path, UNIT, 0.5),
  };
}

export function resolveStereoWidth(params: unknown, path: string): number {
  if (typeof params === 'number') return checkNumber(params, path, { min: 0, max: 2 });
  const o = checkObject(params as StereoWidthParams, path, ['width']);
  return requireNumber(o, 'width', path, { min: 0, max: 2 });
}

export function resolvePan(value: unknown, path: string): number {
  return checkNumber(value, path, { min: -1, max: 1 });
}
