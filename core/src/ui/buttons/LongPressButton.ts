import { UI_SIZE, UI_TIMING } from '../../constants';
import { bindHoldInput } from './holdInput';

/** Klavye/kol basışının `activePointerId` yerine tuttuğu sahte kimlik (gerçek işaretçi kimlikleri ≥ 0). */
const NON_POINTER_PRESS = -1;

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
  private boundVisibility: () => void;
  private readonly unbindHoldInput: () => void;

  constructor(options: LongPressButtonOptions) {
    const { shape = 'circle', size = UI_SIZE.BUTTON_DEFAULT_PX, icon, label } = options;
    this.longPressDurationMs = options.longPressDurationMs ?? UI_TIMING.LONG_PRESS_DURATION_MS;
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
    // Oynanış denetimi: arayüz sesi çalmaz (ateş/şarj/yön sesi oyunun kendi SFX'idir); kök yedek `press` sesi de almaz.
    this.element.dataset.volSilent = '';
    this.element.setAttribute('aria-pressed', 'false');

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
      // Devam eden basışta ikinci işaretçi yok sayılır (ikinci zamanlayıcı ilkini sızdırırdı).
      if (this.element.disabled || this.activePointerId !== null) return;
      event.preventDefault();
      this.element.setPointerCapture(event.pointerId);
      this.beginPress(event.pointerId);
    };

    this.boundPointerUp = (event) => {
      if (this.activePointerId !== event.pointerId) return;
      this.element.releasePointerCapture(event.pointerId);
      this.endPress();
    };

    this.boundVisibility = () => {
      if (document.visibilityState === 'hidden') this.boundPointerLeave();
    };

    this.boundPointerLeave = () => {
      // Klavye/kol basışı imlecin çıkışından etkilenmez.
      if (this.activePointerId === null || this.activePointerId === NON_POINTER_PRESS) return;
      // Parmak dışarı kayarsa basış iptal sayılır — ne onTap ne onLongPress tetiklenir.
      this.clearPressState();
      this.activePointerId = null;
      this.onReleaseHandler?.();
    };

    this.element.addEventListener('pointerdown', this.boundPointerDown);
    this.element.addEventListener('pointerup', this.boundPointerUp);
    this.element.addEventListener('pointercancel', this.boundPointerLeave);
    this.element.addEventListener('lostpointercapture', this.boundPointerLeave);
    this.element.addEventListener('pointerleave', this.boundPointerLeave);
    document.addEventListener('visibilitychange', this.boundVisibility);
    // Klavye (Space/Enter) ve kol A: kısa basış `onTap`, eşik dolarsa `onLongPress`; odak kaybı iptaldir.
    this.unbindHoldInput = bindHoldInput(this.element, {
      down: () => this.beginPress(NON_POINTER_PRESS),
      up: () => this.endPress(),
      cancel: () => this.boundPointerLeave(),
      isBusy: () => this.activePointerId !== null,
    });
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
    this.element.removeEventListener('pointercancel', this.boundPointerLeave);
    this.element.removeEventListener('lostpointercapture', this.boundPointerLeave);
    this.element.removeEventListener('pointerleave', this.boundPointerLeave);
    document.removeEventListener('visibilitychange', this.boundVisibility);
    this.unbindHoldInput();
    this.element.remove();
  }

  private beginPress(pointerId: number): void {
    this.activePointerId = pointerId;
    this.longPressFired = false;
    this.pressStartTime = performance.now();
    this.element.classList.add('vol-long-press-button--pressed');
    this.element.setAttribute('aria-pressed', 'true');
    this.onPressStartHandler?.();
    this.tickProgress();

    this.longPressTimeout = window.setTimeout(() => {
      this.longPressTimeout = null;
      this.longPressFired = true;
      this.element.classList.add('vol-long-press-button--long-pressed');
      this.onLongPressHandler?.();
    }, this.longPressDurationMs);
  }

  /** Bırakış (işaretçi, klavye ya da kol): eşik dolduysa `onTap` tetiklenmez — iki eylem birbirini dışlar. */
  private endPress(): void {
    this.clearPressState();
    if (!this.longPressFired) {
      this.onTapHandler?.();
    }
    this.onReleaseHandler?.();
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
    this.element.setAttribute('aria-pressed', 'false');
    this.ring.style.strokeDashoffset = String(this.ringLength);
  }
}
