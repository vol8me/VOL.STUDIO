import { AudioParamError } from '../guard/errors';
import { checkArray, checkNumber, checkObject } from '../guard/read';
import { substream } from '../program/random';
import { checkPattern, MUSIC_KEY } from './terms';

/**
 * Groove/insanlaştırma profili. İnsanlaştırma RENDER'da değil GENİŞLETMEDE
 * uygulanır: sembolik analiz de, stem render'ı da aynı zamanlamayı görür.
 *
 * Rastgelelik olayın KALICI kimliğine bağlıdır (`music:<id>/groove/<eventId>`),
 * dizi sırasına değil. Dizine bağlı bir jitter, stem'ler ayrı render edilince
 * her stem'de başka bir sapma üretir ve stem toplamı referans mix'ten ayrılır.
 */
export interface GrooveProfileV1 {
  readonly id: string;
  /** Çift sekizlikleri geciktirme oranı (0 = düz, 0.5 = tam üçleme hissi). */
  readonly swing: number;
  /** Vuruş cinsinden zamanlama sapması (tepe genlik). */
  readonly timingJitter: number;
  readonly velocityJitter: number;
  /** Ölçü içindeki vuruşlara uygulanan kazanç çarpanları; uzunluk ölçüyü bölmeli. */
  readonly accents: readonly number[];
}

export const STRAIGHT_GROOVE: GrooveProfileV1 = {
  id: 'straight',
  swing: 0,
  timingJitter: 0,
  velocityJitter: 0,
  accents: [1],
};

export function validateGroove(value: unknown, path: string): GrooveProfileV1 {
  const o = checkObject(value, path, ['id', 'swing', 'timingJitter', 'velocityJitter', 'accents']);
  const accents = checkArray(o.accents, `${path}.accents`);
  if (accents.length === 0 || accents.length > 32) {
    throw new AudioParamError(`${path}.accents`, 'range', '1–32 vurgu', accents.length);
  }
  return {
    id: checkPattern(o.id, `${path}.id`, MUSIC_KEY),
    swing: checkNumber(o.swing, `${path}.swing`, { min: 0, max: 0.5 }),
    timingJitter: checkNumber(o.timingJitter, `${path}.timingJitter`, { min: 0, max: 0.25 }),
    velocityJitter: checkNumber(o.velocityJitter, `${path}.velocityJitter`, { min: 0, max: 1 }),
    accents: accents.map((a, i) => checkNumber(a, `${path}.accents[${i}]`, { min: 0, max: 4 })),
  };
}

const EIGHTH = 0.5;

/** Çift sekizliği geciktirir; tam vuruşlara ve üçleme dışı konumlara dokunmaz. */
export function swingOffset(beat: number, swing: number): number {
  if (swing === 0) return 0;
  const withinBeat = beat - Math.floor(beat);
  return Math.abs(withinBeat - EIGHTH) < 1e-9 ? swing * EIGHTH : 0;
}

export interface GrooveInput {
  readonly seed: number;
  readonly musicId: string;
  readonly eventId: string;
  readonly beatInBar: number;
  readonly beatsPerBar: number;
}

export interface GrooveResult {
  readonly beatOffset: number;
  readonly gainFactor: number;
}

/**
 * Profili tek bir olaya uygular. `swing`, `timingJitter` ve `velocityJitter`
 * sıfırken sonuç tam ızgaradır ve kazanç yalnız vurgu tablosundan gelir.
 */
export function applyGroove(profile: GrooveProfileV1, input: GrooveInput): GrooveResult {
  const accentIndex = Math.floor(input.beatInBar) % profile.accents.length;
  const accent = profile.accents[accentIndex];
  let offset = swingOffset(input.beatInBar, profile.swing);
  let gain = accent;
  if (profile.timingJitter > 0 || profile.velocityJitter > 0) {
    const random = substream(input.seed, `music:${input.musicId}/groove/${input.eventId}`);
    const timing = random.next() * 2 - 1;
    const velocity = random.next() * 2 - 1;
    offset += timing * profile.timingJitter;
    gain *= 1 + velocity * profile.velocityJitter * 0.5;
  }
  return { beatOffset: offset, gainFactor: Math.max(0, gain) };
}
