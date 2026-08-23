export interface CheckboxOptions {
  checked?: boolean;
  label?: string;
  disabled?: boolean;
  onInput?: (checked: boolean) => void;
  onCommit?: (checked: boolean) => void;
  /** @deprecated Ayrık kullanıcı değişimlerinde korunur; yeni kodda `onCommit` kullanın. */
  onChange?: (checked: boolean) => void;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

export class Checkbox {
  readonly element: HTMLLabelElement;
  private readonly input: HTMLInputElement;
  private readonly labelText: HTMLSpanElement | null;
  private checked: boolean;
  private onInputHandler?: (checked: boolean) => void;
  private onCommitHandler?: (checked: boolean) => void;
  private onChangeHandler?: (checked: boolean) => void;
  private boundChange: () => void;

  constructor(options: CheckboxOptions = {}) {
    const { checked = false, label, disabled = false, onInput, onCommit, onChange } = options;
    this.checked = checked;
    this.onInputHandler = onInput;
    this.onCommitHandler = onCommit;
    this.onChangeHandler = onChange;

    this.element = document.createElement('label');
    this.element.className = ['vol-checkbox', options.className].filter(Boolean).join(' ');

    this.input = document.createElement('input');
    this.input.type = 'checkbox';
    this.input.className = 'vol-checkbox__input';
    this.input.checked = checked;
    this.input.disabled = disabled;
    this.element.appendChild(this.input);

    const track = document.createElement('span');
    track.className = 'vol-checkbox__track';
    const thumb = document.createElement('span');
    thumb.className = 'vol-checkbox__thumb';
    track.appendChild(thumb);
    this.element.appendChild(track);

    if (label) {
      const labelText = document.createElement('span');
      labelText.className = 'vol-checkbox__label';
      labelText.textContent = label;
      this.element.appendChild(labelText);
      this.labelText = labelText;
    } else {
      this.labelText = null;
    }

    this.boundChange = () => this.commitUser(this.input.checked);
    this.input.addEventListener('change', this.boundChange);
  }

  isChecked(): boolean {
    return this.input.checked;
  }

  setChecked(checked: boolean): void {
    this.checked = checked;
    this.input.checked = checked;
  }

  setCheckedAndNotify(checked: boolean): void {
    this.commitUser(checked);
  }

  setDisabled(disabled: boolean): void {
    this.input.disabled = disabled;
  }

  /** Label metnini günceller — dil değişiminde kullanılır. */
  setLabel(label: string): void {
    if (this.labelText) this.labelText.textContent = label;
  }

  destroy(): void {
    this.input.removeEventListener('change', this.boundChange);
    this.element.remove();
  }

  private commitUser(checked: boolean): void {
    if (checked === this.checked) return;
    this.checked = checked;
    this.input.checked = checked;
    this.onInputHandler?.(checked);
    this.onCommitHandler?.(checked);
    this.onChangeHandler?.(checked);
  }
}
