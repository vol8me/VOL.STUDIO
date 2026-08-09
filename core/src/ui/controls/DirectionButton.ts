export type DirectionButtonArrow = 'up' | 'down' | 'left' | 'right';

export interface DirectionButtonOptions {
  /** Buton üzerinde gösterilecek ok yönü. Verilmezse ok çizilmez (ör. yalnızca label/icon ile özel bir yön butonu). */
  arrow?: DirectionButtonArrow;
  /** Erişilebilirlik için zorunlu (ör. "Sağa Git", "Zıpla"). */
  label: string;
  icon?: string | Node;
  onPress?: () => void;
  onRelease?: () => void;
  size?: number;
}

/**
 * Tek başına kullanılabilen bir yön/aksiyon butonu — DPad'e gömülü değildir.
 * TouchButton'dan farkı yalnızca isimlendirme/amaç netliğidir: aynı
 * pointerdown/up press/release modelini kullanır ama `arrow` ile standart bir
 * yön oku çizer. DPad içeride bu component'ten 4 tanesini bir araya getirir.
 */
export class DirectionButton {
  readonly element: HTMLButtonElement;
  private readonly onPressHandler?: () => void;
  private readonly onReleaseHandler?: () => void;
  private pressed = false;
  private boundPointerDown: (event: PointerEvent) => void;
  private boundPointerUp: (event: PointerEvent) => void;

  constructor(options: DirectionButtonOptions) {
    this.onPressHandler = options.onPress;
    this.onReleaseHandler = options.onRelease;

    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = 'vol-direction-button';
    if (options.arrow) {
      this.element.classList.add(`vol-direction-button--${options.arrow}`);
    }
    this.element.style.touchAction = 'none';
    if (options.size) {
      this.element.style.setProperty('--vol-direction-button-size', `${options.size}px`);
    }
    this.element.setAttribute('aria-label', options.label);

    if (options.icon) {
      const iconSlot = document.createElement('span');
      iconSlot.className = 'vol-direction-button__icon';
      if (typeof options.icon === 'string') {
        iconSlot.textContent = options.icon;
      } else {
        iconSlot.appendChild(options.icon);
      }
      this.element.appendChild(iconSlot);
    } else if (options.arrow) {
      this.element.appendChild(this.buildArrowIcon(options.arrow));
    }

    this.boundPointerDown = (event) => {
      event.preventDefault();
      this.element.setPointerCapture(event.pointerId);
      this.setPressed(true);
    };
    this.boundPointerUp = (event) => {
      this.element.releasePointerCapture(event.pointerId);
      this.setPressed(false);
    };

    this.element.addEventListener('pointerdown', this.boundPointerDown);
    this.element.addEventListener('pointerup', this.boundPointerUp);
    this.element.addEventListener('pointercancel', this.boundPointerUp);
  }

  isPressed(): boolean {
    return this.pressed;
  }

  setDisabled(disabled: boolean): void {
    this.element.disabled = disabled;
    if (disabled) this.setPressed(false);
  }

  setLabel(label: string): void {
    this.element.setAttribute('aria-label', label);
  }

  destroy(): void {
    this.element.removeEventListener('pointerdown', this.boundPointerDown);
    this.element.removeEventListener('pointerup', this.boundPointerUp);
    this.element.removeEventListener('pointercancel', this.boundPointerUp);
    this.element.remove();
  }

  private setPressed(pressed: boolean): void {
    if (this.pressed === pressed) return;
    this.pressed = pressed;
    this.element.classList.toggle('vol-direction-button--pressed', pressed);
    if (pressed) {
      this.onPressHandler?.();
    } else {
      this.onReleaseHandler?.();
    }
  }

  private buildArrowIcon(arrow: DirectionButtonArrow): SVGSVGElement {
    const rotation: Record<DirectionButtonArrow, number> = {
      up: 0,
      right: 90,
      down: 180,
      left: 270,
    };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.style.transform = `rotate(${rotation[arrow]}deg)`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 5l-7 7h4v7h6v-7h4l-7-7Z');
    svg.appendChild(path);
    return svg;
  }
}
