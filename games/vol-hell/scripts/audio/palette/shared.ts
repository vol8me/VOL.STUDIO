/**
 * Palet ortak yardımcıları.
 *
 * Tema: **Karanlık Sentetik / Void.** Palet genelinde üç bağlayıcı kural:
 * - İnce/tiz karakter yok — her voice üstten lowpass ile koyulaştırılır.
 * - Arka plan gürültüsü yok — noise yalnızca transient içinde (snare/impact)
 *   ve daima bant sınırlı kullanılır; sürekli hiss üreten katman yasak.
 * - Her voice `normalize: false` ile üretilir (renderVoice bunu zorlar);
 *   seviye hiyerarşisi gain ile kurulur, tepe ölçekleme master'dadır.
 */

import type { SynthesisResult } from '@volstudio/audio-synth';
import { SAMPLE_RATE } from '../lib/mix';

/** Katman tanımı — `layer` ile tek voice'a birleştirilir. */
export interface LayerSpec {
  voice: SynthesisResult;
  /** Katmanın başlangıç ofseti (saniye). Varsayılan 0. */
  at?: number;
  /** Katman kazancı. Varsayılan 1. */
  gain?: number;
}

/**
 * Birden çok katmanı tek `SynthesisResult` içine toplar. Çok katmanlı
 * enstrümanlar (snare gövde + tel, impact darbe + kuyruk) bunu kullanır;
 * çağıran tarafta tek voice gibi yerleştirilir.
 */
export function layer(...specs: LayerSpec[]): SynthesisResult {
  let maxChannels = 1;
  let totalSamples = 0;
  for (const spec of specs) {
    const offset = Math.round((spec.at ?? 0) * SAMPLE_RATE);
    maxChannels = Math.max(maxChannels, spec.voice.channels.length);
    totalSamples = Math.max(totalSamples, offset + (spec.voice.channels[0]?.length ?? 0));
  }

  const channels = Array.from({ length: maxChannels }, () => new Float32Array(totalSamples));
  for (const spec of specs) {
    const offset = Math.round((spec.at ?? 0) * SAMPLE_RATE);
    const gain = spec.gain ?? 1;
    for (let ch = 0; ch < maxChannels; ch++) {
      const src = spec.voice.channels[Math.min(ch, spec.voice.channels.length - 1)];
      const dst = channels[ch];
      if (!src || !dst) continue;
      for (let i = 0; i < src.length; i++) {
        const t = offset + i;
        dst[t] = (dst[t] ?? 0) + (src[i] ?? 0) * gain;
      }
    }
  }

  return { channels, sampleRate: SAMPLE_RATE, duration: totalSamples / SAMPLE_RATE };
}
