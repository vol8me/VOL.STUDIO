import { MASTERING_PATHS, type MusicPlaybackMode } from '@volstudio/core/audio/music';
import { integratedLoudness, truePeakDb } from '../analysis/loudness';
import { masterChannels, measurePeak } from '../engine/master';
import { AudioParamError } from '../guard/errors';
import { checkChoice, checkNumber, checkObject } from '../guard/read';

/**
 * Çalma modeli mastering yolunu belirler ve müzik için masterMix'i çağıran
 * TEK yer burasıdır. Üç yol üç ayrı fiziksel gerçeğe karşılık gelir:
 *
 * - `one-shot-limited`: kuyruk kırpılır, sona sönüm konur, sınırlayıcı çalışır.
 * - `loop-cyclic`: sönüm ve kırpma YOK; yükseklik döngüsel ölçülür.
 * - `stem-linear`: yalnız ORTAK doğrusal kazanç. Sınırlayıcı doğrusal
 *   değildir; stem başına uygulanınca toplamları referans mix'ten ayrılır,
 *   yani "stem'lerin toplamı = mix" garantisi ölür. Tepe payı kazancı
 *   DÜŞÜREREK açılır, sinyali ezerek değil.
 */
export const MUSIC_MASTERING_SCHEMA = 'MusicMasteringPlanV1';

export const MASTERING_PATH_NAMES = ['one-shot-limited', 'loop-cyclic', 'stem-linear'] as const;
export type MasteringPath = (typeof MASTERING_PATH_NAMES)[number];

/** Müzik sınıfı politikası [−20, −12] LUFS ister; varsayılan hedef ortadır. */
export const DEFAULT_MUSIC_LUFS = -16;
export const MASTER_DC_BLOCK_HZ = 20;
export const MASTER_CEILING = 0.95;
export const MASTER_END_FADE_SECONDS = 0.04;
export const MAX_MASTER_GAIN_DB = 24;
/**
 * Kodek sonrası −1 dBTP politikası için kaynakta bırakılan pay. Ölçüldü:
 * libvorbis dönüşü true peak'i ~0.2 dB yükseltiyor (kaynakta −1.086 dBTP
 * olan referans cue kodek sonrası −0.88 çıktı ve kapı onu reddetti). 2 dB
 * pay bu büyümeyi sınırlayıcı EKLEMEDEN kapatır.
 */
export const TRUE_PEAK_MARGIN_DB = 2;

export interface MusicMasteringPlanV1 {
  readonly schema: typeof MUSIC_MASTERING_SCHEMA;
  readonly path: MasteringPath;
  readonly targetLufs: number;
  readonly gainDb: number;
  readonly limiter: { readonly threshold: number; readonly knee: number } | null;
  readonly ceiling: number | null;
  readonly trimSilence: boolean;
  readonly fadeOutSeconds: number;
}

export function masteringPathOf(playback: MusicPlaybackMode): MasteringPath {
  return MASTERING_PATHS[playback] as MasteringPath;
}

export function validateMasteringPlan(value: unknown, path: string): MusicMasteringPlanV1 {
  const o = checkObject(value, path, [
    'schema',
    'path',
    'targetLufs',
    'gainDb',
    'limiter',
    'ceiling',
    'trimSilence',
    'fadeOutSeconds',
  ]);
  if (o.schema !== MUSIC_MASTERING_SCHEMA) {
    throw new AudioParamError(`${path}.schema`, 'type', MUSIC_MASTERING_SCHEMA, o.schema);
  }
  const limiter =
    o.limiter === null || o.limiter === undefined
      ? null
      : (() => {
          const l = checkObject(o.limiter, `${path}.limiter`, ['threshold', 'knee']);
          return {
            threshold: checkNumber(l.threshold, `${path}.limiter.threshold`, { above: 0, max: 1 }),
            knee: checkNumber(l.knee, `${path}.limiter.knee`, { above: 0, max: 1 }),
          };
        })();
  if (typeof o.trimSilence !== 'boolean') {
    throw new AudioParamError(`${path}.trimSilence`, 'type', 'boolean olmalı', o.trimSilence);
  }
  return {
    schema: MUSIC_MASTERING_SCHEMA,
    path: checkChoice(o.path, `${path}.path`, MASTERING_PATH_NAMES),
    targetLufs: checkNumber(o.targetLufs, `${path}.targetLufs`, { min: -40, max: -6 }),
    gainDb: checkNumber(o.gainDb, `${path}.gainDb`, {
      min: -MAX_MASTER_GAIN_DB,
      max: MAX_MASTER_GAIN_DB,
    }),
    limiter,
    ceiling:
      o.ceiling === null || o.ceiling === undefined
        ? null
        : checkNumber(o.ceiling, `${path}.ceiling`, { above: 0, max: 1 }),
    trimSilence: o.trimSilence,
    fadeOutSeconds: checkNumber(o.fadeOutSeconds, `${path}.fadeOutSeconds`, { min: 0, max: 5 }),
  };
}

/**
 * Loop'un yüksekliği döngüsel ölçülür: tampon iki kez arka arkaya konur ve
 * İKİNCİ tur ölçülür. K-ağırlık filtresi ilk yüz milisaniyede ısınır; tek
 * turda ölçmek loop'un başını sistematik olarak kısık gösterir.
 */
export function cyclicLoudness(channels: readonly Float32Array[], sampleRate: number): number {
  const frames = channels[0].length;
  const doubled = channels.map((channel) => {
    const out = new Float32Array(frames * 2);
    out.set(channel, 0);
    out.set(channel, frames);
    return out;
  });
  const tail = doubled.map((channel) => channel.subarray(frames));
  return integratedLoudness(tail, sampleRate);
}

export function measureLoudness(
  channels: readonly Float32Array[],
  sampleRate: number,
  path: MasteringPath,
): number {
  return path === 'one-shot-limited'
    ? integratedLoudness(channels, sampleRate)
    : cyclicLoudness(channels, sampleRate);
}

export interface PlanInput {
  readonly playback: MusicPlaybackMode;
  readonly targetLufs: number;
  readonly measuredLufs: number;
  /** `stem-linear` için: bütün state kombinasyonlarının en yüksek tepesi. */
  readonly maxCombinationPeak?: number;
  /**
   * `stem-linear` için: aynı kombinasyonun ölçülen true-peak'i. Sınırlayıcısı
   * olmayan yolda pay yalnız kazanç düşürerek açılır; sınırlayıcılı yollarda
   * pay `refineForTruePeak` ile ÖLÇEREK bulunur (bkz. `bundle.ts`).
   */
  readonly maxCombinationTruePeakDb?: number;
}

/**
 * Kazancı ölçümden türetir. Doğrusal yolda tepe payı kazancı düşürür; ölçüm
 * yoksa (sessiz tampon) kazanç uygulanmaz — sessizliği hedefe çekmek zemin
 * gürültüsünü yükseltmek demektir.
 */
export function planMastering(input: PlanInput): MusicMasteringPlanV1 {
  const path = masteringPathOf(input.playback);
  let gainDb = Number.isFinite(input.measuredLufs) ? input.targetLufs - input.measuredLufs : 0;
  if (path === 'stem-linear') {
    const peak = input.maxCombinationPeak ?? 0;
    if (peak > 0) gainDb = Math.min(gainDb, 20 * Math.log10(MASTER_CEILING / peak));
    const truePeak = input.maxCombinationTruePeakDb;
    if (truePeak !== undefined && Number.isFinite(truePeak)) {
      gainDb = Math.min(gainDb, -TRUE_PEAK_MARGIN_DB - truePeak);
    }
  }
  gainDb = Math.max(-MAX_MASTER_GAIN_DB, Math.min(MAX_MASTER_GAIN_DB, gainDb));
  return {
    schema: MUSIC_MASTERING_SCHEMA,
    path,
    targetLufs: input.targetLufs,
    gainDb: Number(gainDb.toFixed(4)),
    limiter: path === 'stem-linear' ? null : { threshold: 0.7, knee: 0.28 },
    ceiling: path === 'stem-linear' ? null : MASTER_CEILING,
    trimSilence: path === 'one-shot-limited',
    fadeOutSeconds: path === 'one-shot-limited' ? MASTER_END_FADE_SECONDS : 0,
  };
}

/** Planı kanallara YERİNDE uygular; sıra `engine/master.ts`in sırasıdır. */
export function applyMastering(
  channels: readonly Float32Array[],
  sampleRate: number,
  plan: MusicMasteringPlanV1,
): void {
  masterChannels(channels, sampleRate, {
    level: { mode: 'none', gain: Math.pow(10, plan.gainDb / 20) },
    dcBlockHz: MASTER_DC_BLOCK_HZ,
    ...(plan.limiter ? { limiter: plan.limiter } : {}),
    ...(plan.ceiling === null ? {} : { ceiling: plan.ceiling }),
    fadeOutSeconds: plan.fadeOutSeconds,
  });
}

export interface MixMeasurementV1 {
  readonly integratedLufs: number;
  readonly samplePeak: number;
  readonly truePeakDbtp: number;
}

export function measureMix(
  channels: readonly Float32Array[],
  sampleRate: number,
  path: MasteringPath,
): MixMeasurementV1 {
  return {
    integratedLufs: Number(measureLoudness(channels, sampleRate, path).toFixed(3)),
    samplePeak: Number(measurePeak(channels).toFixed(6)),
    truePeakDbtp: Number(truePeakDb(channels, sampleRate).toFixed(3)),
  };
}
