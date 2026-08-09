export type ButtonVariant = 'default' | 'primary' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonClickHandler = () => void | Promise<void>;

export interface ButtonOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  onClick?: ButtonClickHandler;
  disabled?: boolean;
  /** Panel dışında kullanım için width:100%'ü kapatır. */
  fullWidth?: boolean;
  /** Soldaki ikon (SVG/metin/emoji). */
  iconLeft?: string | Node;
  /** Sağdaki ikon (SVG/metin/emoji). */
  iconRight?: string | Node;
}

export class Button {
  readonly element: HTMLButtonElement;
  private readonly labelElement: HTMLSpanElement;
  private readonly spinnerElement: HTMLSpanElement;
  private onClickHandler?: ButtonClickHandler;
  private boundHandleClick: () => void;
  private loading = false;

  constructor(label: string, options: ButtonOptions = {}) {
    const {
      variant = 'default',
      size = 'md',
      onClick,
      disabled = false,
      fullWidth = true,
    } = options;

    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = this.buildClassName(variant, size, fullWidth);
    this.element.disabled = disabled;

    if (options.iconLeft) {
      this.element.appendChild(this.buildIcon(options.iconLeft));
    }

    this.labelElement = document.createElement('span');
    this.labelElement.className = 'vol-button__label';
    this.labelElement.textContent = label;
    this.element.appendChild(this.labelElement);

    if (options.iconRight) {
      this.element.appendChild(this.buildIcon(options.iconRight));
    }

    this.spinnerElement = document.createElement('span');
    this.spinnerElement.className = 'vol-button__spinner';
    this.spinnerElement.hidden = true;

    this.boundHandleClick = () => {
      void this.handleClick();
    };
    this.element.addEventListener('click', this.boundHandleClick);

    if (onClick) {
      this.onClick(onClick);
    }
  }

  onClick(handler: ButtonClickHandler): void {
    this.onClickHandler = handler;
  }

  setLabel(label: string): void {
    this.labelElement.textContent = label;
  }

  setDisabled(disabled: boolean): void {
    this.element.disabled = disabled;
  }

  setLoading(loading: boolean): void {
    this.loading = loading;
    this.element.classList.toggle('vol-button--loading', loading);
    this.element.disabled = loading;
    this.spinnerElement.hidden = !loading;
    if (loading && !this.spinnerElement.isConnected) {
      this.element.appendChild(this.spinnerElement);
    }
  }

  destroy(): void {
    this.element.removeEventListener('click', this.boundHandleClick);
    this.element.remove();
  }

  private async handleClick(): Promise<void> {
    if (!this.onClickHandler || this.loading) {
      return;
    }

    const result = this.onClickHandler();
    if (result instanceof Promise) {
      this.setLoading(true);
      try {
        await result;
      } finally {
        this.setLoading(false);
      }
    }
  }

  private buildIcon(icon: string | Node): HTMLSpanElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'vol-button__icon';
    if (typeof icon === 'string') {
      wrapper.textContent = icon;
    } else {
      wrapper.appendChild(icon);
    }
    return wrapper;
  }

  private buildClassName(variant: ButtonVariant, size: ButtonSize, fullWidth: boolean): string {
    const classes = ['vol-button'];
    if (variant !== 'default') {
      classes.push(`vol-button--${variant}`);
    }
    if (size !== 'md') {
      classes.push(`vol-button--${size}`);
    }
    if (!fullWidth) {
      classes.push('vol-button--auto-width');
    }
    return classes.join(' ');
  }
}
