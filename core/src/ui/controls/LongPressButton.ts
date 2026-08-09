import { UI_SIZE, UI_TIMING } from '../../constants';

export interface LongPressButtonOptions {
  shape?: 'circle' | 'square';
  size?: number;
  icon?: string | Node;
  /** Erişilebilirlik için zorunlu. */
  label: string;
  /** Uzun basış eşiği (milisaniye). Varsayılan 500. */
  longPressDurationMs?: number;
  /** Eşik dolmadan (kısa) bırakılırsa çağrılır — ör. "seç". */
  onTap?: () => void;
  /** Eşik dolduğunda (bırakılmadan, basılıyken) BİR KEZ çağrılır — ör. "bağlam menüsü aç". */
  onLongPress?: () => void;
  /** Basılı tutma başladığında (eşik dolmadan önce) çağrılır. */
  onPressStart?: () => void;
  /** Her durumda (tap veya long-press sonrası) bırakıldığında çağrılır. */
  onRelease?: () => void;
}

/**
 * Kısa basış ile uzun basışı ayrı eylemlere yönlendiren buton ("kısa dokun =
 * seç, basılı tut = bağlam menüsü" pattern'i). ChargeButton'dan farkı: kademeli
 * bir güç değeri raporlanmaz, yalnızca tek bir eşik anı vardır — `onLongPress`
 * eşiğe ulaşınca bir kez ateşlenir. Basılı tutulurken ChargeButton'la aynı
 * SVG stroke-dashoffset deseniyle ince bir ilerleme halkası dolar (salt görsel
 * ipucu, `onChargeProgress` karşılığı yok). `onTap`, basılı tutmayla tetiklenmez.
 */
export class LongPressButton {
  readonly element: HTMLButtonElement;
  private readonly ring: SVGCircleElement | SVGRectElement;
  private readonly ringLength = 1000;
  private readonly longPressDurationMs: number;
  private readonly onTapHandler?: () => void;
  private readonly onLongPressHandler?: () => void;
  private readonly onPressStartHandler?: () => void;
  private readonly onReleaseHandler?: () => void;
  private longPressTimeout: number | null = null;
  private longPressFired = false;
  private pressStartTime = 0;
  private progressRafHandle: number | null = null;
  private activePointerId: number | null = null;
  private boundPointerDown: (event: PointerEvent) => void;
  private boundPointerUp: (event: PointerEvent) => void;
  private boundPointerLeave: () => void;

  constructor(options: LongPressButtonOptions) {
    const { shape = 'circle', size = UI_SIZE.BUTTON_DEFAULT, icon, label } = options;
    this.longPressDurationMs = options.longPressDurationMs ?? UI_TIMING.LONG_PRESS_DURATION;
    this.onTapHandler = options.onTap;
    this.onLongPressHandler = options.onLongPress;
    this.onPressStartHandler = options.onPressStart;
    this.onReleaseHandler = options.onRelease;

    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = `vol-long-press-button vol-long-press-button--${shape}`;
    this.element.style.setProperty('--vol-long-press-button-size', `${size}px`);
    this.element.style.touchAction = 'none';
    this.element.setAttribute('aria-label', label);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('vol-long-press-button__ring');
    svg.setAttribute('viewBox', '0 0 100 100');

    const trackEl =
      shape === 'square'
        ? document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        : document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    trackEl.classList.add('vol-long-press-button__ring-track');
    const fillEl =
      shape === 'square'
        ? document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        : document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    fillEl.classList.add('vol-long-press-button__ring-fill');

    if (shape === 'square') {
      trackEl.setAttribute('x', '4');
      trackEl.setAttribute('y', '4');
      trackEl.setAttribute('width', '92');
      trackEl.setAttribute('height', '92');
      trackEl.setAttribute('rx', '8');
      trackEl.setAttribute('ry', '8');
      trackEl.setAttribute('pathLength', '1000');
      fillEl.setAttribute('x', '4');
      fillEl.setAttribute('y', '4');
      fillEl.setAttribute('width', '92');
      fillEl.setAttribute('height', '92');
      fillEl.setAttribute('rx', '8');
      fillEl.setAttribute('ry', '8');
      fillEl.setAttribute('pathLength', '1000');
    } else {
      trackEl.setAttribute('cx', '50');
      trackEl.setAttribute('cy', '50');
      trackEl.setAttribute('r', '46');
      trackEl.setAttribute('pathLength', '1000');
      fillEl.setAttribute('cx', '50');
      fillEl.setAttribute('cy', '50');
      fillEl.setAttribute('r', '46');
      fillEl.setAttribute('pathLength', '1000');
    }

    svg.appendChild(trackEl);

    this.ring = fillEl;
    this.ring.style.strokeDasharray = String(this.ringLength);
    this.ring.style.strokeDashoffset = String(this.ringLength);
    svg.appendChild(this.ring);

    this.element.appendChild(svg);

    if (icon) {
      const iconWrapper = document.createElement('span');
      iconWrapper.className = 'vol-long-press-button__icon';
      if (typeof icon === 'string') {
        iconWrapper.textContent = icon;
      } else {
        iconWrapper.appendChild(icon);
      }
      this.element.appendChild(iconWrapper);
    }

    this.boundPointerDown = (event) => {
      if (this.element.disabled) return;
      event.preventDefault();
      this.activePointerId = event.pointerId;
      this.element.setPointerCapture(event.pointerId);
      this.longPressFired = false;
      this.pressStartTime = performance.now();
      this.element.classList.add('vol-long-press-button--pressed');
      this.onPressStartHandler?.();
      this.tickProgress();

      this.longPressTimeout = window.setTimeout(() => {
        this.longPressTimeout = null;
        this.longPressFired = true;
        this.element.classList.add('vol-long-press-button--long-pressed');
        this.onLongPressHandler?.();
      }, this.longPressDurationMs);
    };

    this.boundPointerUp = (event) => {
      if (this.activePointerId !== event.pointerId) return;
      this.element.releasePointerCapture(event.pointerId);
      this.clearPressState();

      // Eşik dolduysa (longPressFired) onTap tetiklenmez — iki eylem birbirini dışlar.
      if (!this.longPressFired) {
        this.onTapHandler?.();
      }
      this.onReleaseHandler?.();
    };

    this.boundPointerLeave = () => {
      if (this.activePointerId === null) return;
      // Parmak dışarı kayarsa basış iptal sayılır — ne onTap ne onLongPress tetiklenir.
      this.clearPressState();
      this.activePointerId = null;
      this.onReleaseHandler?.();
    };

    this.element.addEventListener('pointerdown', this.boundPointerDown);
    this.element.addEventListener('pointerup', this.boundPointerUp);
    this.element.addEventListener('pointercancel', this.boundPointerUp);
    this.element.addEventListener('pointerleave', this.boundPointerLeave);
  }

  isPressed(): boolean {
    return this.activePointerId !== null;
  }

  setDisabled(disabled: boolean): void {
    this.element.disabled = disabled;
    if (disabled) {
      this.clearPressState();
      this.activePointerId = null;
    }
  }

  destroy(): void {
    if (this.longPressTimeout !== null) window.clearTimeout(this.longPressTimeout);
    if (this.progressRafHandle !== null) cancelAnimationFrame(this.progressRafHandle);
    this.element.removeEventListener('pointerdown', this.boundPointerDown);
    this.element.removeEventListener('pointerup', this.boundPointerUp);
    this.element.removeEventListener('pointercancel', this.boundPointerUp);
    this.element.removeEventListener('pointerleave', this.boundPointerLeave);
    this.element.remove();
  }

  /** Basılı tutulduğu sürece halkayı eşiğe doğru dolduran rAF döngüsü (ChargeButton.tick()'in aynı deseni, yalnızca görsel). */
  private tickProgress(): void {
    if (this.activePointerId === null) return;

    const elapsed = performance.now() - this.pressStartTime;
    const progress = Math.min(1, elapsed / this.longPressDurationMs);
    const offset = this.ringLength * (1 - progress);
    this.ring.style.strokeDashoffset = String(offset);

    if (progress >= 1) {
      this.progressRafHandle = null;
      return;
    }
    this.progressRafHandle = requestAnimationFrame(() => this.tickProgress());
  }

  private clearPressState(): void {
    if (this.longPressTimeout !== null) {
      window.clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    }
    if (this.progressRafHandle !== null) {
      cancelAnimationFrame(this.progressRafHandle);
      this.progressRafHandle = null;
    }
    this.activePointerId = null;
    this.element.classList.remove(
      'vol-long-press-button--pressed',
      'vol-long-press-button--long-pressed',
    );
    this.ring.style.strokeDashoffset = String(this.ringLength);
  }
}
