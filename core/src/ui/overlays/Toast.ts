import { UI_TIMING } from '../../constants';
import { i18next } from '../../i18n/I18n';
import { Button } from '../primitives/Button';
import { Icon, type IconName } from '../primitives/Icon';
import { IconButton } from '../primitives/IconButton';
import { emitUiSignal } from '../feedback/uiIntent';

/**
 * .vol-toast'un CSS geçiş süresi (--vol-transition-medium) kadar beklenir.
 * Bu süreden KISA olamaz — toast fade bitmeden DOM'dan silinir.
 * cssConstantSync.test.ts bu ilişkiyi doğrular.
 */
export const TOAST_FADE_OUT_MS = 240;

/** Aynı anda görünen bildirim sayısı; fazlası sırada bekler (HUD'u örtmez, kaybolmaz). */
export const MAX_VISIBLE_TOASTS = 3;

/** Sıra dolarsa en eski KRİTİK OLMAYAN bildirim düşer; kritik bildirim hiçbir zaman düşmez. */
const MAX_QUEUED_TOASTS = 8;

export type ToastVariant = 'default' | 'success' | 'warning' | 'danger';

/** Varyant simgesi: renk tek taşıyıcı olmasın (şekil de anlam taşır). */
const TOAST_ICONS: Record<ToastVariant, IconName> = {
  default: 'infoCircle',
  success: 'checkCircle',
  warning: 'warning',
  danger: 'error',
};

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastOptions {
  variant?: ToastVariant;
  /** Otomatik gizleme süresi (ms). `persistent` ise yok sayılır. */
  durationMs?: number;
  /**
   * Kritik bildirim: ekran okuyucuya `role="alert"` ile derhal duyurulur, sırada atlanmaz ve
   * görünür başka bir bildirimin yerine geçer; kapatılana dek kalır. Varsayılan: `danger`.
   */
  critical?: boolean;
  /** Süre dolunca kendiliğinden gizlenmez; kapatma düğmesi eklenir. Varsayılan: kritik ya da eylemli. */
  persistent?: boolean;
  /** Bildirime bağlı tek eylem (ör. Geri al). Eylem çalışınca bildirim kapanır. */
  action?: ToastAction;
  /** Kapatma düğmesinin adı; verilmezse `core:toast.dismiss`. */
  dismissLabel?: string;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

interface QueuedToast {
  message: string;
  options: ToastOptions;
  critical: boolean;
}

interface ActiveToast {
  element: HTMLDivElement;
  critical: boolean;
  persistent: boolean;
  rafId: number;
  timeoutIds: number[];
  hideTimer: number | null;
  remainingMs: number;
  startedAt: number;
  closing: boolean;
  destroyables: { destroy(): void }[];
}

/**
 * Geçici bildirim yığını. Tek örnek sabit bir kapsayıcıya sahip. En fazla `MAX_VISIBLE_TOASTS`
 * görünür; fazlası kaybolmadan sırada bekler ve yer açılınca sırayla gösterilir. Kritik bildirim
 * öncelik alır, kapatılana dek kalır ve sessizce düşmez. Fare ya da odak bildirimin üzerindeyken
 * süre durur; eylem ve kapatma düğmeleri klavye ve kolla erişilir.
 */
export class ToastManager {
  private readonly container: HTMLDivElement;
  private readonly active: ActiveToast[] = [];
  private readonly queue: QueuedToast[] = [];

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'vol-toast-container';
    // role/aria-live kalıcı kapsayıcıda bir kez ayarlanır, toast başına değil —
    // ekran okuyucular zaten izlenen bir canlı bölgeye eklenen çocukları güvenle
    // anons eder, ama her show()'da canlı bölgeyi yeniden oluşturmak bazı
    // ekran okuyucularda anons kaçırmasına yol açabilir. Kritik bildirim kendi `role="alert"`ini taşır.
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');
    parent.appendChild(this.container);
  }

  show(message: string, options: ToastOptions = {}): void {
    const critical = options.critical ?? options.variant === 'danger';
    const incoming: QueuedToast = { message, options, critical };

    if (this.active.length < MAX_VISIBLE_TOASTS) {
      this.present(incoming);
      return;
    }
    if (critical) {
      // Kritik bildirim sırada beklemez: görünen en eski geçici bildirimin yerine geçer.
      const victim = this.active.find((entry) => !entry.critical && !entry.persistent);
      if (victim) {
        this.remove(victim);
        this.present(incoming);
        return;
      }
    }
    this.enqueue(incoming);
  }

  destroy(): void {
    for (const entry of this.active) this.clearTimers(entry);
    for (const entry of this.active) entry.destroyables.forEach((item) => item.destroy());
    this.active.length = 0;
    this.queue.length = 0;
    this.container.remove();
  }

  private enqueue(toast: QueuedToast): void {
    if (toast.critical) {
      const firstNormal = this.queue.findIndex((item) => !item.critical);
      this.queue.splice(firstNormal === -1 ? this.queue.length : firstNormal, 0, toast);
    } else {
      this.queue.push(toast);
    }
    while (this.queue.length > MAX_QUEUED_TOASTS) {
      const droppable = this.queue.findIndex((item) => !item.critical);
      if (droppable === -1) break;
      this.queue.splice(droppable, 1);
    }
  }

  private drain(): void {
    while (this.active.length < MAX_VISIBLE_TOASTS && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) this.present(next);
    }
  }

  private present({ message, options, critical }: QueuedToast): void {
    const {
      variant = 'default',
      durationMs = UI_TIMING.TOAST_DEFAULT_DURATION_MS,
      action,
    } = options;
    const persistent = options.persistent ?? (critical || action !== undefined);

    const toast = document.createElement('div');
    toast.className = [`vol-toast vol-toast--${variant}`, options.className]
      .filter(Boolean)
      .join(' ');
    if (critical) toast.setAttribute('role', 'alert');
    const icon = document.createElement('span');
    icon.className = 'vol-toast__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.appendChild(new Icon({ name: TOAST_ICONS[variant], size: 20 }).element);
    const text = document.createElement('span');
    text.className = 'vol-toast__message';
    text.textContent = message;
    toast.append(icon, text);

    const entry: ActiveToast = {
      element: toast,
      critical,
      persistent,
      rafId: 0,
      timeoutIds: [],
      hideTimer: null,
      remainingMs: durationMs,
      startedAt: 0,
      closing: false,
      destroyables: [],
    };

    if (action) {
      const button = new Button(action.label, {
        size: 'sm',
        onClick: () => {
          action.onAction();
          this.close(entry);
        },
      });
      button.element.classList.add('vol-toast__action');
      entry.destroyables.push(button);
      toast.append(button.element);
    }
    if (persistent) {
      const dismiss = new IconButton(new Icon({ name: 'close', size: 16 }).element, {
        size: 'sm',
        label: options.dismissLabel ?? i18next.t('core:toast.dismiss'),
        onClick: () => this.close(entry),
      });
      dismiss.element.classList.add('vol-toast__dismiss');
      entry.destroyables.push(dismiss);
      toast.append(dismiss.element);
    }

    this.container.appendChild(toast);
    // Bildirim bir sistem olayıdır (kullanıcı eylemi değil): uyarı/tehlike/kritik kritik sesle, diğerleri `notify` ile duyulur.
    emitUiSignal({
      kind: critical || variant === 'warning' || variant === 'danger' ? 'alert' : 'notify',
      origin: 'ToastManager',
      target: this.container,
    });
    this.active.push(entry);

    // Tek RAF çoğu zaman appendChild ile aynı kareye düşer, opacity:0 boyamasını
    // atlayıp direkt opacity:1'e atlar. İç içe RAF ilk durumu önce commit eder.
    entry.rafId = requestAnimationFrame(() => {
      entry.rafId = requestAnimationFrame(() => toast.classList.add('vol-toast--visible'));
    });

    if (!persistent) {
      // Fare ya da odak bildirimin üzerindeyken süre durur (okumak/eyleme ulaşmak için).
      const pause = (): void => this.pause(entry);
      const resume = (): void => this.arm(entry);
      toast.addEventListener('pointerenter', pause);
      toast.addEventListener('pointerleave', resume);
      toast.addEventListener('focusin', pause);
      toast.addEventListener('focusout', resume);
      this.arm(entry);
    }
  }

  /** Kalan süre kadar bir gizleme zamanlayıcısı kurar. */
  private arm(entry: ActiveToast): void {
    if (entry.closing || entry.persistent) return;
    if (entry.hideTimer !== null) window.clearTimeout(entry.hideTimer);
    entry.startedAt = performance.now();
    entry.hideTimer = window.setTimeout(() => this.close(entry), Math.max(0, entry.remainingMs));
  }

  private pause(entry: ActiveToast): void {
    if (entry.hideTimer === null) return;
    window.clearTimeout(entry.hideTimer);
    entry.hideTimer = null;
    entry.remainingMs = Math.max(0, entry.remainingMs - (performance.now() - entry.startedAt));
  }

  /** Fade-out ile kapatır; yer açılınca sıradaki bildirim gösterilir. */
  private close(entry: ActiveToast): void {
    if (entry.closing) return;
    entry.closing = true;
    if (entry.hideTimer !== null) window.clearTimeout(entry.hideTimer);
    entry.hideTimer = null;
    entry.element.classList.remove('vol-toast--visible');
    // transitionend yerine timer kullanılır — çünkü transitionend
    // prefers-reduced-motion veya arka plan sekmesinde hiç tetiklenmeyebilir
    // ve toast'u DOM'da görünmez sıkışmış bırakır.
    entry.timeoutIds.push(
      window.setTimeout(() => {
        this.remove(entry);
        this.drain();
      }, TOAST_FADE_OUT_MS),
    );
  }

  /** Geçişsiz kaldırır (yer değiştirme/söküm). */
  private remove(entry: ActiveToast): void {
    this.clearTimers(entry);
    entry.destroyables.forEach((item) => item.destroy());
    entry.element.remove();
    const index = this.active.indexOf(entry);
    if (index !== -1) this.active.splice(index, 1);
  }

  private clearTimers(entry: ActiveToast): void {
    cancelAnimationFrame(entry.rafId);
    if (entry.hideTimer !== null) window.clearTimeout(entry.hideTimer);
    entry.hideTimer = null;
    for (const id of entry.timeoutIds) window.clearTimeout(id);
  }
}
