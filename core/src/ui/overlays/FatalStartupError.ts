export interface FatalStartupErrorOptions {
  readonly title: string;
  readonly error: unknown;
  readonly parent?: HTMLElement;
  readonly className?: string;
}

/** i18n başlamadan da kullanılabilen, metin politikasını çağıranda bırakan hata yüzeyi. */
export function showFatalStartupError(options: FatalStartupErrorOptions): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = ['vol-fatal-startup', options.className].filter(Boolean).join(' ');
  overlay.setAttribute('role', 'alert');

  const title = document.createElement('h1');
  title.className = 'vol-fatal-startup__title';
  title.textContent = options.title;

  const detail = document.createElement('p');
  detail.className = 'vol-fatal-startup__detail';
  detail.textContent =
    options.error instanceof Error ? options.error.message : String(options.error);

  overlay.append(title, detail);
  (options.parent ?? document.body).appendChild(overlay);
  return overlay;
}
