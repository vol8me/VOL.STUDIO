import { i18next } from '../../systems/I18n';

export interface NumberStepperOptions {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  label?: string;
  disabled?: boolean;
  onInput?: (value: number) => void;
  onCommit?: (value: number) => void;
  /** @deprecated Yeni kodda `onCommit` kullanın. Kullanıcı commit'lerinde korunur. */
  onChange?: (value: number) => void;
}

/** +/- sayısal giriş. Slider'dan farkı: sürükleme yerine tıklamayla ayrı adımlar. */
export class NumberStepper {
  readonly element: HTMLDivElement;
  private readonly decrementButton: HTMLButtonElement;
  private readonly incrementButton: HTMLButtonElement;
  private readonly input: HTMLInputElement;
  private readonly min: number;
  private readonly max: number;
  private readonly step: number;
  private value: number;
  private onInputHandler?: (value: number) => void;
  private onCommitHandler?: (value: number) => void;
  private onChangeHandler?: (value: number) => void;
  private boundDecrement: () => void;
  private boundIncrement: () => void;
  private boundInputChange: () => void;
  private boundInput: () => void;
  private previewValue: number | null = null;
  private readonly onLanguageChanged = (): void => {
    this.decrementButton.setAttribute('aria-label', i18next.t('core:stepper.decrement'));
    this.incrementButton.setAttribute('aria-label', i18next.t('core:stepper.increment'));
  };

  constructor(options: NumberStepperOptions = {}) {
    const {
      min = 0,
      max = 99,
      step = 1,
      value = min,
      label,
      disabled = false,
      onInput,
      onCommit,
      onChange,
    } = options;
    this.min = min;
    this.max = max;
    // step 0/negatif +/- butonlarını öldürür; en küçük anlamlı adıma çekilir.
    this.step = step > 0 ? step : 1;
    this.value = this.clamp(value);
    this.onInputHandler = onInput;
    this.onCommitHandler = onCommit;
    this.onChangeHandler = onChange;

    this.element = document.createElement('div');
    this.element.className = 'vol-stepper';

    if (label) {
      const labelText = document.createElement('span');
      labelText.className = 'vol-stepper__label';
      labelText.textContent = label;
      this.element.appendChild(labelText);
    }

    const control = document.createElement('div');
    control.className = 'vol-stepper__control';

    this.decrementButton = document.createElement('button');
    this.decrementButton.type = 'button';
    this.decrementButton.className = 'vol-stepper__button';
    this.decrementButton.textContent = '−';
    this.decrementButton.setAttribute('aria-label', i18next.t('core:stepper.decrement'));
    control.appendChild(this.decrementButton);

    this.input = document.createElement('input');
    this.input.type = 'number';
    this.input.className = 'vol-stepper__input';
    this.input.min = String(min);
    this.input.max = String(max);
    this.input.step = String(this.step);
    this.input.value = String(this.value);
    control.appendChild(this.input);

    this.incrementButton = document.createElement('button');
    this.incrementButton.type = 'button';
    this.incrementButton.className = 'vol-stepper__button';
    this.incrementButton.textContent = '+';
    this.incrementButton.setAttribute('aria-label', i18next.t('core:stepper.increment'));
    control.appendChild(this.incrementButton);

    this.element.appendChild(control);

    this.boundDecrement = () => this.commitUser(this.value - this.step);
    this.boundIncrement = () => this.commitUser(this.value + this.step);
    this.boundInput = () => {
      const parsed = Number(this.input.value);
      if (Number.isFinite(parsed)) {
        this.previewValue = this.clamp(parsed);
        this.onInputHandler?.(this.previewValue);
      }
    };
    this.boundInputChange = () => {
      const parsed = Number(this.input.value);
      const clamped = this.clamp(parsed);
      this.commitUser(parsed, this.previewValue !== clamped);
      this.previewValue = null;
    };

    this.decrementButton.addEventListener('click', this.boundDecrement);
    this.incrementButton.addEventListener('click', this.boundIncrement);
    this.input.addEventListener('input', this.boundInput);
    this.input.addEventListener('change', this.boundInputChange);

    this.setDisabled(disabled);
    this.updateButtonState();

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  getValue(): number {
    return this.value;
  }

  setValue(value: number): void {
    this.applyValue(value);
  }

  setValueAndNotify(value: number): void {
    this.commitUser(value);
  }

  setDisabled(disabled: boolean): void {
    this.decrementButton.disabled = disabled;
    this.incrementButton.disabled = disabled;
    this.input.disabled = disabled;
    if (!disabled) this.updateButtonState();
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.decrementButton.removeEventListener('click', this.boundDecrement);
    this.incrementButton.removeEventListener('click', this.boundIncrement);
    this.input.removeEventListener('input', this.boundInput);
    this.input.removeEventListener('change', this.boundInputChange);
    this.element.remove();
  }

  private applyValue(value: number): boolean {
    const clamped = this.clamp(value);
    const changed = clamped !== this.value;
    this.value = clamped;
    this.input.value = String(clamped);
    this.updateButtonState();
    return changed;
  }

  private commitUser(value: number, emitInput = true): void {
    const changed = this.applyValue(value);
    if (!changed) return;
    if (emitInput) this.onInputHandler?.(this.value);
    this.onCommitHandler?.(this.value);
    this.onChangeHandler?.(this.value);
  }

  private clamp(value: number): number {
    if (Number.isNaN(value)) return this.min;
    return Math.min(this.max, Math.max(this.min, value));
  }

  private updateButtonState(): void {
    if (this.input.disabled) return;
    this.decrementButton.disabled = this.value <= this.min;
    this.incrementButton.disabled = this.value >= this.max;
  }
}
