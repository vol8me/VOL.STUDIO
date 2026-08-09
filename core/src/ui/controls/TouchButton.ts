export type TouchButtonShape = 'circle' | 'square';

export interface TouchButtonOptions {
  shape?: TouchButtonShape;
  /** Buton çapı/kenar uzunluğu (piksel). Varsayılan 72. */
  size?: number;
  icon?: string | Node;
  /** Erişilebilirlik için zorunlu. */
  label: string;
  onPress?: () => void;
  onRelease?: () => void;
}

/**
 * Büyük, parmakla kullanıma uygun dokunmatik aksiyon butonu. Button'dan
 * farkı: pointerdown/up bazlı basılı-tutma durumu raporlar, `click` yerine
 * `onPress`/`onRelease` kullanır — sürekli basılı tutulan aksiyonlar için gereklidir.
 */
export class TouchButton {
  readonly element: HTMLButtonElement;
  private readonly onPressHandler?: () => void;
  private readonly onReleaseHandler?: () => void;
  private pressed = false;
  private boundPointerDown!: (event: PointerEvent) => void;
  private boundPointerUp!: (event: PointerEvent) => void;
  private boundPointerLeave!: () => void;

  constructor(options: TouchButtonOptions) {
    const { shape = 'circle', size = 72, icon, label, onPress, onRelease } = options;
    this.onPressHandler = onPress;
    this.onReleaseHandler = onRelease;

    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = `vol-touch-button vol-touch-button--${shape}`;
    this.element.style.setProperty('--vol-touch-button-size', `${size}px`);
    this.element.setAttribute('aria-label', label);

    if (icon) {
      const iconWrapper = document.createElement('span');
      iconWrapper.className = 'vol-touch-button__icon';
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
      this.setPressed(true);
      this.element.setPointerCapture(event.pointerId);
    };
    this.boundPointerUp = (event) => {
      this.element.releasePointerCapture(event.pointerId);
      this.setPressed(false);
    };
    this.boundPointerLeave = () => {
      if (!this.pressed) return;
      this.setPressed(false);
    };
    this.element.addEventListener('pointerdown', this.boundPointerDown);
    this.element.addEventListener('pointerup', this.boundPointerUp);
    this.element.addEventListener('pointercancel', this.boundPointerUp);
    this.element.addEventListener('pointerleave', this.boundPointerLeave);
  }

  isPressed(): boolean {
    return this.pressed;
  }

  setDisabled(disabled: boolean): void {
    this.element.disabled = disabled;
    if (disabled) {
      this.setPressed(false);
    }
  }

  destroy(): void {
    this.element.removeEventListener('pointerdown', this.boundPointerDown);
    this.element.removeEventListener('pointerup', this.boundPointerUp);
    this.element.removeEventListener('pointercancel', this.boundPointerUp);
    this.element.removeEventListener('pointerleave', this.boundPointerLeave);
    this.element.remove();
  }

  private setPressed(pressed: boolean): void {
    if (this.pressed === pressed) {
      return;
    }
    this.pressed = pressed;
    this.element.classList.toggle('vol-touch-button--pressed', pressed);
    if (pressed) {
      this.onPressHandler?.();
    } else {
      this.onReleaseHandler?.();
    }
  }
}
