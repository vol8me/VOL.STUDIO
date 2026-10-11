export interface FatalStartupErrorOptions {
  readonly title: string;
  readonly error: unknown;
  readonly parent?: HTMLElement;
  readonly className?: string;
  /**
   * Yüzeye odak verir: başka etkileşimli öğe kalmayan gerçek başlatma hatasında klavye kullanıcısı
   * uzun ayrıntıyı hemen kaydırabilir. Önizleme/vitrin gibi başka içerikle yaşayan yüzeyde verilmez.
   */
  readonly autoFocus?: boolean;
}

/** i18n başlamadan da kullanılabilen, metin politikasını çağıranda bırakan hata yüzeyi. */
export function showFatalStartupError(options: FatalStartupErrorOptions): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = ['vol-fatal-startup', options.className].filter(Boolean).join(' ');
  overlay.setAttribute('role', 'alert');
  // Ayrıntı ekrandan uzunsa yüzey kaydırılır; kaydırılabilir bölge klavyeyle odaklanabilir olmalıdır.
  overlay.tabIndex = 0;

  const title = document.createElement('h1');
  title.className = 'vol-fatal-startup__title';
  title.textContent = options.title;

  const detail = document.createElement('p');
  detail.className = 'vol-fatal-startup__detail';
  detail.textContent =
    options.error instanceof Error ? options.error.message : String(options.error);

  overlay.append(title, detail);
  (options.parent ?? document.body).appendChild(overlay);
  if (options.autoFocus) overlay.focus({ preventScroll: true });
  return overlay;
}
