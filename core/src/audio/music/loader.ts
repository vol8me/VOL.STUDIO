/** Varsayılan yükleme zaman aşımı (ms). */
const DEFAULT_TIMEOUT_MS = 30000;

export interface StemLoadOptions {
  /** Yükleme zaman aşımı (ms). Varsayılan 30000. 0 = sınırsız. */
  timeoutMs?: number;
  /** Dışarıdan iptal — sahne kapanırken devam eden yüklemeyi durdurmak için. */
  signal?: AbortSignal;
}

/**
 * `Content-Type` açıkça ses olmayan bir tip mi?
 *
 * `text/html`, JSON veya XML gibi tipler reddedilir; genellikle
 * bir 404 sayfası yerine düşmüş ses dosyasıdır.
 */
function isDefinitelyNotAudio(contentType: string): boolean {
  const type = contentType.toLowerCase();
  return type.startsWith('text/') || type.includes('json') || type.includes('xml');
}

/** Stem kaynaklarını URL'den veya hazır buffer'dan yükler. */
export class StemLoader {
  constructor(private readonly context: AudioContext) {}

  /**
   * URL'den AudioBuffer yükle. Zaman aşımı ve iptal desteklenir. Hedef
   * WebView'ların hepsi Ogg Vorbis çözer; başka biçime düşülmez.
   */
  loadFromUrl(src: string, options: StemLoadOptions = {}): Promise<AudioBuffer> {
    return this.fetchAndDecode(src, options);
  }

  private async fetchAndDecode(src: string, options: StemLoadOptions): Promise<AudioBuffer> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();

    const abortFromCaller = (): void => controller.abort(new Error(`Stem iptal edildi: ${src}`));

    if (options.signal?.aborted) {
      controller.abort(new Error(`Stem iptal edildi: ${src}`));
    } else if (options.signal) {
      options.signal.addEventListener('abort', abortFromCaller);
    }

    const timer =
      timeoutMs > 0
        ? setTimeout(() => controller.abort(new Error(`Stem zaman aşımı: ${src}`)), timeoutMs)
        : undefined;

    try {
      if (controller.signal.aborted) {
        throw new Error(`Stem iptal edildi: ${src}`);
      }
      const response = await fetch(src, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Stem yüklenemedi: ${src} (${response.status})`);
      }
      const contentType = response.headers.get('content-type');
      if (contentType && isDefinitelyNotAudio(contentType)) {
        throw new Error(`Stem geçersiz içerik: ${src} (${contentType})`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return await this.decode(arrayBuffer, src);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (options.signal && !options.signal.aborted) {
        options.signal.removeEventListener('abort', abortFromCaller);
      }
    }
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
