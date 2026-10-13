import type { LabLog } from './log';

/** Aynı iletinin günlüğe girebileceği en çok sayı: kare başına hata atan bir döngü halkayı doldurmasın. */
export const REPEAT_LIMIT = 20;
const MAX_TEXT = 500;

export interface CaptureTargets {
  readonly window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  /** `warn` ve `error` yerinde değiştirilir; `dispose` özgün işlevleri geri koyar. */
  readonly console: { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

export interface PageCapture {
  dispose(): void;
  /** Tekrar sınırı yüzünden günlüğe yazılmayan kayıt sayısı. */
  suppressed(): number;
}

function clip(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

/** Konsol argümanlarını tek satıra çevirir; dairesel ya da çok büyük nesne güvenli biçimde kısalır. */
export function formatArgs(args: readonly unknown[]): string {
  return clip(
    args
      .map((value) => {
        if (typeof value === 'string') return value;
        if (value instanceof Error) return value.stack ?? value.message;
        try {
          return JSON.stringify(value) ?? String(value);
        } catch {
          return String(value);
        }
      })
      .join(' '),
  );
}

function describeElement(target: unknown): { tag: string; url: string } | null {
  if (typeof target !== 'object' || target === null) return null;
  const element = target as {
    tagName?: unknown;
    src?: unknown;
    href?: unknown;
    currentSrc?: unknown;
  };
  if (typeof element.tagName !== 'string') return null;
  const url = [element.currentSrc, element.src, element.href].find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return { tag: element.tagName.toLowerCase(), url: url ?? '' };
}

/**
 * Sayfa hatalarını agent'ın okuyabileceği günlüğe akıtır: yakalanmamış hata, reddedilmiş söz, kaynak
 * yükleme hatası (kırık SVG gibi) ve konsol uyarı/hataları (Phaser uyarıları dahil). Konsol çıktısı
 * değişmez, özgün işlev de çağrılır.
 */
export function capturePageErrors(
  log: LabLog,
  targets: CaptureTargets = { window, console },
): PageCapture {
  const seen = new Map<string, number>();
  let suppressed = 0;
  const admit = (key: string): boolean => {
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count <= REPEAT_LIMIT) return true;
    suppressed++;
    if (count === REPEAT_LIMIT + 1)
      log.warn('lab', 'repeat-limit', { key: clip(key), limit: REPEAT_LIMIT });
    return false;
  };

  const onError = (event: Event): void => {
    const asError = event as Partial<ErrorEvent>;
    if (typeof asError.message === 'string') {
      const key = `error:${asError.message}`;
      if (!admit(key)) return;
      log.error('page', 'error', {
        message: clip(asError.message),
        source: asError.filename ?? '',
        line: asError.lineno ?? 0,
        col: asError.colno ?? 0,
        stack: clip(asError.error instanceof Error ? (asError.error.stack ?? '') : ''),
      });
      return;
    }
    const element = describeElement(event.target);
    if (element === null) return;
    if (!admit(`resource:${element.url}`)) return;
    log.error('page', 'resource', element);
  };
  const onRejection = (event: Event): void => {
    const reason = (event as Partial<PromiseRejectionEvent>).reason as unknown;
    const message = reason instanceof Error ? reason.message : clip(String(reason));
    if (!admit(`rejection:${message}`)) return;
    log.error('page', 'rejection', {
      message,
      stack: clip(reason instanceof Error ? (reason.stack ?? '') : ''),
    });
  };
  // `capture: true`: kaynak yükleme hataları (img, script, link) kabarcıklanmaz.
  targets.window.addEventListener('error', onError, true);
  targets.window.addEventListener('unhandledrejection', onRejection);

  const originalWarn = targets.console.warn;
  const originalError = targets.console.error;
  const wrap =
    (level: 'warn' | 'error', original: (...args: unknown[]) => void) =>
    (...args: unknown[]): void => {
      const message = formatArgs(args);
      if (admit(`console.${level}:${message}`)) log[level]('console', level, { message });
      original.apply(targets.console, args);
    };
  const warn = wrap('warn', originalWarn);
  const error = wrap('error', originalError);
  targets.console.warn = warn;
  targets.console.error = error;

  return {
    suppressed: () => suppressed,
    dispose() {
      targets.window.removeEventListener('error', onError, true);
      targets.window.removeEventListener('unhandledrejection', onRejection);
      // Başkası araya sarmalayıcı koyduysa onun zincirini koparmayız.
      if (targets.console.warn === warn) targets.console.warn = originalWarn;
      if (targets.console.error === error) targets.console.error = originalError;
    },
  };
}
