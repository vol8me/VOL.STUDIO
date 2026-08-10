/** Stem kaynaklarını URL'den veya hazır buffer'dan yükler. */
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
}
