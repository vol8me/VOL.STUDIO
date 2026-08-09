import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SynthesisResult } from './types';

const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

/**
 * SynthesisResult içeriğini WAV dosyasına yazar.
 * Mono veya stereo destekler.
 */
export function writeWav(filePath: string, result: SynthesisResult, targetGain = 0.95): void {
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

  for (let i = 0; i < sampleCount; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const raw = result.channels[ch]?.[i] ?? 0;
      const clamped = Math.max(-1, Math.min(1, raw * targetGain));
      const intVal = clamped < 0 ? Math.floor(clamped * 32768) : Math.floor(clamped * 32767);
      const offset = 44 + (i * numChannels + ch) * BYTES_PER_SAMPLE;
      buffer.writeInt16LE(intVal, offset);
    }
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, buffer);
}
