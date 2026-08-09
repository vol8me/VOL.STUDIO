export type IconButtonVariant = 'default' | 'primary' | 'success' | 'danger';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonOptions {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Erişilebilirlik için zorunlu (buton yalnızca ikon içerir). */
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

/** Sabit boyutlu, ikon-only kare buton. Button'dan farkı: width:100% yok — kompakt HUD köşeleri için. */
export class IconButton {
  readonly element: HTMLButtonElement;
  private readonly iconWrapper: HTMLSpanElement;
  private onClickHandler?: () => void;

  constructor(icon: string | Node, options: IconButtonOptions) {
    const { variant = 'default', size = 'md', label, onClick, disabled = false } = options;

    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = this.buildClassName(variant, size);
    this.element.setAttribute('aria-label', label);
    this.element.title = label;
    this.element.disabled = disabled;

    this.iconWrapper = document.createElement('span');
    this.iconWrapper.className = 'vol-icon-button__icon';
    this.element.appendChild(this.iconWrapper);
    this.setIcon(icon);

    if (onClick) {
      this.onClick(onClick);
    }
  }

  onClick(handler: () => void): void {
    if (this.onClickHandler) {
      this.element.removeEventListener('click', this.onClickHandler);
    }
    this.onClickHandler = handler;
    this.element.addEventListener('click', handler);
  }

  setDisabled(disabled: boolean): void {
    this.element.disabled = disabled;
  }

  /** İkonu değiştirir (ör. oynat/duraklat, sessize al). */
  setIcon(icon: string | Node): void {
    this.iconWrapper.textContent = '';
    if (typeof icon === 'string') {
      this.iconWrapper.textContent = icon;
    } else {
      this.iconWrapper.appendChild(icon);
    }
  }

  /** aria-label ve title'ı günceller (toggle durumuyla senkron). */
  setLabel(label: string): void {
    this.element.setAttribute('aria-label', label);
    this.element.title = label;
  }

  destroy(): void {
    if (this.onClickHandler) {
      this.element.removeEventListener('click', this.onClickHandler);
    }
    this.element.remove();
  }

  private buildClassName(variant: IconButtonVariant, size: IconButtonSize): string {
    const classes = ['vol-icon-button'];
    if (variant !== 'default') {
      classes.push(`vol-icon-button--${variant}`);
    }
    if (size !== 'md') {
      classes.push(`vol-icon-button--${size}`);
    }
    return classes.join(' ');
  }
}
