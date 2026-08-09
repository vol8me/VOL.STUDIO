import { UI_TIMING } from '../../constants';

export type TooltipPlacement = 'top' | 'bottom';

export interface TooltipOptions {
  placement?: TooltipPlacement;
  delayMs?: number;
  /** Balonun ekleneceği kapsayıcı. Varsayılan document.body — .vol-ui-root içinde tutmak için uiRoot.element geçin. */
  container?: HTMLElement;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

/** Balonun viewport kenarlarından tuttuğu minimum boşluk (piksel). */
const VIEWPORT_MARGIN = 4;

/** Hedef ile balon arasındaki dikey boşluk (piksel). */
const TARGET_GAP = 8;

let tooltipInstanceCounter = 0;

/** Bir hedef elementte fare hover veya klavye odağıyla tetiklenen bilgi balonu. Dokunmatikte tetiklenmez (hover yok). */
export class Tooltip {
  private readonly bubble: HTMLDivElement;
  private readonly target: HTMLElement;
  private readonly placement: TooltipPlacement;
  private readonly delayMs: number;
  private readonly container: HTMLElement;
  private showTimeout?: ReturnType<typeof setTimeout>;
  private boundShow: () => void;
  private boundHide: () => void;

  constructor(target: HTMLElement, text: string, options: TooltipOptions = {}) {
    const {
      placement = 'top',
      delayMs = UI_TIMING.TOOLTIP_DEFAULT_DELAY,
      container = document.body,
    } = options;
    this.target = target;
    this.placement = placement;
    this.delayMs = delayMs;
    this.container = container;

    this.bubble = document.createElement('div');
    this.bubble.className = [`vol-tooltip vol-tooltip--${placement}`, options.className]
      .filter(Boolean)
      .join(' ');
    this.bubble.textContent = text;
    this.bubble.setAttribute('role', 'tooltip');
    // role="tooltip" tek başına hiçbir şey anons etmez — ekran okuyucu yalnızca
    // hedeften bir aria-describedby bağlantısıyla okur, aşağıda ayarlanır.
    this.bubble.id = `vol-tooltip-${++tooltipInstanceCounter}`;
    this.target.setAttribute('aria-describedby', this.bubble.id);

    this.boundShow = () => this.scheduleShow();
    this.boundHide = () => this.hide();

    this.target.addEventListener('mouseenter', this.boundShow);
    this.target.addEventListener('mouseleave', this.boundHide);
    this.target.addEventListener('focus', this.boundShow);
    this.target.addEventListener('blur', this.boundHide);
  }

  setText(text: string): void {
    this.bubble.textContent = text;
  }

  destroy(): void {
    clearTimeout(this.showTimeout);
    if (this.target.getAttribute('aria-describedby') === this.bubble.id) {
      this.target.removeAttribute('aria-describedby');
    }
    this.target.removeEventListener('mouseenter', this.boundShow);
    this.target.removeEventListener('mouseleave', this.boundHide);
    this.target.removeEventListener('focus', this.boundShow);
    this.target.removeEventListener('blur', this.boundHide);
    this.bubble.remove();
  }

  private scheduleShow(): void {
    clearTimeout(this.showTimeout);
    this.showTimeout = setTimeout(() => this.show(), this.delayMs);
  }

  private show(): void {
    if (!this.bubble.isConnected) {
      this.container.appendChild(this.bubble);
    }

    const targetRect = this.target.getBoundingClientRect();
    const bubbleRect = this.bubble.getBoundingClientRect();

    // Her iki eksende sınırlandırılır; dikeyde yer yoksa karşı tarafa çevrilir.
    const maxLeft = window.innerWidth - bubbleRect.width - VIEWPORT_MARGIN;
    const left = targetRect.left + targetRect.width / 2 - bubbleRect.width / 2;

    const topCandidate = targetRect.top - bubbleRect.height - TARGET_GAP;
    const bottomCandidate = targetRect.bottom + TARGET_GAP;
    const fitsAbove = topCandidate >= VIEWPORT_MARGIN;
    const fitsBelow = bottomCandidate + bubbleRect.height <= window.innerHeight - VIEWPORT_MARGIN;

    let top: number;
    if (this.placement === 'top') {
      top = fitsAbove || !fitsBelow ? topCandidate : bottomCandidate;
    } else {
      top = fitsBelow || !fitsAbove ? bottomCandidate : topCandidate;
    }

    this.bubble.style.left = `${Math.min(
      Math.max(VIEWPORT_MARGIN, left),
      Math.max(VIEWPORT_MARGIN, maxLeft),
    )}px`;
    this.bubble.style.top = `${Math.max(VIEWPORT_MARGIN, top)}px`;
    this.bubble.classList.add('vol-tooltip--visible');
  }

  private hide(): void {
    clearTimeout(this.showTimeout);
    this.bubble.classList.remove('vol-tooltip--visible');
  }
}
