export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface RadioGroupOptions {
  options: RadioOption[];
  value?: string;
  name?: string;
  disabled?: boolean;
  onInput?: (value: string) => void;
  onCommit?: (value: string) => void;
  /** @deprecated Ayrık kullanıcı değişimlerinde korunur; yeni kodda `onCommit` kullanın. */
  onChange?: (value: string) => void;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

/** Tüm seçeneklerin görünür kaldığı tek-seçim listesi. Select'ten farkı: açılıp kapanmaz — az (2-5) seçenek için. */
let radioGroupInstanceCounter = 0;

export class RadioGroup {
  readonly element: HTMLDivElement;
  private readonly inputs = new Map<string, HTMLInputElement>();
  private readonly itemDisabled = new Set<string>();
  private readonly boundChanges = new Map<string, () => void>();
  private value: string | undefined;
  private onInputHandler?: (value: string) => void;
  private onCommitHandler?: (value: string) => void;
  private onChangeHandler?: (value: string) => void;

  constructor(options: RadioGroupOptions) {
    // Grup `name`'i native radio'ları karşılıklı dışlayıcı yapar; artan sayaç (Math.random
    // yerine) belge içinde benzersizliği garanti eder, Accordion/Tabs ile aynı desen.
    const {
      options: items,
      value,
      name = `vol-radio-group-${++radioGroupInstanceCounter}`,
      disabled = false,
      onInput,
      onCommit,
      onChange,
    } = options;
    this.value = value;
    this.onInputHandler = onInput;
    this.onCommitHandler = onCommit;
    this.onChangeHandler = onChange;

    this.element = document.createElement('div');
    this.element.className = ['vol-radio-group', options.className].filter(Boolean).join(' ');
    this.element.setAttribute('role', 'radiogroup');

    for (const item of items) {
      const label = document.createElement('label');
      label.className = 'vol-radio';

      const input = document.createElement('input');
      input.type = 'radio';
      input.className = 'vol-radio__input';
      input.name = name;
      input.value = item.value;
      input.checked = item.value === value;
      input.disabled = disabled || Boolean(item.disabled);
      if (item.disabled) this.itemDisabled.add(item.value);
      label.appendChild(input);

      const dot = document.createElement('span');
      dot.className = 'vol-radio__dot';
      label.appendChild(dot);

      const labelText = document.createElement('span');
      labelText.className = 'vol-radio__label';
      labelText.textContent = item.label;
      label.appendChild(labelText);

      const onChangeBound = (): void => {
        this.commitUser(item.value);
      };
      input.addEventListener('change', onChangeBound);
      this.boundChanges.set(item.value, onChangeBound);

      this.inputs.set(item.value, input);
      this.element.appendChild(label);
    }
  }

  getValue(): string | undefined {
    return this.value;
  }

  setValue(value: string): void {
    if (this.value === value) return;
    this.value = value;
    for (const [itemValue, input] of this.inputs) {
      input.checked = itemValue === value;
    }
  }

  setValueAndNotify(value: string): void {
    this.commitUser(value);
  }

  setDisabled(disabled: boolean): void {
    for (const [value, input] of this.inputs) {
      input.disabled = disabled || this.itemDisabled.has(value);
    }
  }

  destroy(): void {
    for (const [value, input] of this.inputs) {
      const handler = this.boundChanges.get(value);
      if (handler) input.removeEventListener('change', handler);
    }
    this.element.remove();
  }

  private commitUser(value: string): void {
    if (this.value === value || this.itemDisabled.has(value)) return;
    this.setValue(value);
    this.onInputHandler?.(value);
    this.onCommitHandler?.(value);
    this.onChangeHandler?.(value);
  }
}
