export interface InputOptions {
  placeholder?: string;
  value?: string;
  type?: 'text' | 'password' | 'search' | 'number';
  disabled?: boolean;
  /** Kullanıcı yazarken canlı değer. Programatik `setValue` bunu çağırmaz. */
  onInput?: (value: string) => void;
  /** Kullanıcı değeri Enter/change ile tamamladığında çağrılır. */
  onCommit?: (value: string) => void;
  onEnter?: (value: string) => void;
}

export class Input {
  readonly element: HTMLInputElement;
  private onInputHandler?: (value: string) => void;
  private onCommitHandler?: (value: string) => void;
  private onEnterHandler?: (value: string) => void;
  private committedValue: string;
  private boundInput: () => void;
  private boundChange: () => void;
  private boundKeydown: (event: KeyboardEvent) => void;

  constructor(options: InputOptions = {}) {
    const {
      placeholder,
      value = '',
      type = 'text',
      disabled = false,
      onInput,
      onCommit,
      onEnter,
    } = options;

    this.element = document.createElement('input');
    this.element.className = 'vol-input';
    this.element.type = type;
    this.element.value = value;
    this.element.disabled = disabled;
    this.committedValue = this.element.value;
    if (placeholder) {
      this.element.placeholder = placeholder;
    }

    this.boundInput = () => this.onInputHandler?.(this.element.value);
    this.boundChange = () => this.commitUserValue();
    this.boundKeydown = (event) => {
      if (event.key === 'Enter') {
        this.onEnterHandler?.(this.element.value);
        this.commitUserValue();
      }
    };

    this.element.addEventListener('input', this.boundInput);
    this.element.addEventListener('change', this.boundChange);
    this.element.addEventListener('keydown', this.boundKeydown);

    this.onInputHandler = onInput;
    this.onCommitHandler = onCommit;
    this.onEnterHandler = onEnter;
  }

  getValue(): string {
    return this.element.value;
  }

  setValue(value: string): void {
    this.element.value = value;
    this.committedValue = value;
  }

  /** Eski "değeri ayarla ve kullanıcıyı taklit et" ihtiyaçları için açık API. */
  setValueAndNotify(value: string): void {
    const changed = value !== this.element.value;
    this.element.value = value;
    if (changed) this.onInputHandler?.(value);
    this.committedValue = value;
    if (changed) this.onCommitHandler?.(value);
  }

  setDisabled(disabled: boolean): void {
    this.element.disabled = disabled;
  }

  focus(): void {
    this.element.focus();
  }

  destroy(): void {
    this.element.removeEventListener('input', this.boundInput);
    this.element.removeEventListener('change', this.boundChange);
    this.element.removeEventListener('keydown', this.boundKeydown);
    this.element.remove();
  }

  private commitUserValue(): void {
    const value = this.element.value;
    if (value === this.committedValue) return;
    this.committedValue = value;
    this.onCommitHandler?.(value);
  }
}
