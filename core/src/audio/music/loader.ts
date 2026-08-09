import { synth } from '../synth/engine';
import type { SynthesisResult, SynthParams } from '../synth/types';
import type { ProceduralStemOptions, Stem } from './types';

/** Stem kaynaklarını yükler veya procedural buffer üretir. */
export class StemLoader {
  constructor(private readonly context: AudioContext) {}

  /** URL'den AudioBuffer yükle. */
  async loadFromUrl(src: string): Promise<AudioBuffer> {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Stem yüklenemedi: ${src} (${response.status})`);
    }
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('audio') && !contentType.includes('octet-stream')) {
      throw new Error(`Stem geçersiz içerik: ${src} (${contentType})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return this.decode(arrayBuffer, src);
  }

  /** ArrayBuffer'ı AudioBuffer'a decode et. */
  async decode(arrayBuffer: ArrayBuffer, src = 'unknown'): Promise<AudioBuffer> {
    try {
      return await this.context.decodeAudioData(arrayBuffer);
    } catch (err) {
      throw new Error(
        `Audio decode hatası: ${src} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** `SynthesisResult` içeriğini AudioBuffer'a dönüştür. */
  synthesisResultToAudioBuffer(result: SynthesisResult): AudioBuffer {
    const numChannels = result.channels.length;
    const length = result.channels[0]?.length ?? 0;
    const buffer = this.context.createBuffer(numChannels, length, result.sampleRate);
    for (let ch = 0; ch < numChannels; ch++) {
      buffer.copyToChannel(result.channels[ch] as Float32Array<ArrayBuffer>, ch);
    }
    return buffer;
  }

  /** Procedural stem seçeneklerinden AudioBuffer üretir. */
  generateProceduralBuffer(options: ProceduralStemOptions): AudioBuffer {
    const { duration, ...params } = options;
    const result = synth(duration, params as Omit<SynthParams, 'duration'>);
    return this.synthesisResultToAudioBuffer(result);
  }

  /** Stem için buffer çözümle. */
  async resolveBuffer(stem: Stem, fallback?: ProceduralStemOptions): Promise<AudioBuffer> {
    if (stem.buffer) return stem.buffer;
    if (stem.src) return this.loadFromUrl(stem.src);
    if (fallback) return this.generateProceduralBuffer(fallback);
    throw new Error(`Stem'in src, buffer veya procedural tanımı yok: ${stem.id}`);
  }
}
