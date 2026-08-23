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
  disabled?: boolean;
  onInput?: (value: number) => void;
  onCommit?: (value: number) => void;
  /** @deprecated Canlı kullanıcı değişimleri için korunur; yeni kodda `onInput` kullanın. */
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
  private onInputHandler?: (value: number) => void;
  private onCommitHandler?: (value: number) => void;
  private onChangeHandler?: (value: number) => void;
  private committedValue: number;
  private gestureStartValue: number | null = null;
  private boundInput: () => void;
  private boundChange: () => void;
  private boundKeydown: (event: KeyboardEvent) => void;
  private boundPointerCancel: () => void;

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
      disabled = false,
      onInput,
      onCommit,
      onChange,
    } = options;

    this.min = min;
    this.max = max;
    this.orientation = orientation;
    this.formatValue = formatValue;
    this.onInputHandler = onInput;
    this.onCommitHandler = onCommit;
    this.onChangeHandler = onChange;
    this.committedValue = value;

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
      this.gestureStartValue ??= this.committedValue;
      this.render(value);
      this.onInputHandler?.(value);
      this.onChangeHandler?.(value);
    };
    this.boundChange = () => {
      const value = this.getValue();
      this.gestureStartValue = null;
      if (value === this.committedValue) return;
      this.committedValue = value;
      this.onCommitHandler?.(value);
    };
    this.boundKeydown = (event) => {
      if (event.key !== 'Escape' || this.gestureStartValue === null) return;
      event.preventDefault();
      this.cancelGesture();
    };
    this.boundPointerCancel = () => this.cancelGesture();
    this.input.addEventListener('input', this.boundInput);
    this.input.addEventListener('change', this.boundChange);
    this.input.addEventListener('keydown', this.boundKeydown);
    this.input.addEventListener('pointercancel', this.boundPointerCancel);

    this.render(value);
    this.committedValue = this.getValue();
    this.setDisabled(disabled);
  }

  getValue(): number {
    return Number(this.input.value);
  }

  /**
   * Degeri programatik olarak ayarlar. `onChange` TETIKLENMEZ — kullanici
   * etkilesimi ile kod kaynakli degisikligi ayirmak, `onChange -> state ->
   * setValue -> onChange` geri besleme dongusunu bastan imkansiz kilar.
   * Bildirim gerekiyorsa `setValueAndNotify()` kullan.
   */
  setValue(value: number): void {
    const clamped = this.clamp(value);
    this.input.value = String(clamped);
    // Native input step'e yuvarlayabilir; gorunen deger her zaman gercek degerdir.
    this.render(this.getValue());
    this.committedValue = this.getValue();
    this.gestureStartValue = null;
  }

  /** Değeri ayarlar ve tam kullanıcı gesture'ını taklit eder. */
  setValueAndNotify(value: number): void {
    this.setValue(value);
    const current = this.getValue();
    this.onInputHandler?.(current);
    this.onChangeHandler?.(current);
    this.onCommitHandler?.(current);
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
    this.input.removeEventListener('change', this.boundChange);
    this.input.removeEventListener('keydown', this.boundKeydown);
    this.input.removeEventListener('pointercancel', this.boundPointerCancel);
    this.element.remove();
  }

  private clamp(value: number): number {
    if (!Number.isFinite(value)) return this.min;
    return Math.min(this.max, Math.max(this.min, value));
  }

  private cancelGesture(): void {
    if (this.gestureStartValue === null) return;
    const start = this.gestureStartValue;
    this.gestureStartValue = null;
    this.input.value = String(start);
    this.render(this.getValue());
    this.onInputHandler?.(this.getValue());
    this.onChangeHandler?.(this.getValue());
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
