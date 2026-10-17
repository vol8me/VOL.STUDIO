import { emitUiIntent } from '../feedback/uiIntent';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import { isComposingKey, setEnterKeyHint } from '../textEntry/ime';
import { requestTextEntryForElement } from '../textEntry/textEntry';

export interface InputOptions {
  placeholder?: string;
  value?: string;
  type?: 'text' | 'password' | 'search' | 'number';
  disabled?: boolean;
  /** Salt okunur: odaklanır, seçilir, kopyalanır; değişmez ve kol klavyesi açılmaz. */
  readOnly?: boolean;
  /** Görünür etiket yokken erişilebilir ad; çevrilmiş metin. Etiket `PropertyField`/`SettingsRow` ile bağlanır. */
  ariaLabel?: string;
  /** Doğrulama hatası: `aria-invalid`. Hata metni `aria-describedby` ile tüketicide bağlanır. */
  invalid?: boolean;
  /** Kullanıcı yazarken canlı değer. Programatik `setValue` bunu çağırmaz. */
  onInput?: (value: string) => void;
  /** Kullanıcı değeri Enter/change ile tamamladığında çağrılır. */
  onCommit?: (value: string) => void;
  onEnter?: (value: string) => void;
  /**
   * Ekran klavyesinin eylem tuşu (`enterkeyhint`). Verilmezse `onEnter` varsa `done`, `type: 'search'` ise `search`;
   * ikisi de yoksa tarayıcı seçer. İpucu olmadan Android'de "Sonraki" çıkar ve sayfaya Enter gelmez.
   */
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';
}

export class Input {
  readonly element: HTMLInputElement;
  private onInputHandler?: (value: string) => void;
  private onCommitHandler?: (value: string) => void;
  private onEnterHandler?: (value: string) => void;
  private committedValue: string;
  private readonly scope = new DisposableScope();
  private cancelTextEntry: (() => void) | undefined;
  private destroyed = false;

  constructor(options: InputOptions = {}) {
    this.scope.add({ dispose: () => this.cancelTextEntry?.() });
    const {
      placeholder,
      value = '',
      type = 'text',
      disabled = false,
      readOnly = false,
      ariaLabel,
      invalid = false,
      onInput,
      onCommit,
      onEnter,
      enterKeyHint,
    } = options;

    this.element = document.createElement('input');
    this.element.className = 'vol-input';
    this.element.type = type;
    this.element.value = value;
    this.element.disabled = disabled;
    this.element.readOnly = readOnly;
    this.committedValue = this.element.value;
    if (placeholder) {
      this.element.placeholder = placeholder;
    }
    if (ariaLabel) this.element.setAttribute('aria-label', ariaLabel);
    setEnterKeyHint(
      this.element,
      enterKeyHint ?? (type === 'search' ? 'search' : onEnter ? 'done' : undefined),
    );
    this.setInvalid(invalid);

    const boundInput = (event: Event): void => {
      emitUiIntent({
        kind: 'valuePreview',
        origin: 'Input',
        target: this.element,
        event,
        persistent: false,
      });
      this.onInputHandler?.(this.element.value);
    };
    const boundChange = (event: Event): void => this.commitUserValue(event);
    const boundKeydown = (event: KeyboardEvent): void => {
      // IME bileşimi sürerken Enter adayı onaylar; alanı göndermez (keyCode 229: bileşim sırasındaki eski tarayıcı kodu).
      if (isComposingKey(event)) return;
      if (event.key === 'Enter') {
        if (event.repeat || this.element.disabled || this.element.readOnly) return;
        this.commitUserValue(event);
        if (!this.destroyed) this.onEnterHandler?.(this.element.value);
      } else if (event.key === 'Escape' && this.element.value !== this.committedValue) {
        // Kaydedilmemiş taslak: ilk Escape taslağı geri alır; katmanı kapatan ikinci Escape'tir.
        event.preventDefault();
        event.stopPropagation();
        this.element.value = this.committedValue;
        this.onInputHandler?.(this.committedValue);
      }
    };

    this.scope.addListener(this.element, 'input', boundInput);
    this.scope.addListener(this.element, 'change', boundChange);
    this.scope.addListener(this.element, 'keydown', boundKeydown as EventListener);
    // Kol kipinde native odak metin yazdıramaz; kolla klavye istenir.
    // Kip kapalıysa yardımcı hiçbir şey yapmaz ve native davranış sürer.
    this.scope.addListener(this.element, 'focus', () => {
      if (this.element.readOnly) return;
      this.cancelTextEntry = requestTextEntryForElement(this.element, {
        purpose: this.element.type === 'password' ? 'password' : 'default',
        apply: (value) => {
          this.element.value = value;
          this.onInputHandler?.(value);
          this.commitUserValue();
        },
      });
    });

    this.onInputHandler = onInput;
    this.onCommitHandler = onCommit;
    this.onEnterHandler = onEnter;
  }

  getValue(): string {
    return this.element.value;
  }

  setValue(value: string): void {
    this.cancelTextEntry?.();
    this.element.value = value;
    this.committedValue = this.element.value;
  }

  /** Eski "değeri ayarla ve kullanıcıyı taklit et" ihtiyaçları için açık API. */
  setValueAndNotify(value: string): void {
    this.cancelTextEntry?.();
    const previous = this.element.value;
    this.element.value = value;
    const actual = this.element.value;
    this.committedValue = actual;
    if (actual !== previous) {
      this.onInputHandler?.(actual);
      if (!this.destroyed) this.onCommitHandler?.(actual);
    }
  }

  setDisabled(disabled: boolean): void {
    if (disabled) this.cancelTextEntry?.();
    this.element.disabled = disabled;
  }

  setReadOnly(readOnly: boolean): void {
    if (readOnly) this.cancelTextEntry?.();
    this.element.readOnly = readOnly;
  }

  setInvalid(invalid: boolean): void {
    if (invalid) this.element.setAttribute('aria-invalid', 'true');
    else this.element.removeAttribute('aria-invalid');
  }

  focus(): void {
    this.element.focus();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scope.dispose();
    this.element.remove();
  }

  private commitUserValue(event?: Event): void {
    const value = this.element.value;
    if (value === this.committedValue) return;
    this.committedValue = value;
    emitUiIntent({ kind: 'valueCommit', origin: 'Input', target: this.element, event });
    this.onCommitHandler?.(value);
  }
}
