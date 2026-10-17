import { playJuice } from '../motion/juice';
import { runButtonClick, type ButtonClickHandler } from './buttonBehavior';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import { emitUiIntent } from '../feedback/uiIntent';
import type { HapticFeedback } from './hapticFeedback';

export type ButtonVariant = 'default' | 'primary' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type { ButtonClickHandler };

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
  /** Kullanıcı aktivasyonundaki semantik titreşim; varsayılan `tap`. */
  haptic?: HapticFeedback;
}

export class Button {
  readonly element: HTMLButtonElement;
  private readonly labelElement: HTMLSpanElement;
  private readonly spinnerElement: HTMLSpanElement;
  private onClickHandler?: ButtonClickHandler;
  private boundHandleClick: (event: Event) => void;
  private readonly scope = new DisposableScope();
  private loading = false;
  /** Sahibin (çağıranın) istediği devre dışı durumu; yükleme bunu ezmez, bitince geri verir. */
  private ownerDisabled: boolean;
  private errored = false;

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
    this.ownerDisabled = disabled;

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

    this.boundHandleClick = (event: Event) => {
      emitUiIntent({
        kind: 'press',
        origin: 'Button',
        target: this.element,
        event,
        haptic: options.haptic,
        defaultHaptic: 'tap',
      });
      void this.handleClick();
    };
    this.scope.addListener(this.element, 'click', this.boundHandleClick);

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
    this.ownerDisabled = disabled;
    this.element.disabled = disabled || this.loading;
  }

  setLoading(loading: boolean): void {
    this.loading = loading;
    this.element.classList.toggle('vol-button--loading', loading);
    // Yükleme biterken dışarıdan verilmiş `disabled` korunur (async handler sırasında devre dışı bırakılan düğme açılmaz).
    this.element.disabled = loading || this.ownerDisabled;
    // `disabled` görsel/etkileşim durumunu anlatır ama "meşgul"ü anlatmaz:
    // ekran okuyucu, işlemin sürdüğünü yalnızca aria-busy ile bildirir.
    this.element.setAttribute('aria-busy', String(loading));
    this.spinnerElement.hidden = !loading;
    if (loading && !this.spinnerElement.isConnected) {
      this.element.appendChild(this.spinnerElement);
    }
  }

  /** Hata durumu: handler hata fırlatınca görünür ve tekrar denenebilir; sonraki tıklamada temizlenir. */
  get hasError(): boolean {
    return this.errored;
  }

  setError(error: boolean): void {
    this.errored = error;
    this.element.classList.toggle('vol-button--error', error);
    if (error) {
      this.element.dataset.state = 'error';
      playJuice(this.element, 'shake');
    } else delete this.element.dataset.state;
  }

  destroy(): void {
    this.scope.dispose();
    this.element.remove();
  }

  private handleClick(): Promise<void> {
    return runButtonClick(
      {
        setLoading: (loading) => this.setLoading(loading),
        setError: (error) => this.setError(error),
        isLoading: () => this.loading,
        logLabel: 'Button',
        element: this.element,
      },
      this.onClickHandler,
    );
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
