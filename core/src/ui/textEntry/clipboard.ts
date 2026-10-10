/**
 * Pano bağdaştırıcısı: web (`navigator.clipboard`) ve yerel kabuk aynı sözleşmeyi konuşur. Düzenleme menüsü
 * (`editMenu.ts`) yalnız bu arayüzü bilir; kabuğa özel bir sağlayıcı `ClipboardAdapter` uygulayıp verir.
 *
 * Kurallar:
 * - Bağdaştırıcı ASLA fırlatmaz; izin reddi, yetenek yokluğu ve başarısızlık sonuç nesnesidir. Akışı bozmaz.
 * - Pano içeriği hiçbir yere yazılmaz (günlük, tanı, hata iletisi): yalnız çağırana döner.
 * - Okuma yalnız kullanıcı eylemiyle çağrılır (menü öğesi); bağdaştırıcı arka planda yoklamaz.
 */

/** `denied`: izin reddi, `unavailable`: yetenek yok, `failed`: beklenmeyen hata. */
export type ClipboardFailure = 'denied' | 'unavailable' | 'failed';

export type ClipboardReadResult =
  { ok: true; text: string } | { ok: false; reason: ClipboardFailure };
export type ClipboardWriteResult = { ok: true } | { ok: false; reason: ClipboardFailure };

export interface ClipboardAdapter {
  /** Eşzamanlı ipucu: false ise ilgili menü öğesi kapalı sunulur (çağrı yine güvenle başarısız olur). */
  readonly canRead: boolean;
  readonly canWrite: boolean;
  readText(): Promise<ClipboardReadResult>;
  writeText(text: string): Promise<ClipboardWriteResult>;
}

function failureOf(error: unknown): ClipboardFailure {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotSupportedError') return 'unavailable';
  return 'failed';
}

/**
 * Seçili metni geçici bir metin alanından `execCommand('copy')` ile yazar. `navigator.clipboard` olmayan
 * bağlamların (güvenli olmayan kaynak, eski WebKitGTK) yedeğidir; odağı ve seçimi geri verir.
 */
function legacyCopy(text: string): boolean {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const holder = document.createElement('textarea');
  holder.value = text;
  holder.setAttribute('readonly', '');
  holder.setAttribute('aria-hidden', 'true');
  holder.className = 'vol-edit-menu-holder';
  document.body.appendChild(holder);
  try {
    holder.select();
    return typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch {
    return false;
  } finally {
    holder.remove();
    active?.focus({ preventScroll: true });
  }
}

/**
 * Tarayıcı panosu bağdaştırıcısı. `clipboard` verilmezse `navigator.clipboard` kullanılır; yoksa okuma
 * `unavailable`, yazma `execCommand` yedeğine düşer.
 */
export function createWebClipboardAdapter(
  clipboard: Pick<Clipboard, 'readText' | 'writeText'> | undefined = typeof navigator ===
  'undefined'
    ? undefined
    : navigator.clipboard,
): ClipboardAdapter {
  const canRead = typeof clipboard?.readText === 'function';
  const hasExecCommand =
    typeof document !== 'undefined' && typeof document.execCommand === 'function';
  const canWrite = typeof clipboard?.writeText === 'function' || hasExecCommand;
  return {
    canRead,
    canWrite,
    async readText(): Promise<ClipboardReadResult> {
      if (!clipboard || !canRead) return { ok: false, reason: 'unavailable' };
      try {
        return { ok: true, text: await clipboard.readText() };
      } catch (error) {
        return { ok: false, reason: failureOf(error) };
      }
    },
    async writeText(text: string): Promise<ClipboardWriteResult> {
      if (clipboard && typeof clipboard.writeText === 'function') {
        try {
          await clipboard.writeText(text);
          return { ok: true };
        } catch (error) {
          // İzin reddi yedeğe düşmez: kullanıcı kararı aşılmaz. Yalnız yetenek/beklenmeyen hatada yedek denenir.
          const reason = failureOf(error);
          if (reason === 'denied') return { ok: false, reason };
        }
      }
      return legacyCopy(text)
        ? { ok: true }
        : { ok: false, reason: canWrite ? 'failed' : 'unavailable' };
    },
  };
}
