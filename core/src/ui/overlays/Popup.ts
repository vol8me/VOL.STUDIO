import { UI_THRESHOLD } from '../../constants';

export type PopupPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

export interface PopupOptions {
  placement?: PopupPlacement;
  /** Açıkken dışa tıklamada kapat. Varsayılan true. */
  closeOnOutsideClick?: boolean;
  onClose?: () => void;
  /** Popup'ın ekleneceği kapsayıcı. Varsayılan document.body — .vol-ui-root içinde tutmak için uiRoot.element geçin. */
  container?: HTMLElement;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

/**
 * Bir hedef elemente anchored, dışa-tıklama/Escape-kapatılabilir konumlu
 * katmanın temeli. Select ve ContextMenu bunun üzerine kuruludur. Modal'dan
 * farkı: scrim/focus-trap yok, hedefin yanında belirir ve sayfanın geri
 * kalanıyla aynı anda etkileşime izin verir.
 */
export class Popup {
  readonly element: HTMLDivElement;
  private readonly target: HTMLElement;
  private readonly placement: PopupPlacement;
  private readonly closeOnOutsideClick: boolean;
  private readonly onCloseHandler?: () => void;
  private readonly container: HTMLElement;
  private open = false;
  private destroyed = false;
  private boundOutsideClick: (event: MouseEvent) => void;
  private readonly boundReposition: () => void;
  private boundKeydown: (event: KeyboardEvent) => void;

  constructor(target: HTMLElement, options: PopupOptions = {}) {
    const {
      placement = 'bottom-start',
      closeOnOutsideClick = true,
      onClose,
      container = document.body,
    } = options;
    this.target = target;
    this.placement = placement;
    this.closeOnOutsideClick = closeOnOutsideClick;
    this.onCloseHandler = onClose;
    this.container = container;

    this.element = document.createElement('div');
    this.element.className = ['vol-popup', options.className].filter(Boolean).join(' ');

    this.boundOutsideClick = (event) => {
      const path = event.composedPath();
      const inside = path.includes(this.element) || path.includes(this.target);
      if (!inside) {
        this.close();
      }
    };

    this.boundKeydown = (event) => {
      if (event.key === 'Escape') {
        this.close();
      }
    };

    // Popup viewport koordinatlariyla konumlanir; acikken sayfa kaydirilir veya
    // pencere yeniden boyutlanirsa hedefinden kopup havada kalirdi.
    this.boundReposition = () => this.reposition();
  }

  add(node: { element: HTMLElement }): this {
    this.element.appendChild(node.element);
    return this;
  }

  show(): void {
    if (this.destroyed || this.open) return;
    this.open = true;

    if (!this.element.isConnected) {
      this.container.appendChild(this.element);
    }

    this.reposition();
    this.element.classList.add('vol-popup--visible');

    if (this.closeOnOutsideClick) {
      // Listener'ı bir microtask'te eklemek show()'u tetikleyen aynı tıklamada
      // tetiklenmesini önler. open/destroyed kontrolü aradaki senkron close()/destroy()'a
      // karşı korur — aksi halde sarkan listener kalırdı.
      queueMicrotask(() => {
        if (this.destroyed || !this.open) return;
        document.addEventListener('click', this.boundOutsideClick);
      });
    }
    document.addEventListener('keydown', this.boundKeydown);
    // capture: true — ic scroll konteynerlerinin kaydirmasi da yakalanmali.
    window.addEventListener('scroll', this.boundReposition, { capture: true, passive: true });
    window.addEventListener('resize', this.boundReposition);
  }

  close(): void {
    if (this.destroyed || !this.open) return;
    this.open = false;

    this.element.classList.remove('vol-popup--visible');
    document.removeEventListener('click', this.boundOutsideClick);
    document.removeEventListener('keydown', this.boundKeydown);
    window.removeEventListener('scroll', this.boundReposition, { capture: true });
    window.removeEventListener('resize', this.boundReposition);
    this.onCloseHandler?.();
  }

  toggle(): void {
    if (this.open) {
      this.close();
    } else {
      this.show();
    }
  }

  isOpen(): boolean {
    return this.open;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.open = false;
    this.element.classList.remove('vol-popup--visible');
    document.removeEventListener('click', this.boundOutsideClick);
    document.removeEventListener('keydown', this.boundKeydown);
    window.removeEventListener('scroll', this.boundReposition, { capture: true });
    window.removeEventListener('resize', this.boundReposition);
    this.element.remove();
  }

  /** Tercih edilen `placement` boyunca konumlandırır, viewport'tan taşarsa karşı tarafa çevirir. */
  private reposition(): void {
    const targetRect = this.target.getBoundingClientRect();
    const popupWidth = this.element.offsetWidth;
    const popupHeight = this.element.offsetHeight;
    const margin = UI_THRESHOLD.POPUP_MARGIN;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let openUp = this.placement.startsWith('top');
    const spaceBelow = viewportHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;
    if (!openUp && spaceBelow < popupHeight + margin && spaceAbove > spaceBelow) {
      openUp = true;
    } else if (openUp && spaceAbove < popupHeight + margin && spaceBelow > spaceAbove) {
      openUp = false;
    }

    let alignEnd = this.placement.endsWith('end');
    const spaceRightFromStart = viewportWidth - targetRect.left;
    if (!alignEnd && spaceRightFromStart < popupWidth + margin) {
      alignEnd = true;
    }

    const left = alignEnd ? targetRect.right - popupWidth : targetRect.left;
    const clampedLeft = Math.min(Math.max(margin, left), viewportWidth - popupWidth - margin);

    const top = openUp ? targetRect.top - popupHeight - margin : targetRect.bottom + margin;
    const clampedTop = Math.min(Math.max(margin, top), viewportHeight - popupHeight - margin);

    this.element.style.left = `${clampedLeft}px`;
    this.element.style.top = `${clampedTop}px`;
  }
}
