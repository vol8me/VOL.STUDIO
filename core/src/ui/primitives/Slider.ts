import { UI_SIZE } from '../../constants';

export type SliderOrientation = 'horizontal' | 'vertical';

export interface SliderOptions {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  label?: string;
  orientation?: SliderOrientation;
  /** Dikey slider için sabit yükseklik (piksel). Varsayılan 160. */
  length?: number;
  /** Değerin yanında gösterilecek metni biçimlendirir. Varsayılan: ham sayı. */
  formatValue?: (value: number) => string;
  onChange?: (value: number) => void;
}

/**
 * Görsel track+fill+handle katmanı üzerine kurulu slider. Native
 * `<input type="range">` erişilebilirlik/klavye/dokunmatik davranışı için
 * saydam şekilde üstte tutulur (opacity: 0, tam kaplayan); gerçek görünüm
 * `.vol-slider__track`/`__fill`/`__handle` ile çizilir.
 */
export class Slider {
  readonly element: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly fill: HTMLDivElement;
  private readonly handle: HTMLDivElement;
  private readonly valueLabel: HTMLSpanElement | null;
  private readonly labelText: HTMLSpanElement | null;
  private readonly min: number;
  private readonly max: number;
  private readonly orientation: SliderOrientation;
  private readonly formatValue: (value: number) => string;
  private onChangeHandler?: (value: number) => void;
  private boundInput: () => void;

  constructor(options: SliderOptions = {}) {
    const {
      min = 0,
      max = 100,
      step = 1,
      value = min,
      label,
      orientation = 'horizontal',
      length = UI_SIZE.SLIDER_DEFAULT_LENGTH,
      formatValue = (v) => String(v),
      onChange,
    } = options;

    this.min = min;
    this.max = max;
    this.orientation = orientation;
    this.formatValue = formatValue;
    this.onChangeHandler = onChange;

    this.element = document.createElement('div');
    this.element.className = `vol-slider vol-slider--${orientation}`;
    if (orientation === 'vertical') {
      this.element.style.setProperty('--vol-slider-length', `${length}px`);
    }

    if (label) {
      const labelRow = document.createElement('div');
      labelRow.className = 'vol-slider__label-row';

      const labelText = document.createElement('span');
      labelText.className = 'vol-slider__label';
      labelText.textContent = label;
      labelRow.appendChild(labelText);
      this.labelText = labelText;

      this.valueLabel = document.createElement('span');
      this.valueLabel.className = 'vol-slider__value';
      this.valueLabel.textContent = this.formatValue(value);
      labelRow.appendChild(this.valueLabel);

      this.element.appendChild(labelRow);
    } else {
      this.valueLabel = null;
      this.labelText = null;
    }

    const track = document.createElement('div');
    track.className = 'vol-slider__track';

    this.fill = document.createElement('div');
    this.fill.className = 'vol-slider__fill';
    track.appendChild(this.fill);

    this.handle = document.createElement('div');
    this.handle.className = 'vol-slider__handle';
    track.appendChild(this.handle);

    this.input = document.createElement('input');
    this.input.type = 'range';
    this.input.className = 'vol-slider__input';
    this.input.min = String(min);
    this.input.max = String(max);
    // step 0 veya negatif verilirse native range input tutarsız davranır;
    // en küçük anlamlı adıma çekilir.
    this.input.step = String(step > 0 ? step : 1);
    this.input.value = String(value);
    if (orientation === 'vertical') {
      this.input.setAttribute('orient', 'vertical');
    }
    track.appendChild(this.input);

    this.element.appendChild(track);

    this.boundInput = () => {
      const value = Number(this.input.value);
      this.render(value);
      this.onChangeHandler?.(value);
    };
    this.input.addEventListener('input', this.boundInput);

    this.render(value);
  }

  getValue(): number {
    return Number(this.input.value);
  }

  setValue(value: number): void {
    const clamped = this.clamp(value);
    this.input.value = String(clamped);
    this.render(clamped);
    this.onChangeHandler?.(clamped);
  }

  setDisabled(disabled: boolean): void {
    this.input.disabled = disabled;
  }

  /** Label metnini günceller — dil değişiminde kullanılır. */
  setLabel(label: string): void {
    if (this.labelText) this.labelText.textContent = label;
  }

  destroy(): void {
    this.input.removeEventListener('input', this.boundInput);
    this.element.remove();
  }

  private clamp(value: number): number {
    return Math.min(this.max, Math.max(this.min, value));
  }

  private render(value: number): void {
    const ratio = this.max > this.min ? (value - this.min) / (this.max - this.min) : 0;
    const percent = Math.max(0, Math.min(1, ratio)) * 100;

    if (this.orientation === 'vertical') {
      this.fill.style.height = `${percent}%`;
      this.handle.style.bottom = `${percent}%`;
    } else {
      this.fill.style.width = `${percent}%`;
      this.handle.style.left = `${percent}%`;
    }

    if (this.valueLabel) {
      this.valueLabel.textContent = this.formatValue(value);
    }
  }
}
