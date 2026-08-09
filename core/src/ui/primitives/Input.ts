export interface InputOptions {
  placeholder?: string;
  value?: string;
  type?: 'text' | 'password' | 'search' | 'number';
  disabled?: boolean;
  onInput?: (value: string) => void;
  onEnter?: (value: string) => void;
}

export class Input {
  readonly element: HTMLInputElement;
  private onInputHandler?: (value: string) => void;
  private onEnterHandler?: (value: string) => void;
  private boundInput: () => void;
  private boundKeydown: (event: KeyboardEvent) => void;

  constructor(options: InputOptions = {}) {
    const { placeholder, value = '', type = 'text', disabled = false, onInput, onEnter } = options;

    this.element = document.createElement('input');
    this.element.className = 'vol-input';
    this.element.type = type;
    this.element.value = value;
    this.element.disabled = disabled;
    if (placeholder) {
      this.element.placeholder = placeholder;
    }

    this.boundInput = () => this.onInputHandler?.(this.element.value);
    this.boundKeydown = (event) => {
      if (event.key === 'Enter') {
        this.onEnterHandler?.(this.element.value);
      }
    };

    this.element.addEventListener('input', this.boundInput);
    this.element.addEventListener('keydown', this.boundKeydown);

    this.onInputHandler = onInput;
    this.onEnterHandler = onEnter;
  }

  getValue(): string {
    return this.element.value;
  }

  setValue(value: string): void {
    this.element.value = value;
    this.onInputHandler?.(value);
  }

  setDisabled(disabled: boolean): void {
    this.element.disabled = disabled;
  }

  focus(): void {
    this.element.focus();
  }

  destroy(): void {
    this.element.removeEventListener('input', this.boundInput);
    this.element.removeEventListener('keydown', this.boundKeydown);
    this.element.remove();
  }
}
