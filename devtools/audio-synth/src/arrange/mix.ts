import { getPanGains } from '../effects';
import { masterChannels, type MasterOptions } from '../engine/master';
import { AudioParamError } from '../guard/errors';
import { assertRenderBudget, estimateFrameCost } from '../guard/budget';
import { checkNumber, checkSampleRate } from '../guard/read';
import type { SynthesisResult } from '../types';

/**
 * Kanonik mix veriyolu — sesleri zamanda toplayan TEK yer.
 *
 * Üç kural ölçümle kanıtlandı ve burada kalır (tarihî kaynak: frozen
 * VOL.HELL `scripts/audio/lib/mix.ts`):
 *
 * 1. Veriyolu sesleri NORMALİZE ETMEZ; seviye mix'in sonunda bir kez
 *    (`masterMix`) verilir, katmanlar arası dinamik korunur.
 * 2. Loop mix'lerinde tampon sonunu aşan kuyruk başa SARILIR (`wrap`);
 *    kesilen kuyruk her turda tık, uzun sönüm her turda boşluk bırakırdı.
 * 3. İnsanlaştırma DURUMSUZDUR (`stableJitter`): sapma `(tohum, olay)`
 *    çiftinin karmasından gelir, bir üreteç akışından değil — aynı düzenleme
 *    kaç kez render edilirse edilsin aynı örnekleri verir.
 */
export interface Mix {
  /** 1 (mono) ya da 2 (sol, sağ) kanal. */
  readonly channels: readonly Float32Array[];
  readonly sampleRate: number;
}

export interface AddVoiceOptions {
  /** Ses kazancı çarpanı (sesin kendi seviyesinin üstüne). Varsayılan 1. */
  readonly gain?: number;
  /**
   * Stereo mix'te mono ses için eşit güçlü pan (−1…1). Verilmezse ses
   * çift-mono yerleşir (her kanala birim kazanç).
   */
  readonly pan?: number;
  /** Mix sonunu aşan kuyruk başa sarılsın mı (loop). Varsayılan false: kesilir. */
  readonly wrap?: boolean;
}

export function createMix(duration: number, sampleRate: number, channelCount: 1 | 2 = 2): Mix {
  const rate = checkSampleRate(sampleRate, 'mix.sampleRate');
  const seconds = checkNumber(duration, 'mix.duration', { above: 0 });
  if (channelCount !== 1 && channelCount !== 2) {
    throw new AudioParamError('mix.channels', 'type', '1 ya da 2 olmalı', channelCount);
  }
  assertRenderBudget(estimateFrameCost(rate, seconds, channelCount, 0), 'createMix');
  const length = Math.ceil(seconds * rate);
  return {
    channels: Array.from({ length: channelCount }, () => new Float32Array(length)),
    sampleRate: rate,
  };
}

/**
 * Sesi `atSeconds` anından itibaren toplar. Mono mix yalnız mono ses alır.
 * Stereo mix'te stereo ses kanallarıyla gelir (pan render sırasında
 * verilmiş olmalı). Mono ses pan verilmezse ÇİFT-MONO yerleşir: `synthesize`
 * pan'ı normalizasyondan önce uyguladığı için normalize edilmiş bir sesin
 * `pan: 0` render'ı da kanal başına birim seviyededir; iki yol aynı seviyeyi
 * verir ve presetin "gain = tepe seviyesi" sözleşmesi mix'te korunur. Pan
 * açıkça verilirse eşit güç yasası (`getPanGains`) uygulanır.
 */
export function addVoice(
  mix: Mix,
  voice: SynthesisResult,
  atSeconds: number,
  options: AddVoiceOptions = {},
): void {
  if (voice.sampleRate !== mix.sampleRate) {
    throw new AudioParamError(
      'voice.sampleRate',
      'combination',
      `mix örnek oranı ${mix.sampleRate} Hz ile aynı olmalı`,
      voice.sampleRate,
    );
  }
  const gain = checkNumber(options.gain ?? 1, 'addVoice.gain', { min: 0 });
  const at = checkNumber(atSeconds, 'addVoice.at', { min: 0 });
  const stereoVoice = voice.channels.length > 1;
  const stereoMix = mix.channels.length > 1;
  if ((stereoVoice || !stereoMix) && options.pan !== undefined) {
    throw new AudioParamError(
      'addVoice.pan',
      'combination',
      "pan yalnız stereo mix'e yerleşen mono ses içindir",
      options.pan,
    );
  }
  if (stereoVoice && !stereoMix) {
    throw new AudioParamError(
      'voice.channels',
      'combination',
      'mono mix stereo ses alamaz',
      voice.channels.length,
    );
  }
  const [panLeft, panRight] =
    stereoVoice || !stereoMix || options.pan === undefined ? [1, 1] : getPanGains(options.pan);
  const sources = stereoVoice ? voice.channels : [voice.channels[0], voice.channels[0]];
  const gains = [gain * panLeft, gain * panRight];
  const length = mix.channels[0].length;
  const start = Math.floor(at * mix.sampleRate);
  mix.channels.forEach((target, ch) => {
    const source = sources[ch];
    const channelGain = gains[ch];
    for (let i = 0; i < source.length; i++) {
      let index = start + i;
      if (index >= length) {
        if (!options.wrap) break;
        index %= length;
      }
      target[index] += source[i] * channelGain;
    }
  });
}

/** Mix'i yerinde sonlandırır — bkz. `engine/master.ts` sırası. */
export function masterMix(mix: Mix, options: MasterOptions): void {
  masterChannels(mix.channels, mix.sampleRate, options);
}

/**
 * `(tohum, olay, şerit)` için [0, 1) aralığında durumsuz, deterministik
 * değer (32-bit karma, murmur3 sonlandırıcısı). Aynı girdi her çağrıda aynı
 * değeri verir; olay sırası ya da render sayısı onu değiştirmez.
 */
export function stableJitter(seed: number, index: number, lane = 0): number {
  let h = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(index | 0, 0x85ebca77) ^ lane;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
