import { UI_TIMING } from '../../constants';

/** theme.css'teki .vol-toast geçiş süresiyle eşleşmelidir (--vol-transition-medium). */
const TOAST_FADE_OUT_MS = 240;

/** Görünür sayı bu değeri aşınca en eski toast hemen kaldırılır. */
const MAX_VISIBLE_TOASTS = 4;

export type ToastVariant = 'default' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  variant?: ToastVariant;
  durationMs?: number;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

interface ActiveToast {
  element: HTMLDivElement;
  rafId: number;
  timeoutIds: number[];
}

/**
 * Geçici bildirim yığını. Tek örnek sabit bir kapsayıcıya sahip; her `show()`
 * çağrısı süresi dolunca fade-out ile kendini kaldıran bir toast ekler. Panel'den
 * farkı: kullanıcı etkileşimi beklemez ve MAX_VISIBLE_TOASTS'a kadar yığılır.
 */
export class ToastManager {
  private readonly container: HTMLDivElement;
  private readonly active: ActiveToast[] = [];

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'vol-toast-container';
    // role/aria-live kalıcı kapsayıcıda bir kez ayarlanır, toast başına değil —
    // ekran okuyucular zaten izlenen bir canlı bölgeye eklenen çocukları güvenle
    // anons eder, ama her show()'da canlı bölgeyi yeniden oluşturmak bazı
    // ekran okuyucularda anons kaçırmasına yol açabilir.
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');
    parent.appendChild(this.container);
  }

  show(message: string, options: ToastOptions = {}): void {
    const { variant = 'default', durationMs = UI_TIMING.TOAST_DEFAULT_DURATION } = options;

    while (this.active.length >= MAX_VISIBLE_TOASTS) {
      const oldest = this.active.shift();
      if (oldest) {
        this.dismiss(oldest);
      }
    }

    const toast = document.createElement('div');
    toast.className = [`vol-toast vol-toast--${variant}`, options.className]
      .filter(Boolean)
      .join(' ');
    toast.textContent = message;

    this.container.appendChild(toast);

    const entry: ActiveToast = { element: toast, rafId: 0, timeoutIds: [] };
    this.active.push(entry);

    // Tek RAF çoğu zaman appendChild ile aynı kareye düşer, opacity:0 boyamasını
    // atlayıp direkt opacity:1'e atlar. İç içe RAF ilk durumu önce commit eder.
    entry.rafId = requestAnimationFrame(() => {
      entry.rafId = requestAnimationFrame(() => toast.classList.add('vol-toast--visible'));
    });

    const hideTimeoutId = window.setTimeout(() => {
      toast.classList.remove('vol-toast--visible');
      // transitionend yerine timer kullanılır — çünkü transitionend
      // prefers-reduced-motion veya arka plan sekmesinde hiç tetiklenmeyebilir
      // ve toast'u DOM'da görünmez sıkışmış bırakır.
      const removeTimeoutId = window.setTimeout(() => {
        toast.remove();
        const index = this.active.indexOf(entry);
        if (index !== -1) this.active.splice(index, 1);
      }, TOAST_FADE_OUT_MS);
      entry.timeoutIds.push(removeTimeoutId);
    }, durationMs);
    entry.timeoutIds.push(hideTimeoutId);
  }

  destroy(): void {
    for (const entry of this.active) {
      this.clearTimers(entry);
    }
    this.active.length = 0;
    this.container.remove();
  }

  private dismiss(entry: ActiveToast): void {
    this.clearTimers(entry);
    entry.element.remove();
  }

  private clearTimers(entry: ActiveToast): void {
    cancelAnimationFrame(entry.rafId);
    for (const id of entry.timeoutIds) {
      window.clearTimeout(id);
    }
  }
}
