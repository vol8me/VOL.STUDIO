import { maxMomentaryLoudness } from '../analysis/loudness';
import { limitTruePeak } from '../effects/limiter';
import { AudioParamError } from '../guard/errors';
import { checkArray, checkNumber, checkObject } from '../guard/read';
import type { ResolveScope } from './bindings';
import { resolveEffectChain, type GraphNames, type ResolvedEffect } from './routing';

/**
 * İşleme katmanı (`treatment`): kaynağın BİTMİŞ çıktısına (master + loop
 * katlaması SONRASI) uygulanan teslim işlemi — uzaklık, engel, ortam, cihaz.
 * Kaynak programın geri kalanı değişmez; aynı program + tohum aynı kaynak
 * PCM'ini verir, işleme onun üstüne deterministik bir zincirdir. Böylece
 * "aynı kaynaktan türeyen varyant" iddiası programın kendisinden okunur:
 * `treatment` çıkarılınca kalan belge kaynağın kendisidir.
 *
 * Sıra: kanal dönüşümü (katlama ya da çoğaltma) → süre (loop'ta dairesel,
 * değilse kuyruk payı) → zincir → seviye → isteğe bağlı true-peak sınırı →
 * kuyruğun son 20 ms'lik sönümü. Zincir parametreleri SABİTTİR: gesture ve
 * modülasyon kaynak zamanına bağlıdır, işleme katmanında anlamı yoktur.
 *
 * Seviye kaynağa GÖRELİDİR (`levelLu`): işlenmiş sesin en yüksek momentary
 * yüksekliği kaynağınkinin `levelLu` kadar altına/üstüne getirilir. Sabit bir
 * kazanç kaynağın spektrumuna göre farklı sonuç verirdi (parlak bir kaynak
 * alçak geçirenden koyu bir kaynaktan çok daha fazla enerji kaybeder).
 */
export interface TreatmentV1 {
  readonly chain: readonly { primitive: string; version: number; params?: object }[];
  readonly channels?: 1 | 2;
  readonly tailSeconds?: number;
  /** Kaynağın en yüksek momentary yüksekliğine göre hedef (LU); yazılmazsa 0. */
  readonly levelLu?: number;
  readonly limiter?: { readonly ceilingDbtp: number };
}

export interface ResolvedTreatment {
  readonly chain: readonly ResolvedEffect[];
  readonly channels: 1 | 2;
  readonly tailSeconds: number;
  readonly levelLu: number;
  readonly ceilingDbtp: number | null;
}

export const TREATMENT_LIMITS = { chain: 12, tailSeconds: 10 } as const;
const END_FADE_SECONDS = 0.02;
/** Master sınırlayıcısının varsayılanlarıyla aynı. */
const LIMITER_LOOKAHEAD_SECONDS = 0.005;
const LIMITER_RELEASE_SECONDS = 0.08;

function checkConstant(node: unknown, at: string): void {
  const params = (node as { params?: unknown } | null)?.params;
  if (params === undefined || params === null || typeof params !== 'object') return;
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'object' && value !== null) {
      throw new AudioParamError(
        `${at}.params.${key}`,
        'combination',
        'işleme katmanında parametre sabittir (gesture/modülasyon kaynağa aittir)',
        value,
      );
    }
  }
}

export function resolveTreatment(
  value: unknown,
  programChannels: 1 | 2,
  loop: boolean,
  scope: ResolveScope,
  names: GraphNames,
): ResolvedTreatment | null {
  if (value === undefined) return null;
  const o = checkObject(value, 'treatment', [
    'chain',
    'channels',
    'tailSeconds',
    'levelLu',
    'limiter',
  ]);
  const raw = checkArray(o.chain, 'treatment.chain');
  raw.forEach((node, i) => checkConstant(node, `treatment.chain[${i}]`));
  const chain = resolveEffectChain(o.chain, 'treatment.chain', scope, names, {
    streamPrefix: 'treatment:',
    allowTimeBased: true,
    allowSidechain: false,
    limit: TREATMENT_LIMITS.chain,
  });
  if (o.channels !== undefined && o.channels !== 1 && o.channels !== 2) {
    throw new AudioParamError('treatment.channels', 'type', '1 ya da 2 olmalı', o.channels);
  }
  const tailSeconds =
    o.tailSeconds === undefined
      ? 0
      : checkNumber(o.tailSeconds, 'treatment.tailSeconds', {
          min: 0,
          max: TREATMENT_LIMITS.tailSeconds,
        });
  if (loop && tailSeconds > 0) {
    throw new AudioParamError(
      'treatment.tailSeconds',
      'combination',
      'loop kaynağı dairesel işlenir; kuyruk payı almaz',
      tailSeconds,
    );
  }
  const limiter =
    o.limiter === undefined
      ? undefined
      : checkObject(o.limiter, 'treatment.limiter', ['ceilingDbtp']);
  return {
    chain,
    channels: o.channels ?? programChannels,
    tailSeconds,
    levelLu:
      o.levelLu === undefined
        ? 0
        : checkNumber(o.levelLu, 'treatment.levelLu', { min: -40, max: 12 }),
    ceilingDbtp: limiter
      ? checkNumber(limiter.ceilingDbtp, 'treatment.limiter.ceilingDbtp', { min: -20, max: 0 })
      : null,
  };
}

/** İşleme tamponunun uzunluğu: loop'ta iki tur, değilse çıktı + kuyruk. */
export function treatmentFrames(
  treatment: ResolvedTreatment,
  outputFrames: number,
  sampleRate: number,
  loop: boolean,
): number {
  return loop ? 2 * outputFrames : outputFrames + Math.round(treatment.tailSeconds * sampleRate);
}

function convert(channels: readonly Float32Array[], count: 1 | 2): Float32Array[] {
  if (channels.length === count) return channels.map((c) => c.slice());
  if (count === 1) return [channels[0].map((x, i) => 0.5 * (x + channels[1][i]))];
  return [channels[0].slice(), channels[0].slice()];
}

/**
 * Bitmiş kaynak çıktısına işleme katmanını uygular. `run` bir zincir
 * düğümünü verilen tamponlarda çalıştırır (render bağlamını çağıran kurar).
 */
export function applyTreatment(
  treatment: ResolvedTreatment,
  source: readonly Float32Array[],
  sampleRate: number,
  loop: boolean,
  run: (node: ResolvedEffect, buffers: Float32Array[]) => void,
): Float32Array[] {
  const converted = convert(source, treatment.channels);
  const length = converted[0].length;
  const total = treatmentFrames(treatment, length, sampleRate, loop);
  const work = converted.map((channel) => {
    const out = new Float32Array(total);
    out.set(channel);
    if (loop) out.set(channel, length);
    return out;
  });
  const reference = maxMomentaryLoudness(converted, sampleRate);
  for (const node of treatment.chain) run(node, work);
  const treated = maxMomentaryLoudness(work, sampleRate);
  if (Number.isFinite(reference) && Number.isFinite(treated)) {
    const gain = 10 ** ((reference + treatment.levelLu - treated) / 20);
    for (const c of work) for (let i = 0; i < c.length; i++) c[i] *= gain;
  }
  // Sınırlayıcı da iki turun üstünde çalışır: loop'un ikinci turu onun da
  // kararlı hâlidir, dikişte durum sıfırlanmaz.
  if (treatment.ceilingDbtp !== null) {
    limitTruePeak(work, sampleRate, {
      ceilingDb: treatment.ceilingDbtp,
      lookaheadSeconds: LIMITER_LOOKAHEAD_SECONDS,
      releaseSeconds: LIMITER_RELEASE_SECONDS,
    });
  }
  if (loop) return work.map((c) => c.slice(length));
  if (treatment.tailSeconds > 0) {
    const fade = Math.min(Math.round(END_FADE_SECONDS * sampleRate), total);
    for (const c of work) {
      for (let i = 0; i < fade; i++) {
        c[total - fade + i] *= 0.5 + 0.5 * Math.cos((Math.PI * (i + 1)) / fade);
      }
    }
  }
  return work;
}
