import { animateValue } from '../animation';
import { UI_RATIO, UI_TIMING } from '../../constants';
import { i18next } from '../../systems/I18n';

export type BarVariant = 'health' | 'stamina' | 'cooldown';

export type BarLabel = string | ((value: number, max: number) => string);

export interface BarOptions {
  variant?: BarVariant;
  max: number;
  value?: number;
  /** value/max oranı bu eşiğin altına düşünce 'low' class'ı eklenir (örn. kritik can uyarısı). */
  lowThreshold?: number;
  /** Değer değişimini akıcı gösterme süresi. 0 = anında. */
  animateMs?: number;
  /**
   * Sabit metin veya `(value, max) => string` formatter.
   * Formatter her setValue()/setMax() çağrısında yeniden çalıştırılır.
   * Düz string dinamik olarak güncellenecekse `setLabel()` kullanılmalıdır.
   */
  label?: BarLabel;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

let barInstanceCounter = 0;

export class Bar {
  readonly element: HTMLDivElement;
  private readonly fillElement: HTMLDivElement;
  private labelElement: HTMLSpanElement | null;
  private readonly variant: BarVariant;
  private max: number;
  private value: number;
  private readonly lowThreshold: number;
  private readonly animateMs: number;
  private label?: BarLabel;
  private cancelAnimation?: () => void;
  private readonly onLanguageChanged = (): void => {
    if (this.labelElement) {
      this.renderFill(this.value);
    } else {
      this.element.setAttribute(
        'aria-label',
        i18next.t('core:bar.ariaLabel', { variant: this.variant }),
      );
    }
  };

  constructor(options: BarOptions) {
    const {
      variant = 'health',
      max,
      value = max,
      lowThreshold = UI_RATIO.BAR_LOW_THRESHOLD,
      animateMs = UI_TIMING.BAR_DEFAULT_ANIMATE,
      label,
    } = options;

    this.variant = variant;
    this.max = max;
    // Değer burada da kelepçelenmeli, aksi halde `new Bar({ max: 100, value: 150 })` gibi
    // durumlarda getValue()/aria-valuenow max'ı aşan geçersiz bir değer döndürürdü.
    this.value = Math.max(0, Math.min(max, value));
    this.lowThreshold = lowThreshold;
    this.animateMs = animateMs;
    this.label = label;

    this.element = document.createElement('div');
    this.element.className = [`vol-bar vol-bar--${variant}`, options.className]
      .filter(Boolean)
      .join(' ');
    this.element.setAttribute('role', 'progressbar');
    this.element.setAttribute('aria-valuemin', '0');

    this.fillElement = document.createElement('div');
    this.fillElement.className = 'vol-bar__fill';
    this.element.appendChild(this.fillElement);

    if (label) {
      const labelId = `vol-bar-label-${++barInstanceCounter}`;
      this.labelElement = document.createElement('span');
      this.labelElement.id = labelId;
      this.labelElement.className = 'vol-bar__label';
      this.element.appendChild(this.labelElement);
      this.element.setAttribute('aria-labelledby', labelId);
    } else {
      this.labelElement = null;
      this.element.setAttribute('aria-label', i18next.t('core:bar.ariaLabel', { variant }));
    }

    this.renderFill(this.value);
    this.renderAria();

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  setMax(max: number): void {
    this.max = max;
    // value yeni max'tan büyükse clamp edilmeli, aksi halde state tutarsız kalır.
    this.value = Math.max(0, Math.min(this.max, this.value));
    this.renderFill(this.value);
    this.renderAria();
  }

  setValue(value: number): void {
    const clamped = Math.max(0, Math.min(this.max, value));
    const from = this.value;
    this.value = clamped;
    this.renderAria();

    this.cancelAnimation?.();

    if (this.animateMs <= 0 || from === clamped) {
      this.renderFill(clamped);
      return;
    }

    this.cancelAnimation = animateValue({
      from,
      to: clamped,
      durationMs: this.animateMs,
      onUpdate: (v) => this.renderFill(v),
    });
  }

  getValue(): number {
    return this.value;
  }

  /** Etiketi runtime'da degistirir. Yeni etiket hemen render edilir. */
  setLabel(label: BarLabel): void {
    this.label = label;

    if (!this.labelElement) {
      const labelId = `vol-bar-label-${++barInstanceCounter}`;
      this.labelElement = document.createElement('span');
      this.labelElement.id = labelId;
      this.labelElement.className = 'vol-bar__label';
      this.element.appendChild(this.labelElement);
      this.element.removeAttribute('aria-label');
      this.element.setAttribute('aria-labelledby', labelId);
    }

    this.renderFill(this.value);
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.cancelAnimation?.();
    this.element.remove();
  }

  private renderFill(value: number): void {
    const ratio = this.max > 0 ? value / this.max : 0;
    this.fillElement.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    this.element.classList.toggle('vol-bar--low', ratio <= this.lowThreshold);

    if (this.labelElement && typeof this.label === 'function') {
      this.labelElement.textContent = this.label(Math.round(value), this.max);
    } else if (this.labelElement && typeof this.label === 'string') {
      this.labelElement.textContent = this.label;
    }
  }

  /** ARIA değeri her zaman hedef değeri yansıtır, ara animasyon adımlarıyla gürültü yapmaz. */
  private renderAria(): void {
    this.element.setAttribute('aria-valuemax', String(this.max));
    this.element.setAttribute('aria-valuenow', String(Math.round(this.value)));
  }
}
