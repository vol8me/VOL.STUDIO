import { DisposableScope } from '../../lifecycle/DisposableScope';
import { requestTextEntryForElement } from '../textEntry/textEntry';

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
  private readonly scope = new DisposableScope();
  private cancelTextEntry: (() => void) | undefined;

  constructor(options: InputOptions = {}) {
    this.scope.add({ dispose: () => this.cancelTextEntry?.() });
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

    const boundInput = (): void => this.onInputHandler?.(this.element.value);
    const boundChange = (): void => this.commitUserValue();
    const boundKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Enter') {
        this.onEnterHandler?.(this.element.value);
        this.commitUserValue();
      }
    };

    this.scope.addListener(this.element, 'input', boundInput);
    this.scope.addListener(this.element, 'change', boundChange);
    this.scope.addListener(this.element, 'keydown', boundKeydown as EventListener);
    // Kol kipinde native odak metin yazdıramaz; kolla klavye istenir.
    // Kip kapalıysa yardımcı hiçbir şey yapmaz ve native davranış sürer.
    this.scope.addListener(this.element, 'focus', () => {
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
    this.committedValue = value;
  }

  /** Eski "değeri ayarla ve kullanıcıyı taklit et" ihtiyaçları için açık API. */
  setValueAndNotify(value: string): void {
    this.cancelTextEntry?.();
    const changed = value !== this.element.value;
    this.element.value = value;
    if (changed) this.onInputHandler?.(value);
    this.committedValue = value;
    if (changed) this.onCommitHandler?.(value);
  }

  setDisabled(disabled: boolean): void {
    if (disabled) this.cancelTextEntry?.();
    this.element.disabled = disabled;
  }

  focus(): void {
    this.element.focus();
  }

  destroy(): void {
    this.scope.dispose();
    this.element.remove();
  }

  private commitUserValue(): void {
    const value = this.element.value;
    if (value === this.committedValue) return;
    this.committedValue = value;
    this.onCommitHandler?.(value);
  }
}
