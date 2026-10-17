import { requiredAt } from '../../collections/requiredAt';
import { i18next } from '../../i18n/I18n';

export type ActivityFeedTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface ActivityFeedEntry {
  readonly text: string;
  readonly tone?: ActivityFeedTone;
}

export interface ActivityFeedOptions {
  /** Aynı anda görünen en çok satır; aşılırsa en eski satır hemen kalkar. Pozitif tam sayı olmalı. */
  capacity: number;
  /** Bir satırın ekranda kalma süresi (ms). Varsayılan 7000. */
  lifetimeMs?: number;
  /** Süre dolunca satırın sönüp kalkma süresi (ms). Varsayılan 400. */
  fadeMs?: number;
  /** Akış adı (okuyucu); verilmezse CORE dil anahtarı. */
  ariaLabel?: string | (() => string);
  className?: string;
}

interface Line {
  readonly element: HTMLElement;
  readonly bornMs: number;
  leaving: boolean;
}

const DEFAULT_LIFETIME_MS = 7000;
const DEFAULT_FADE_MS = 400;

/**
 * Geçici olay akışı (öldürme, katılma, bölge): kısa ömürlü satırlar yığılır, süresi dolan söner ve
 * kalkar; kaydırma çubuğu, odaklanabilir kaydırma bölgesi ve dolu geçmiş yoktur. Zamanı çağıran sürer:
 * `push(entry, nowMs)` ve her karede `tick(nowMs)`; bileşen kendi zamanlayıcısını açmaz, bu yüzden
 * duraklatmada ve testte belirlenimlidir. Okuyucu için kök `role="log"`dur ama canlı bölge değildir
 * (HUD akışı her olayı seslendirmez).
 */
export class ActivityFeed {
  readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private readonly lines: Line[] = [];
  private readonly capacity: number;
  private readonly lifetimeMs: number;
  private readonly fadeMs: number;
  private readonly labelIsI18n: boolean;
  private destroyed = false;

  constructor(private readonly options: ActivityFeedOptions) {
    if (!Number.isInteger(options.capacity) || options.capacity < 1)
      throw new RangeError(
        `ActivityFeed.capacity pozitif tam sayı olmalı (gelen: ${options.capacity}).`,
      );
    this.capacity = options.capacity;
    this.lifetimeMs = options.lifetimeMs ?? DEFAULT_LIFETIME_MS;
    this.fadeMs = options.fadeMs ?? DEFAULT_FADE_MS;
    if (this.lifetimeMs <= 0 || this.fadeMs < 0)
      throw new RangeError('ActivityFeed süreleri pozitif olmalı.');
    this.labelIsI18n = options.ariaLabel === undefined;

    this.element = document.createElement('div');
    this.element.className = ['vol-feed', options.className].filter(Boolean).join(' ');
    this.element.setAttribute('role', 'log');
    this.element.setAttribute('aria-live', 'off');
    this.list = document.createElement('div');
    this.list.className = 'vol-feed__list';
    this.element.appendChild(this.list);
    this.applyLabel();
    this.element.hidden = true;
    i18next.on('languageChanged', this.handleLanguageChanged);
  }

  /** Görünen satır sayısı (sönmekte olanlar dahil). */
  get size(): number {
    return this.lines.length;
  }

  /** Satır ekler; kapasite aşılırsa en eski satır hemen kalkar. `nowMs` çağıranın saatidir. */
  push(entry: ActivityFeedEntry, nowMs: number): void {
    if (this.destroyed) return;
    const element = document.createElement('div');
    element.className = `vol-feed__line vol-feed__line--${entry.tone ?? 'default'}`;
    element.textContent = entry.text;
    this.list.appendChild(element);
    this.lines.push({ element, bornMs: nowMs, leaving: false });
    while (this.lines.length > this.capacity) this.lines.shift()?.element.remove();
    this.element.hidden = false;
  }

  /** Süresi dolan satırları söndürür ve kaldırır; satır yokken ucuzdur. */
  tick(nowMs: number): void {
    if (this.destroyed || this.lines.length === 0) return;
    for (let index = this.lines.length - 1; index >= 0; index--) {
      const line = requiredAt(this.lines, index);
      const age = nowMs - line.bornMs;
      if (age >= this.lifetimeMs + this.fadeMs) {
        line.element.remove();
        this.lines.splice(index, 1);
      } else if (age >= this.lifetimeMs && !line.leaving) {
        line.leaving = true;
        line.element.dataset.leaving = 'true';
      }
    }
    if (this.lines.length === 0) this.element.hidden = true;
  }

  clear(): void {
    if (this.destroyed) return;
    for (const line of this.lines) line.element.remove();
    this.lines.length = 0;
    this.element.hidden = true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    i18next.off('languageChanged', this.handleLanguageChanged);
    this.lines.length = 0;
    this.element.remove();
  }

  private applyLabel(): void {
    const { ariaLabel } = this.options;
    this.element.setAttribute(
      'aria-label',
      typeof ariaLabel === 'function'
        ? ariaLabel()
        : (ariaLabel ?? i18next.t('core:activityFeed.label')),
    );
  }

  private readonly handleLanguageChanged = (): void => {
    if (this.destroyed) return;
    if (this.labelIsI18n || typeof this.options.ariaLabel === 'function') this.applyLabel();
  };
}
