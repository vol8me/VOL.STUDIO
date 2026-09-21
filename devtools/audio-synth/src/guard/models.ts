import { AudioParamError } from './errors';
import { assertRenderBudget, estimateFrameCost } from './budget';
import { checkNumber, checkObject, checkSampleRate, joinPath } from './read';

export interface ModelBase {
  readonly sampleRate: number;
  readonly duration: number;
  readonly frequency: number;
}

export interface ModelRules {
  readonly keys: readonly string[];
  /** Modelin çalabildiği en pes temel (Hz). */
  readonly minFrequency: number;
  /** Eşzamanlı Float32 tampon sayısı (kanal başına) ve çerçeve başına iş. */
  readonly buffersPerFrame: number;
  readonly unitsPerFrame: (params: Readonly<Record<string, unknown>>) => number;
}

/** Modeller 50 ms altında kurulum geçişini (çekiç, yay atağı) taşıyamaz. */
const MIN_MODEL_DURATION = 0.05;

/**
 * Fiziksel model girişinin ortak sınırı.
 *
 * Temel nicelikler `synthesize` ile aynı kurala tabidir: örnek oranı
 * desteklenen aralıkta tamsayı, süre en az 50 ms, temel frekans modelin
 * tabanı ile Nyquist arasında — dışı REDDEDİLİR, sessizce uzatılmaz ya da
 * kaydırılmaz. Şekillendirme alanlarında (sertlik, sönüm, gürültü…) sonlu
 * olmayan değer reddedilir; sonlu değer modelin fiziksel aralığına
 * kelepçelenir — bu, modellerin belgelenmiş sözleşmesidir.
 */
export function resolveModelBase(params: unknown, owner: string, rules: ModelRules): ModelBase {
  const o = checkObject(params, owner, rules.keys);
  for (const [key, value] of Object.entries(o)) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new AudioParamError(joinPath(owner, key), 'non-finite', 'sonlu bir sayı olmalı', value);
    }
  }
  const sampleRate =
    o.sampleRate === undefined ? 44100 : checkSampleRate(o.sampleRate, `${owner}.sampleRate`);
  if (o.duration === undefined) {
    throw new AudioParamError(`${owner}.duration`, 'required', 'zorunlu alan eksik', undefined);
  }
  const duration = checkNumber(o.duration, `${owner}.duration`, { min: MIN_MODEL_DURATION });
  if (o.frequency === undefined) {
    throw new AudioParamError(`${owner}.frequency`, 'required', 'zorunlu alan eksik', undefined);
  }
  const frequency = checkNumber(o.frequency, `${owner}.frequency`, { min: rules.minFrequency });
  if (frequency >= sampleRate / 2) {
    throw new AudioParamError(
      `${owner}.frequency`,
      'range',
      `Nyquist (${sampleRate / 2} Hz) altında olmalı`,
      frequency,
    );
  }
  assertRenderBudget(
    estimateFrameCost(sampleRate, duration, rules.buffersPerFrame, rules.unitsPerFrame(o)),
    owner,
  );
  return { sampleRate, duration, frequency };
}
