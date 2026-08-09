import { UI_SIZE, UI_TIMING } from '../../constants';

export interface ChargeButtonOptions {
  label?: string;
  icon?: string | Node;
  /** Tam dolum için gereken basılı tutma süresi (milisaniye). Varsayılan 900. */
  chargeDurationMs?: number;
  /**
   * true ise erken bırakışta `onRelease` o anki doluluk oranıyla (0-1) çağrılır
   * (kademeli güç mekaniği için). false ise yalnızca tam dolumda `onCharged`
   * çağrılır, erken bırakma iptal sayılır. Varsayılan true.
   */
  allowPartialRelease?: boolean;
  /** Basılı tutma sırasında her karede (dolum oranı 0-1 ile) çağrılır — HUD göstergesi senkronize etmek için. */
  onChargeProgress?: (progress: number) => void;
  /** Dolum tam tamamlandığında (bırakılmadan, otomatik) çağrılır. */
  onCharged?: () => void;
  /** Bırakıldığında çağrılır; progress 0-1 arası doluluk oranıdır. */
  onRelease?: (progress: number) => void;
  size?: number;
}

/**
 * Basılı tutuldukça dolan bir halka göstergesiyle çevrili buton (saldırı gücü
 * biriktirme, cast time gibi yetenekler için). TouchButton'dan farkı: basılı
 * tutma süresi bir değer taşır (0-1 doluluk oranı), ani bas-bırak değil.
 */
export class ChargeButton {
  readonly element: HTMLButtonElement;
  private readonly ring: SVGCircleElement;
  private readonly ringCircumference: number;
  private readonly chargeDurationMs: number;
  private readonly allowPartialRelease: boolean;
  private readonly onChargeProgressHandler?: (progress: number) => void;
  private readonly onChargedHandler?: () => void;
  private readonly onReleaseHandler?: (progress: number) => void;
  private chargeStartTime = 0;
  private isCharging = false;
  private isFullyCharged = false;
  private rafHandle: number | null = null;
  private activePointerId: number | null = null;
  private boundPointerDown: (event: PointerEvent) => void;
  private boundPointerUp: (event: PointerEvent) => void;

  constructor(options: ChargeButtonOptions) {
    this.chargeDurationMs = options.chargeDurationMs ?? UI_TIMING.CHARGE_DURATION;
    this.allowPartialRelease = options.allowPartialRelease ?? true;
    this.onChargeProgressHandler = options.onChargeProgress;
    this.onChargedHandler = options.onCharged;
    this.onReleaseHandler = options.onRelease;

    const size = options.size ?? UI_SIZE.BUTTON_DEFAULT;
    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = 'vol-charge-button';
    this.element.style.setProperty('--vol-charge-button-size', `${size}px`);
    this.element.style.touchAction = 'none';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('vol-charge-button__ring');
    svg.setAttribute('viewBox', '0 0 100 100');

    const trackCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    trackCircle.classList.add('vol-charge-button__ring-track');
    trackCircle.setAttribute('cx', '50');
    trackCircle.setAttribute('cy', '50');
    trackCircle.setAttribute('r', '46');
    svg.appendChild(trackCircle);

    this.ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    this.ring.classList.add('vol-charge-button__ring-fill');
    this.ring.setAttribute('cx', '50');
    this.ring.setAttribute('cy', '50');
    this.ring.setAttribute('r', '46');
    this.ringCircumference = 2 * Math.PI * 46;
    this.ring.style.strokeDasharray = String(this.ringCircumference);
    this.ring.style.strokeDashoffset = String(this.ringCircumference);
    svg.appendChild(this.ring);

    this.element.appendChild(svg);

    if (options.icon) {
      const iconSlot = document.createElement('span');
      iconSlot.className = 'vol-charge-button__icon';
      if (typeof options.icon === 'string') {
        iconSlot.textContent = options.icon;
      } else {
        iconSlot.appendChild(options.icon);
      }
      this.element.appendChild(iconSlot);
    }

    if (options.label) {
      const labelEl = document.createElement('span');
      labelEl.className = 'vol-charge-button__label';
      labelEl.textContent = options.label;
      this.element.appendChild(labelEl);
    }

    this.boundPointerDown = (event) => this.handlePointerDown(event);
    this.boundPointerUp = (event) => this.handlePointerUp(event);
    this.element.addEventListener('pointerdown', this.boundPointerDown);
    this.element.addEventListener('pointerup', this.boundPointerUp);
    this.element.addEventListener('pointercancel', this.boundPointerUp);
    // pointerleave kasıtlı olarak dinlenmiyor — parmak dışarı kayarsa dolum iptal edilmemeli.
  }

  /** Şu an dolum yüzdesi (0-1). */
  getProgress(): number {
    if (!this.isCharging) return 0;
    return Math.min(1, (performance.now() - this.chargeStartTime) / this.chargeDurationMs);
  }

  destroy(): void {
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    this.element.removeEventListener('pointerdown', this.boundPointerDown);
    this.element.removeEventListener('pointerup', this.boundPointerUp);
    this.element.removeEventListener('pointercancel', this.boundPointerUp);
    this.element.remove();
  }

  private handlePointerDown(event: PointerEvent): void {
    if (this.element.disabled) return;
    this.activePointerId = event.pointerId;
    this.element.setPointerCapture(event.pointerId);
    this.isCharging = true;
    this.isFullyCharged = false;
    this.chargeStartTime = performance.now();
    this.element.classList.add('vol-charge-button--charging');
    this.tick();
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    this.element.releasePointerCapture(event.pointerId);
    this.activePointerId = null;
    if (!this.isCharging) return;

    const progress = this.getProgress();
    this.stopCharging();

    if (this.isFullyCharged) {
      // onCharged zaten tick() içinde tetiklendi; burada yalnızca onRelease bilgilendirme amaçlı çağrılır.
      this.onReleaseHandler?.(1);
      return;
    }

    if (this.allowPartialRelease) {
      this.onReleaseHandler?.(progress);
    }
  }

  private tick(): void {
    if (!this.isCharging) return;

    const progress = this.getProgress();
    const offset = this.ringCircumference * (1 - progress);
    this.ring.style.strokeDashoffset = String(offset);
    this.onChargeProgressHandler?.(progress);

    if (progress >= 1) {
      // wasAlreadyFull koruması olmadan, tick() rAF ile devam ettiği sürece (allowPartialRelease:true)
      // onCharged her karede tekrar tetiklenirdi — burada bir kez tetiklenmesi garanti edilir.
      const wasAlreadyFull = this.isFullyCharged;
      this.isFullyCharged = true;
      this.element.classList.add('vol-charge-button--full');
      if (!wasAlreadyFull) {
        this.onChargedHandler?.();
      }
      if (!this.allowPartialRelease) {
        return;
      }
    }

    this.rafHandle = requestAnimationFrame(() => this.tick());
  }

  private stopCharging(): void {
    this.isCharging = false;
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.element.classList.remove('vol-charge-button--charging', 'vol-charge-button--full');
    this.ring.style.strokeDashoffset = String(this.ringCircumference);
  }
}
