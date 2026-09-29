import { DEFAULT_SEED } from '@volstudio/core/random';
import { downsample2x } from '../../engine/render';
import { qualityProfile } from '../../engine/session';
import { assertRenderBudget, estimateFrameCost } from '../../guard/budget';
import { AudioParamError } from '../../guard/errors';
import type { WaveSampleFn } from '../../synthesis/waveforms';
import {
  checkChoice,
  checkNumber,
  checkObject,
  checkSampleRate,
  readNumber,
} from '../../guard/read';
import type { SynthesisResult } from '../../types';
import { normalizePeak, saturate } from './components';
import {
  DRUM_MODELS,
  DRUM_NOISE_DEFAULT,
  DRUM_RENDERERS,
  naturalSeconds,
  type DrumModel,
  type ResolvedDrum,
} from './models';

/**
 * Parametrik davul modeli: aynı yedi model hem müzik kitinin parçası hem
 * akustik programın `source.drum` düğümü olur; oyun başına özel davul
 * sentezi yazılmaz. Çıktı mono, tepe değeri `level`dir.
 */
export interface DrumParams {
  readonly model: DrumModel;
  /** 0–1; tınıyı değiştirir, seviyeyi değil. Varsayılan 0.8. */
  readonly velocity?: number;
  /** Yarım ton, −24…24. */
  readonly tune?: number;
  readonly decay?: number;
  readonly tone?: number;
  readonly attack?: number;
  /** Gürültü payı ÇARPANI (0–2): 1 modelin kendi payıdır (`DRUM_NOISE_DEFAULT`). */
  readonly noise?: number;
  readonly drive?: number;
  /** Yalnız hat: 0 kapalı, 1 açık. */
  readonly open?: number;
  /** Tepe seviyesi, varsayılan 0.9. */
  readonly level?: number;
  readonly seed?: number;
  readonly sampleRate?: number;
  /** Boğma (choke): bu süreden sonra 5 ms'de kesilir; verilmezse doğal sönüm. */
  readonly gateSeconds?: number;
}

const DRUM_KEYS = [
  'model',
  'velocity',
  'tune',
  'decay',
  'tone',
  'attack',
  'noise',
  'drive',
  'open',
  'level',
  'seed',
  'sampleRate',
  'gateSeconds',
] as const;

const DEFAULT_DRUM_VELOCITY = 0.8;
const MAX_DRUM_SECONDS = 4;
export const CHOKE_FADE_SECONDS = 0.005;
/** Tavanda kesilen uzun sönümün (zil) kuyruğu tık bırakmasın diye. */
export const END_FADE_SECONDS = 0.02;
/** Bileşen başına örnek işi (gövde kipleri + üç süzgeç + metalik küme), bütçe için üst sınır. */
const WORK_PER_FRAME = 60;

const UNIT = { min: 0, max: 1 } as const;

export function resolveDrum(value: unknown, path = 'drum'): ResolvedDrum {
  const o = checkObject(value, path, DRUM_KEYS);
  const model = checkChoice(o.model, `${path}.model`, DRUM_MODELS);
  if (model !== 'hat' && o.open !== undefined) {
    throw new AudioParamError(`${path}.open`, 'combination', 'açıklık yalnız hat içindir', o.open);
  }
  return {
    model,
    velocity: readNumber(o, 'velocity', path, UNIT, DEFAULT_DRUM_VELOCITY),
    tune: readNumber(o, 'tune', path, { min: -24, max: 24 }, 0),
    decay: readNumber(o, 'decay', path, UNIT, 0.5),
    tone: readNumber(o, 'tone', path, UNIT, 0.5),
    attack: readNumber(o, 'attack', path, UNIT, 0.5),
    noise: DRUM_NOISE_DEFAULT[model] * readNumber(o, 'noise', path, { min: 0, max: 2 }, 1),
    drive: readNumber(o, 'drive', path, UNIT, 0),
    open: readNumber(o, 'open', path, UNIT, 0),
    level: readNumber(o, 'level', path, { above: 0, max: 1 }, 0.9),
    seed: readNumber(o, 'seed', path, { min: 0, max: 0xffff_ffff, integer: true }, DEFAULT_SEED),
  };
}

/** Doğal uzunluk (sn): en uzun bileşenin −60 dB süresi, en çok `MAX_DRUM_SECONDS`. */
export function drumSeconds(d: ResolvedDrum): number {
  return Math.min(MAX_DRUM_SECONDS, naturalSeconds(d) + 0.01);
}

function drumLength(d: ResolvedDrum, gateSeconds: number | undefined): number {
  const natural = drumSeconds(d);
  return gateSeconds === undefined ? natural : Math.min(natural, gateSeconds + CHOKE_FADE_SECONDS);
}

/** Çözülmüş modeli çıkış oranında mono tampona render eder. */
export function renderDrum(
  d: ResolvedDrum,
  sampleRate: number,
  gateSeconds?: number,
  wave?: WaveSampleFn,
): Float32Array {
  const oversample = qualityProfile().voiceOversample;
  const seconds = drumLength(d, gateSeconds);
  assertRenderBudget(
    estimateFrameCost(sampleRate * oversample, seconds, 4, WORK_PER_FRAME),
    'drum',
  );
  const rate = sampleRate * oversample;
  const internal = new Float32Array(Math.max(1, Math.ceil(seconds * rate)));
  DRUM_RENDERERS[d.model](internal, rate, d, wave);
  saturate(internal, d.drive);
  const out = oversample === 2 ? downsample2x(internal, rate, sampleRate) : internal;
  if (gateSeconds !== undefined && gateSeconds < drumSeconds(d)) {
    const start = Math.min(out.length - 1, Math.floor(gateSeconds * sampleRate));
    const fade = Math.max(1, out.length - 1 - start);
    for (let i = start; i < out.length; i++) out[i] *= 1 - (i - start) / fade;
  } else {
    const fade = Math.min(out.length, Math.round(END_FADE_SECONDS * sampleRate));
    for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  }
  normalizePeak(out, d.level);
  return out;
}

/** Tek vuruş: doğrulanmış parametrelerden mono `SynthesisResult`. */
export function drum(params: DrumParams): SynthesisResult {
  const d = resolveDrum(params);
  const sampleRate =
    params.sampleRate === undefined ? 44100 : checkSampleRate(params.sampleRate, 'drum.sampleRate');
  const gate =
    params.gateSeconds === undefined
      ? undefined
      : checkNumber(params.gateSeconds, 'drum.gateSeconds', { above: 0 });
  const channel = renderDrum(d, sampleRate, gate);
  return { channels: [channel], sampleRate, duration: channel.length / sampleRate };
}

export { DRUM_MODELS, DRUM_NOISE_DEFAULT, type DrumModel, type ResolvedDrum };
