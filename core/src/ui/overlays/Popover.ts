import { Popup, type PopupPlacement } from './Popup';

let popoverId = 0;

export interface PopoverOptions {
  placement?: PopupPlacement;
  closeOnOutsideClick?: boolean;
  container?: HTMLElement;
  className?: string;
  role?: 'dialog' | 'menu' | 'listbox';
  ariaLabel?: string;
  focusOnOpen?: boolean;
  restoreFocus?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

/**
 * Palet ve araç seçenekleri gibi kısa, hedefe bağlı yüzeyler için erişilebilir
 * Popup sarmalayıcısı. Modal değildir; focus trap uygulamaz.
 */
export class Popover {
  readonly element: HTMLDivElement;
  private readonly target: HTMLElement;
  private readonly popup: Popup;
  private readonly focusOnOpen: boolean;
  private readonly restoreFocus: boolean;
  private readonly onOpenHandler?: () => void;
  private readonly originalAriaControls: string | null;
  private readonly originalAriaExpanded: string | null;
  private readonly originalAriaHaspopup: string | null;
  private destroyed = false;

  constructor(target: HTMLElement, options: PopoverOptions = {}) {
    this.target = target;
    this.focusOnOpen = options.focusOnOpen ?? true;
    this.restoreFocus = options.restoreFocus ?? true;
    this.onOpenHandler = options.onOpen;
    this.originalAriaControls = target.getAttribute('aria-controls');
    this.originalAriaExpanded = target.getAttribute('aria-expanded');
    this.originalAriaHaspopup = target.getAttribute('aria-haspopup');

    const id = `vol-popover-${++popoverId}`;
    this.popup = new Popup(target, {
      placement: options.placement,
      closeOnOutsideClick: options.closeOnOutsideClick,
      container: options.container,
      className: ['vol-popover', options.className].filter(Boolean).join(' '),
      onClose: () => {
        this.target.setAttribute('aria-expanded', 'false');
        // Odak yalnız popover'ın İÇİNDEYKEN tetikleyiciye döner. Dışarı
        // tıklamayla kapanışta kullanıcı zaten başka bir yeri (çoğu zaman bir
        // metin alanını) odaklamıştır; oradan odağı geri almak kullanıcıyı
        // yazmaya başladığı alandan atmak demektir.
        if (this.restoreFocus && this.target.isConnected && this.containsFocus()) {
          this.target.focus();
        }
        options.onClose?.();
      },
    });
    this.element = this.popup.element;
    this.element.id = id;
    this.element.setAttribute('role', options.role ?? 'dialog');
    if (options.ariaLabel) this.element.setAttribute('aria-label', options.ariaLabel);

    this.target.setAttribute('aria-controls', id);
    this.target.setAttribute('aria-expanded', 'false');
    if (!this.target.hasAttribute('aria-haspopup')) {
      this.target.setAttribute('aria-haspopup', options.role ?? 'dialog');
    }
  }

  add(node: HTMLElement | { element: HTMLElement }): this {
    this.element.appendChild(node instanceof HTMLElement ? node : node.element);
    return this;
  }

  show(): void {
    if (this.destroyed || this.popup.isOpen()) return;
    this.popup.show();
    this.target.setAttribute('aria-expanded', 'true');
    this.onOpenHandler?.();
    if (this.focusOnOpen) {
      queueMicrotask(() => {
        if (!this.popup.isOpen()) return;
        this.firstFocusable()?.focus();
      });
    }
  }

  close(): void {
    this.popup.close();
  }

  toggle(): void {
    if (this.popup.isOpen()) this.close();
    else this.show();
  }

  isOpen(): boolean {
    return this.popup.isOpen();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.popup.destroy();
    this.restoreAttribute('aria-controls', this.originalAriaControls);
    this.restoreAttribute('aria-expanded', this.originalAriaExpanded);
    this.restoreAttribute('aria-haspopup', this.originalAriaHaspopup);
  }

  /** Odak popover içinde mi (ya da zaten tetikleyicide mi). */
  private containsFocus(): boolean {
    const active = document.activeElement;
    return active !== null && (this.element.contains(active) || this.target === active);
  }

  private firstFocusable(): HTMLElement | null {
    return this.element.querySelector<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
  }

  private restoreAttribute(name: string, value: string | null): void {
    if (value === null) this.target.removeAttribute(name);
    else this.target.setAttribute(name, value);
  }
}
