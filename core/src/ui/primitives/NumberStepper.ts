import { Icon } from './Icon';
import { emitUiIntent, emitUiSignal } from '../feedback/uiIntent';
import { i18next } from '../../i18n/I18n';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import { isComposingKey, setEnterKeyHint } from '../textEntry/ime';

let stepperInstanceCounter = 0;

function decimalPlaces(value: number): number {
  const [, fraction = ''] = String(value).split('.');
  return fraction.length;
}

export interface NumberStepperOptions {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  label?: string;
  /** Görünür etiket yokken erişilebilir ad; çevrilmiş metin. */
  ariaLabel?: string;
  disabled?: boolean;
  /** Salt okunur: odaklanır ve okunur; değer ve düğmeler değişmez. */
  readOnly?: boolean;
  /** Doğrulama hatası: `aria-invalid`. Hata metni `aria-describedby` ile tüketicide bağlanır. */
  invalid?: boolean;
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
  private disabled = false;
  private readOnly = false;
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
      ariaLabel,
      disabled = false,
      readOnly = false,
      invalid = false,
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

    let labelId: string | null = null;
    if (label) {
      const labelText = document.createElement('span');
      labelText.className = 'vol-stepper__label';
      labelId = `vol-stepper-label-${++stepperInstanceCounter}`;
      labelText.id = labelId;
      labelText.textContent = label;
      this.element.appendChild(labelText);
    }

    const control = document.createElement('div');
    control.className = 'vol-stepper__control';

    this.decrementButton = document.createElement('button');
    this.decrementButton.type = 'button';
    this.decrementButton.className = 'vol-stepper__button';
    this.decrementButton.appendChild(new Icon({ name: 'minus', size: 18 }).element);
    this.decrementButton.setAttribute('aria-label', i18next.t('core:stepper.decrement'));
    control.appendChild(this.decrementButton);

    this.input = document.createElement('input');
    this.input.type = 'number';
    setEnterKeyHint(this.input, 'done');
    this.input.className = 'vol-stepper__input';
    this.input.min = String(min);
    this.input.max = String(max);
    this.input.step = String(this.step);
    this.input.value = String(this.value);
    // Girdi genişliği aralığın en geniş yazımına göre (işaret ve ondalık dahil); büyük sayı kırpılmaz.
    const places = Math.max(decimalPlaces(this.step), decimalPlaces(this.min));
    this.input.style.setProperty(
      '--vol-stepper-chars',
      String(Math.max(min.toFixed(places).length, max.toFixed(places).length)),
    );
    // Perde bütün aralığa göredir; ses kiti yerel `number` girdisini bu bildirimle kaydırıcı gibi okur.
    this.input.dataset.volPitchMin = String(min);
    this.input.dataset.volPitchMax = String(max);
    if (labelId) this.input.setAttribute('aria-labelledby', labelId);
    else if (ariaLabel) this.input.setAttribute('aria-label', ariaLabel);
    control.appendChild(this.input);

    this.incrementButton = document.createElement('button');
    this.incrementButton.type = 'button';
    this.incrementButton.className = 'vol-stepper__button';
    this.incrementButton.appendChild(new Icon({ name: 'plus', size: 18 }).element);
    this.incrementButton.setAttribute('aria-label', i18next.t('core:stepper.increment'));
    control.appendChild(this.incrementButton);

    this.element.appendChild(control);

    const boundDecrement = (event: Event): void =>
      this.commitUser(this.value - this.step, true, event, true);
    const boundIncrement = (event: Event): void =>
      this.commitUser(this.value + this.step, true, event, true);
    const boundInput = (event: Event): void => {
      const parsed = Number(this.input.value);
      if (Number.isFinite(parsed)) {
        this.previewValue = this.normalize(parsed);
        emitUiIntent({
          kind: 'valuePreview',
          origin: 'NumberStepper',
          target: this.input,
          event,
          persistent: false,
        });
        this.onInputHandler?.(this.previewValue);
      }
    };
    const boundInputChange = (event: Event): void => {
      // Boş ya da sayı olmayan metin değer değildir: sessizce 0/en küçüğe düşmez, son geçerli değer kalır.
      if (this.input.value.trim() === '' || !Number.isFinite(Number(this.input.value))) {
        this.previewValue = null;
        this.input.value = String(this.value);
        return;
      }
      const parsed = Number(this.input.value);
      const normalized = this.normalize(parsed);
      this.commitUser(parsed, this.previewValue !== normalized, event);
      // Değişmeyen değerde de alan normalize (ör. 7.4 → 7) görünmeli.
      this.input.value = String(this.value);
      this.previewValue = null;
    };
    const boundKeydown = (event: KeyboardEvent): void => {
      // IME kompozisyonunda Escape adayı iptal eder; önizlemeyi geri almaz ve üst katmanı kapatmaz.
      if (isComposingKey(event)) return;
      if (event.key !== 'Escape' || this.input.value === String(this.value)) return;
      // Yazılırken alınan önizleme kalıcı değildir: ilk Escape son kalıcı değere döner.
      event.preventDefault();
      event.stopPropagation();
      const hadPreview = this.previewValue !== null;
      this.previewValue = null;
      this.input.value = String(this.value);
      if (hadPreview) this.onInputHandler?.(this.value);
    };

    this.scope.addListener(this.decrementButton, 'click', boundDecrement);
    this.scope.addListener(this.incrementButton, 'click', boundIncrement);
    this.scope.addListener(this.input, 'input', boundInput);
    this.scope.addListener(this.input, 'change', boundInputChange);
    this.scope.addListener(this.input, 'keydown', boundKeydown as EventListener);

    this.disabled = disabled;
    this.readOnly = readOnly;
    this.applyInteractivity();
    this.setInvalid(invalid);

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
    this.disabled = disabled;
    this.applyInteractivity();
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    this.applyInteractivity();
  }

  setInvalid(invalid: boolean): void {
    if (invalid) this.input.setAttribute('aria-invalid', 'true');
    else this.input.removeAttribute('aria-invalid');
  }

  destroy(): void {
    this.scope.dispose();
    this.element.remove();
  }

  private applyValue(value: number): boolean {
    const clamped = this.normalize(value);
    const changed = clamped !== this.value;
    this.value = clamped;
    this.input.value = String(clamped);
    this.updateButtonState();
    return changed;
  }

  /**
   * `step`: düğme adımı. Düğme tek eylemde hem değer perdesi tickini (kaydırıcı klavye adımı gibi) hem kalıcı
   * değişikliği taşır; yazılan değerde önizleme `input` olayında zaten çalmıştır.
   */
  private commitUser(value: number, emitInput = true, event?: Event, step = false): void {
    const changed = this.applyValue(value);
    if (!changed) return;
    if (step) {
      const preview = emitUiIntent({
        kind: 'valuePreview',
        origin: 'NumberStepper',
        target: this.input,
        event,
        persistent: false,
      });
      // Aynı yerel olayı önizleme sahiplendi; kalıcı değişiklik ayrı niyettir.
      emitUiSignal({
        kind: 'valueCommit',
        origin: 'NumberStepper',
        target: this.input,
        ...(preview && { source: preview.source }),
      });
    } else {
      emitUiIntent({ kind: 'valueCommit', origin: 'NumberStepper', target: this.input, event });
    }
    if (emitInput) this.onInputHandler?.(this.value);
    this.onCommitHandler?.(this.value);
  }

  private clamp(value: number): number {
    if (Number.isNaN(value)) return this.min;
    return Math.min(this.max, Math.max(this.min, value));
  }

  /** Aralığa sığdırır ve `min + n*step` ızgarasına oturtur (yerel `number` girdisinin kuralı); kayan nokta artığı atılır. */
  private normalize(value: number): number {
    const clamped = this.clamp(value);
    const snapped = this.min + Math.round((clamped - this.min) / this.step) * this.step;
    const decimals = Math.max(decimalPlaces(this.step), decimalPlaces(this.min));
    return this.clamp(Number(snapped.toFixed(decimals)));
  }

  private applyInteractivity(): void {
    this.input.disabled = this.disabled;
    this.input.readOnly = this.readOnly;
    this.updateButtonState();
  }

  private updateButtonState(): void {
    const locked = this.disabled || this.readOnly;
    this.decrementButton.disabled = locked || this.value <= this.min;
    this.incrementButton.disabled = locked || this.value >= this.max;
  }
}
