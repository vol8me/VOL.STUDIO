import { i18next } from '../../systems/I18n';

export type SplitPaneDirection = 'horizontal' | 'vertical';
export type SplitPaneSide = 'primary' | 'secondary';

export interface SplitPaneOptions {
  direction?: SplitPaneDirection;
  primary: HTMLElement | { element: HTMLElement };
  secondary: HTMLElement | { element: HTMLElement };
  initialSize?: number;
  minPrimary?: number;
  minSecondary?: number;
  maxPrimary?: number;
  keyboardStep?: number;
  separatorLabel?: string;
  className?: string;
  onResize?: (primarySize: number) => void;
  onCommit?: (primarySize: number) => void;
}

/** Yeniden boyutlandırılabilir, daraltılabilir iki bölgeli workbench yerleşimi. */
export class SplitPane {
  readonly element: HTMLDivElement;
  readonly primaryPane: HTMLDivElement;
  readonly secondaryPane: HTMLDivElement;
  readonly separator: HTMLDivElement;
  private readonly direction: SplitPaneDirection;
  private readonly minPrimary: number;
  private readonly minSecondary: number;
  private readonly maxPrimary: number;
  private readonly keyboardStep: number;
  private readonly onResizeHandler?: (size: number) => void;
  private readonly onCommitHandler?: (size: number) => void;
  private readonly separatorLabelIsI18n: boolean;
  private size: number;
  /** Kullanıcının seçtiği boyut; pencere daralsa da korunur. */
  private desiredSize: number;
  private collapsed: SplitPaneSide | null = null;
  private drag: { pointerId: number; origin: number; size: number } | null = null;
  private readonly boundPointerDown: (event: PointerEvent) => void;
  private readonly boundPointerMove: (event: PointerEvent) => void;
  private readonly boundPointerEnd: (event: PointerEvent) => void;
  private readonly boundKeydown: (event: KeyboardEvent) => void;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly onLanguageChanged: () => void;

  constructor(options: SplitPaneOptions) {
    this.direction = options.direction ?? 'horizontal';
    this.minPrimary = Math.max(0, options.minPrimary ?? 120);
    this.minSecondary = Math.max(0, options.minSecondary ?? 120);
    this.maxPrimary = Math.max(this.minPrimary, options.maxPrimary ?? Number.POSITIVE_INFINITY);
    this.keyboardStep = Math.max(1, options.keyboardStep ?? 8);
    this.size = this.clamp(options.initialSize ?? 280);
    this.desiredSize = this.size;
    this.onResizeHandler = options.onResize;
    this.onCommitHandler = options.onCommit;
    this.separatorLabelIsI18n = options.separatorLabel === undefined;

    this.element = document.createElement('div');
    this.element.className = [
      'vol-split-pane',
      `vol-split-pane--${this.direction}`,
      options.className,
    ]
      .filter(Boolean)
      .join(' ');

    this.primaryPane = document.createElement('div');
    this.primaryPane.className = 'vol-split-pane__pane vol-split-pane__pane--primary';
    this.primaryPane.appendChild(this.unwrap(options.primary));
    this.element.appendChild(this.primaryPane);

    this.separator = document.createElement('div');
    this.separator.className = 'vol-split-pane__separator';
    this.separator.tabIndex = 0;
    this.separator.setAttribute('role', 'separator');
    this.separator.setAttribute(
      'aria-orientation',
      this.direction === 'horizontal' ? 'vertical' : 'horizontal',
    );
    this.separator.setAttribute(
      'aria-label',
      options.separatorLabel ?? i18next.t('core:splitPane.resize'),
    );
    this.element.appendChild(this.separator);

    this.secondaryPane = document.createElement('div');
    this.secondaryPane.className = 'vol-split-pane__pane vol-split-pane__pane--secondary';
    this.secondaryPane.appendChild(this.unwrap(options.secondary));
    this.element.appendChild(this.secondaryPane);

    this.boundPointerDown = (event) => this.startDrag(event);
    this.boundPointerMove = (event) => this.moveDrag(event);
    this.boundPointerEnd = (event) => this.endDrag(event);
    this.boundKeydown = (event) => this.handleKeydown(event);
    this.separator.addEventListener('pointerdown', this.boundPointerDown);
    this.separator.addEventListener('pointermove', this.boundPointerMove);
    this.separator.addEventListener('pointerup', this.boundPointerEnd);
    this.separator.addEventListener('pointercancel', this.boundPointerEnd);
    this.separator.addEventListener('keydown', this.boundKeydown);

    this.onLanguageChanged = () => {
      if (this.separatorLabelIsI18n) {
        this.separator.setAttribute('aria-label', i18next.t('core:splitPane.resize'));
      }
    };
    i18next.on('languageChanged', this.onLanguageChanged);

    this.resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (this.collapsed) return;
            // Görünen boyut kullanıcının TERCİHİNDEN yeniden türetilir, mevcut
            // boyuttan değil. Bir dönem clamp sonucu tercihin üzerine yazılıyordu:
            // pencere daraltılıp yeniden genişletildiğinde kullanıcının seçtiği
            // bölme boyutu kalıcı olarak küçülmüş kalıyordu.
            const next = this.clamp(this.desiredSize);
            if (next === this.size) return;
            this.size = next;
            this.render();
          });
    this.resizeObserver?.observe(this.element);
    this.render();
  }

  getSize(): number {
    return this.size;
  }

  /** Programatik resize sessizdir. */
  setSize(size: number): void {
    this.collapsed = null;
    this.desiredSize = size;
    this.size = this.clamp(size);
    this.render();
  }

  collapsePane(side: SplitPaneSide): void {
    if (!this.collapsed) this.desiredSize = this.size;
    this.collapsed = side;
    this.render();
  }

  expandPane(): void {
    if (!this.collapsed) return;
    this.collapsed = null;
    this.size = this.clamp(this.desiredSize);
    this.render();
  }

  togglePane(side: SplitPaneSide): void {
    if (this.collapsed === side) this.expandPane();
    else this.collapsePane(side);
  }

  getCollapsedPane(): SplitPaneSide | null {
    return this.collapsed;
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.resizeObserver?.disconnect();
    this.separator.removeEventListener('pointerdown', this.boundPointerDown);
    this.separator.removeEventListener('pointermove', this.boundPointerMove);
    this.separator.removeEventListener('pointerup', this.boundPointerEnd);
    this.separator.removeEventListener('pointercancel', this.boundPointerEnd);
    this.separator.removeEventListener('keydown', this.boundKeydown);
    this.releaseDrag();
    this.element.remove();
  }

  private unwrap(value: HTMLElement | { element: HTMLElement }): HTMLElement {
    return value instanceof HTMLElement ? value : value.element;
  }

  private startDrag(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (this.collapsed) this.expandPane();
    this.drag = {
      pointerId: event.pointerId,
      origin: this.direction === 'horizontal' ? event.clientX : event.clientY,
      size: this.size,
    };
    this.separator.setPointerCapture(event.pointerId);
    this.element.classList.add('vol-split-pane--resizing');
    event.preventDefault();
  }

  private moveDrag(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const position = this.direction === 'horizontal' ? event.clientX : event.clientY;
    this.updateFromUser(this.drag.size + position - this.drag.origin, false);
  }

  private endDrag(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.releaseDrag();
    this.onCommitHandler?.(this.size);
  }

  private releaseDrag(): void {
    if (!this.drag) return;
    if (this.separator.hasPointerCapture(this.drag.pointerId)) {
      this.separator.releasePointerCapture(this.drag.pointerId);
    }
    this.drag = null;
    this.element.classList.remove('vol-split-pane--resizing');
  }

  private handleKeydown(event: KeyboardEvent): void {
    const decrease = this.direction === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const increase = this.direction === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    const amount = event.shiftKey ? this.keyboardStep * 4 : this.keyboardStep;
    let next: number | null = null;
    if (event.key === decrease) next = this.size - amount;
    else if (event.key === increase) next = this.size + amount;
    else if (event.key === 'Home') next = this.minPrimary;
    else if (event.key === 'End') {
      const maximum = this.maximumSize();
      if (Number.isFinite(maximum)) next = maximum;
    }
    if (next === null) return;
    event.preventDefault();
    if (this.collapsed) this.expandPane();
    this.updateFromUser(next, true);
  }

  private updateFromUser(size: number, commit: boolean): void {
    const next = this.clamp(size);
    if (next === this.size) {
      if (commit) this.onCommitHandler?.(this.size);
      return;
    }
    this.size = next;
    this.desiredSize = next;
    this.render();
    this.onResizeHandler?.(next);
    if (commit) this.onCommitHandler?.(next);
  }

  private clamp(size: number): number {
    if (!Number.isFinite(size)) return this.minPrimary;
    return Math.min(this.maximumSize(), Math.max(this.minPrimary, size));
  }

  private maximumSize(): number {
    const total =
      this.direction === 'horizontal'
        ? this.element?.clientWidth ?? 0
        : this.element?.clientHeight ?? 0;
    const available =
      total > 0 ? Math.max(this.minPrimary, total - this.minSecondary) : this.maxPrimary;
    return Math.max(this.minPrimary, Math.min(this.maxPrimary, available));
  }

  private render(): void {
    this.element.style.setProperty('--vol-split-primary-size', `${this.size}px`);
    this.primaryPane.hidden = this.collapsed === 'primary';
    this.secondaryPane.hidden = this.collapsed === 'secondary';
    this.element.classList.toggle(
      'vol-split-pane--primary-collapsed',
      this.collapsed === 'primary',
    );
    this.element.classList.toggle(
      'vol-split-pane--secondary-collapsed',
      this.collapsed === 'secondary',
    );
    this.separator.setAttribute('aria-valuemin', String(this.minPrimary));
    const maximum = this.maximumSize();
    if (Number.isFinite(maximum)) this.separator.setAttribute('aria-valuemax', String(maximum));
    else this.separator.removeAttribute('aria-valuemax');
    this.separator.setAttribute(
      'aria-valuenow',
      String(this.collapsed === 'primary' ? 0 : this.size),
    );
  }
}
