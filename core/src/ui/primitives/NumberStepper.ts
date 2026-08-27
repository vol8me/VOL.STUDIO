import { i18next } from '../../systems/I18n';
import { DisposableScope } from '../../lifecycle/DisposableScope';

export interface NumberStepperOptions {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  label?: string;
  disabled?: boolean;
  onInput?: (value: number) => void;
  onCommit?: (value: number) => void;
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
  private readonly scope = new DisposableScope();
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
    } = options;
    this.min = min;
    this.max = max;
    // step 0/negatif +/- butonlarını öldürür; en küçük anlamlı adıma çekilir.
    this.step = step > 0 ? step : 1;
    this.value = this.clamp(value);
    this.onInputHandler = onInput;
    this.onCommitHandler = onCommit;

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

    const boundDecrement = (): void => this.commitUser(this.value - this.step);
    const boundIncrement = (): void => this.commitUser(this.value + this.step);
    const boundInput = (): void => {
      const parsed = Number(this.input.value);
      if (Number.isFinite(parsed)) {
        this.previewValue = this.clamp(parsed);
        this.onInputHandler?.(this.previewValue);
      }
    };
    const boundInputChange = (): void => {
      const parsed = Number(this.input.value);
      const clamped = this.clamp(parsed);
      this.commitUser(parsed, this.previewValue !== clamped);
      this.previewValue = null;
    };

    this.scope.addListener(this.decrementButton, 'click', boundDecrement);
    this.scope.addListener(this.incrementButton, 'click', boundIncrement);
    this.scope.addListener(this.input, 'input', boundInput);
    this.scope.addListener(this.input, 'change', boundInputChange);

    this.setDisabled(disabled);
    this.updateButtonState();

    this.scope.addSubscription(() => i18next.off('languageChanged', this.onLanguageChanged));
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
    this.scope.dispose();
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
