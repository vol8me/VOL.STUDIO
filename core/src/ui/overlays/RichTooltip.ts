export type TooltipPlacement = 'top' | 'bottom';

export interface RichTooltipStat {
  label: string;
  value: string;
  /** Değeri vurgular (ör. silahın hasar istatistiğini kırmızıyla gösterme). */
  tone?: 'success' | 'warning' | 'danger';
}

export interface RichTooltipContent {
  title: string;
  /** Başlığın altında, istatistiklerden önce gösterilen serbest metin (ör. item açıklaması). */
  description?: string;
  /** Etiket-değer satırları (ör. Hasar: 42, Menzil: 4) karşılaştırma kartları için. */
  stats?: RichTooltipStat[];
}

export interface RichTooltipOptions {
  placement?: TooltipPlacement;
  delayMs?: number;
  /** Balonun ekleneceği kapsayıcı. Varsayılan document.body — .vol-ui-root içinde tutmak için uiRoot.element geçin. */
  container?: HTMLElement;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

/**
 * Tooltip'in yapılandırılmış içerikli versiyonu: düz metin yerine başlık +
 * açıklama + etiket-değer istatistik satırları. Konumlama/göster-gizle
 * davranışı Tooltip ile aynıdır — yalnızca içerik farklıdır.
 */
export class RichTooltip {
  private readonly bubble: HTMLDivElement;
  private readonly target: HTMLElement;
  private readonly placement: TooltipPlacement;
  private readonly delayMs: number;
  private readonly container: HTMLElement;
  private showTimeout?: ReturnType<typeof setTimeout>;
  private boundShow: () => void;
  private boundHide: () => void;

  constructor(target: HTMLElement, content: RichTooltipContent, options: RichTooltipOptions = {}) {
    const { placement = 'top', delayMs = 300, container = document.body } = options;
    this.target = target;
    this.placement = placement;
    this.delayMs = delayMs;
    this.container = container;

    this.bubble = document.createElement('div');
    this.bubble.className = [`vol-rich-tooltip vol-rich-tooltip--${placement}`, options.className].filter(Boolean).join(' ');
    this.bubble.setAttribute('role', 'tooltip');
    this.renderContent(content);

    this.boundShow = () => this.scheduleShow();
    this.boundHide = () => this.hide();

    this.target.addEventListener('mouseenter', this.boundShow);
    this.target.addEventListener('mouseleave', this.boundHide);
    this.target.addEventListener('focus', this.boundShow);
    this.target.addEventListener('blur', this.boundHide);
  }

  setContent(content: RichTooltipContent): void {
    this.renderContent(content);
  }

  destroy(): void {
    clearTimeout(this.showTimeout);
    this.target.removeEventListener('mouseenter', this.boundShow);
    this.target.removeEventListener('mouseleave', this.boundHide);
    this.target.removeEventListener('focus', this.boundShow);
    this.target.removeEventListener('blur', this.boundHide);
    this.bubble.remove();
  }

  private renderContent(content: RichTooltipContent): void {
    this.bubble.replaceChildren();

    const title = document.createElement('div');
    title.className = 'vol-rich-tooltip__title';
    title.textContent = content.title;
    this.bubble.appendChild(title);

    if (content.description) {
      const description = document.createElement('div');
      description.className = 'vol-rich-tooltip__description';
      description.textContent = content.description;
      this.bubble.appendChild(description);
    }

    if (content.stats?.length) {
      const statsList = document.createElement('div');
      statsList.className = 'vol-rich-tooltip__stats';
      for (const stat of content.stats) {
        const row = document.createElement('div');
        row.className = 'vol-rich-tooltip__stat-row';

        const label = document.createElement('span');
        label.className = 'vol-rich-tooltip__stat-label';
        label.textContent = stat.label;
        row.appendChild(label);

        const value = document.createElement('span');
        value.className = `vol-rich-tooltip__stat-value${
          stat.tone ? ` vol-rich-tooltip__stat-value--${stat.tone}` : ''
        }`;
        value.textContent = stat.value;
        row.appendChild(value);

        statsList.appendChild(row);
      }
      this.bubble.appendChild(statsList);
    }
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
    const left = targetRect.left + targetRect.width / 2 - bubbleRect.width / 2;
    const top =
      this.placement === 'top' ? targetRect.top - bubbleRect.height - 8 : targetRect.bottom + 8;

    this.bubble.style.left = `${Math.max(4, left)}px`;
    this.bubble.style.top = `${top}px`;
    this.bubble.classList.add('vol-rich-tooltip--visible');
  }

  private hide(): void {
    clearTimeout(this.showTimeout);
    this.bubble.classList.remove('vol-rich-tooltip--visible');
  }
}
