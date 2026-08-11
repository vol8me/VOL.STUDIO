import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SynthesisResult } from './types';
import { createRandom } from './random';

/** Dither gürültüsü için sabit seed — üretim tekrarlanabilir kalmalı. */
const DITHER_SEED = 0x0d17;

const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

/**
 * SynthesisResult içeriğini 16-bit PCM WAV dosyasına yazar. Mono veya stereo.
 *
 * `targetGain` varsayılanı 1.0'dır. Önceden 0.95 idi ve `applyGlobalEffects`
 * ZATEN 0.95'e normalize ettiği için dosyaya yazılan tepe 0.95 × 0.95 = 0.9025
 * oluyordu — aynı sabit iki farklı anlamda iki yerde duruyor ve ~0.9 dB
 * istenmeyen kayıp veriyordu. Headroom kararı tek yerde (normalize) kalır.
 */
export function writeWav(filePath: string, result: SynthesisResult, targetGain = 1): void {
  const { channels, sampleRate } = result;
  const numChannels = channels.length;
  const sampleCount = channels[0]?.length ?? 0;

  const dataSize = sampleCount * numChannels * BYTES_PER_SAMPLE;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * BYTES_PER_SAMPLE, 28);
  buffer.writeUInt16LE(numChannels * BYTES_PER_SAMPLE, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // TPDF dither: iki bağımsız düzgün dağılımın toplamı. Kuantizasyon hatasını
  // sinyalden bağımsız hale getirir; sönümlenen kuyruklardaki basamaklanmayı
  // duyulmaz bir gürültü tabanına çevirir. Deterministik olması için sabit
  // seed'li PRNG kullanılır — asset üretimi tekrarlanabilir kalmalı.
  const dither = createRandom(DITHER_SEED);
  const LSB = 1 / 32768;

  for (let i = 0; i < sampleCount; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const raw = result.channels[ch]?.[i] ?? 0;
      const noise = (dither.next() - dither.next()) * LSB;
      const clamped = Math.max(-1, Math.min(1, raw * targetGain + noise));
      // Math.round: Math.floor pozitif değerleri sistematik olarak aşağı
      // yuvarlayıp yarım LSB'lik bir sapma bırakıyordu.
      const intVal = Math.max(-32768, Math.min(32767, Math.round(clamped * 32767)));
      const offset = 44 + (i * numChannels + ch) * BYTES_PER_SAMPLE;
      buffer.writeInt16LE(intVal, offset);
    }
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, buffer);
}
