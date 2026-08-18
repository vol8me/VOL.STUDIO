/** Varsayılan yükleme zaman aşımı (ms). */
const DEFAULT_TIMEOUT_MS = 30000;

export interface StemLoadOptions {
  /** Yükleme zaman aşımı (ms). Varsayılan 30000. 0 = sınırsız. */
  timeoutMs?: number;
  /** Dışarıdan iptal — sahne kapanırken devam eden yüklemeyi durdurmak için. */
  signal?: AbortSignal;
}

/**
 * `Content-Type` bir SES dosyasını dışlıyor mu?
 *
 * Yalnızca AÇIKÇA ses olmayan tipler reddedilir (`text/html` gibi — genellikle
 * bir 404 sayfası). Önceki kontrol `includes('audio') || includes('octet-stream')`
 * idi ve `application/x-wav` gibi geçerli tipleri reddediyordu; sunucu
 * yapılandırmasına aşırı bağımlıydı.
 */
function isDefinitelyNotAudio(contentType: string): boolean {
  const type = contentType.toLowerCase();
  return type.startsWith('text/') || type.includes('json') || type.includes('xml');
}

/** Stem kaynaklarını URL'den veya hazır buffer'dan yükler. */
export class StemLoader {
  constructor(private readonly context: AudioContext) {}

  /**
   * URL'den AudioBuffer yükle. Zaman aşımı ve iptal desteklenir.
   *
   * `.ogg` başarısız olursa `.mp3`'e düşer — iOS WKWebView Ogg Vorbis decode
   * etmez (`generate:sounds`/`generate:music` + `convert:ios` her ikisini de
   * üretir). Kaynak zaten `.ogg` değilse (ör. `.wav`) fallback denenmez,
   * orijinal hata fırlatılır. Kaynak `options.signal` çağıran tarafından abort
   * edildiyse fallback denenmez — iptal isteği, sırf ilk denemenin türü
   * yüzünden yok sayılmaz.
   *
   * `timeoutMs` her deneme için AYRI uygulanır: `.ogg` başarısız olup
   * `.mp3`'e düşülürse toplam bekleme teorik olarak 2×`timeoutMs`'e kadar
   * çıkabilir.
   */
  async loadFromUrl(src: string, options: StemLoadOptions = {}): Promise<AudioBuffer> {
    try {
      return await this.fetchAndDecode(src, options);
    } catch (err) {
      if (options.signal?.aborted) throw err;

      const mp3Src = src.replace(/\.ogg(?=$|[?#])/i, '.mp3');
      if (mp3Src === src) throw err;

      try {
        return await this.fetchAndDecode(mp3Src, options);
      } catch (fallbackErr) {
        // Mesajda hem .ogg hem .mp3 anılır: yalnızca `err.message` loglayan
        // bir çağıran bile ikisinin de denendiğini görür. Orijinal .ogg hatası
        // ayrıca `cause` ile zincire eklenir — ilgisiz bir .ogg sunucu hatası
        // (500 gibi) tamamen kaybolmaz, tam metni isteyen `cause`'a bakabilir.
        const fallbackMessage =
          fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        throw new Error(`Stem yüklenemedi (.ogg ve .mp3 ikisi de başarısız): ${fallbackMessage}`, {
          cause: err,
        });
      }
    }
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
