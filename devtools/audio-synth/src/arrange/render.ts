import { synthesize } from '../engine';
import type { SynthParams } from '../types';
import { addVoice, createMix, type Mix } from './mix';

/**
 * Düzenlemenin TEK ham render yolu: yerleştirilmiş sesleri mix'e toplar.
 * `Timeline` ve müzik score render'ı bunu paylaşır — ikinci bir toplama
 * gerçeği, iki yolun aynı programda farklı ses vermesi demekti.
 *
 * Burada mastering YOKTUR: seviye/sınırlayıcı kararı çağıranındır, çünkü
 * stem'ler ortak bir kazanç alır ve tek tek sınırlanamaz.
 */
export interface PlacedVoiceV1 {
  /** Enstrümanın ürettiği parametreler; `sampleRate` burada yazılır. */
  readonly params: SynthParams;
  readonly atSeconds: number;
  readonly gain: number;
  readonly pan?: number;
}

export interface RenderVoicesOptions {
  readonly durationSeconds: number;
  readonly sampleRate: number;
  /** Tamponu aşan kuyruklar başa sarılsın mı (dikişsiz loop). */
  readonly wrap?: boolean;
  readonly channelCount?: 1 | 2;
}

export function renderVoices(voices: readonly PlacedVoiceV1[], options: RenderVoicesOptions): Mix {
  const mix = createMix(options.durationSeconds, options.sampleRate, options.channelCount ?? 2);
  for (const voice of voices) {
    const params: SynthParams = { ...voice.params, sampleRate: options.sampleRate };
    if (voice.pan !== undefined) params.pan = voice.pan;
    addVoice(mix, synthesize(params), voice.atSeconds, {
      gain: voice.gain,
      wrap: options.wrap === true,
    });
  }
  return mix;
}

/** Kırpma eşiği: mix tepesinin −56 dB altı. */
export const AUDIBLE_FLOOR_RELATIVE = Math.pow(10, -56 / 20);

/** Son duyulur örnekten sonra bırakılan pay (saniye). */
export const TRIM_MARGIN_SECONDS = 0.35;

function peakOf(channels: readonly Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    for (const value of channel) peak = Math.max(peak, Math.abs(value));
  }
  return peak;
}

/**
 * Sondaki sessizliği kırpar ve TUTULACAK örnek sayısını döner. Eşik mutlak
 * değil tepeye GÖRELİDİR: kısık bir parçanın kuyruğu da aynı oranla kesilir.
 */
export function trimmedLength(channels: readonly Float32Array[], sampleRate: number): number {
  const total = channels[0].length;
  const floor = peakOf(channels) * AUDIBLE_FLOOR_RELATIVE;
  let last = total - 1;
  while (last > 0 && channels.every((channel) => Math.abs(channel[last]) < floor)) last--;
  return Math.min(total, last + Math.floor(TRIM_MARGIN_SECONDS * sampleRate));
}
