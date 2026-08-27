import { runButtonClick, type ButtonClickHandler } from './buttonBehavior';
import { DisposableScope } from '../../lifecycle/DisposableScope';

export type IconButtonVariant = 'default' | 'primary' | 'success' | 'danger';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonOptions {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Erişilebilirlik için zorunlu (buton yalnızca ikon içerir). */
  label: string;
  /**
   * Asenkron olabilir: `Button` ile AYNI sözleşme — söz beklenirken buton
   * `aria-busy` + `disabled` olur ve tekrar tetiklenemez.
   */
  onClick?: ButtonClickHandler;
  disabled?: boolean;
}

/**
 * Sabit boyutlu, ikon-only kare buton. `Button`dan farkı yalnızca YERLEŞİM:
 * `width: 100%` yoktur — kompakt HUD köşeleri için. Tıklama sözleşmesi
 * (asenkron bekleme, yeniden girişin engellenmesi, hata yakalama, `aria-busy`)
 * `Button` ile AYNIDIR; ikisi de `runButtonClick`i kullanır.
 */
export class IconButton {
  readonly element: HTMLButtonElement;
  private readonly iconWrapper: HTMLSpanElement;
  private onClickHandler?: ButtonClickHandler;
  private readonly boundHandleClick: () => void;
  private readonly scope = new DisposableScope();
  private loading = false;

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

    // Listener BİR kez bağlanır; handler değişince yeniden bağlanmaz. Eski
    // hâlde handler'ın kendisi listener'dı, yani `onClick()` iki kez
    // çağrıldığında eskisini kaldırmak çağıranın referansı saklamasına
    // bağlıydı ve asenkron sarmalayıcı eklenemiyordu.
    this.boundHandleClick = () => {
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

  setDisabled(disabled: boolean): void {
    this.element.disabled = disabled;
  }

  /** Asenkron tıklama sürerken meşgul durumu — `Button.setLoading` ile aynı sözleşme. */
  setLoading(loading: boolean): void {
    this.loading = loading;
    this.element.classList.toggle('vol-icon-button--loading', loading);
    this.element.disabled = loading;
    this.element.setAttribute('aria-busy', String(loading));
  }

  private handleClick(): Promise<void> {
    return runButtonClick(
      {
        setLoading: (loading) => this.setLoading(loading),
        isLoading: () => this.loading,
        logLabel: 'IconButton',
      },
      this.onClickHandler,
    );
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
    this.scope.dispose();
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
