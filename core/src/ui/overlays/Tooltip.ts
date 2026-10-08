import { UI_TIMING } from '../../constants';
import { bindBubble, type BubbleBinding } from './tooltipBehavior';

export type TooltipPlacement = 'top' | 'bottom';

export interface TooltipOptions {
  placement?: TooltipPlacement;
  delayMs?: number;
  /** Balonun ekleneceği kapsayıcı. Varsayılan document.body — .vol-ui-root içinde tutmak için uiRoot.element geçin. */
  container?: HTMLElement;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

let tooltipInstanceCounter = 0;

/** Bir hedef elementte fare hover veya klavye odağıyla tetiklenen bilgi balonu. Dokunmatikte tetiklenmez (hover yok). */
export class Tooltip {
  private readonly bubble: HTMLDivElement;
  private readonly binding: BubbleBinding;

  constructor(target: HTMLElement, text: string, options: TooltipOptions = {}) {
    const {
      placement = 'top',
      delayMs = UI_TIMING.TOOLTIP_DEFAULT_DELAY_MS,
      container = document.body,
    } = options;

    this.bubble = document.createElement('div');
    this.bubble.className = [`vol-tooltip vol-tooltip--${placement}`, options.className]
      .filter(Boolean)
      .join(' ');
    this.bubble.textContent = text;
    this.bubble.setAttribute('role', 'tooltip');
    // role="tooltip" tek başına hiçbir şey anons etmez — ekran okuyucu yalnızca hedeften bir
    // aria-describedby bağlantısıyla okur; bağı davranış çekirdeği kurar.
    this.bubble.id = `vol-tooltip-${++tooltipInstanceCounter}`;
    this.binding = bindBubble({
      target,
      bubble: this.bubble,
      placement,
      delayMs,
      container,
      visibleClass: 'vol-tooltip--visible',
    });
  }

  setText(text: string): void {
    this.bubble.textContent = text;
  }

  destroy(): void {
    this.binding.destroy();
    this.bubble.remove();
  }
}
