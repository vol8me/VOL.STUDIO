export interface SettingsControl {
  readonly element: HTMLElement;
}

export interface SettingsFormOptions {
  readonly className?: string;
}

export interface SettingsRowOptions {
  readonly label?: string;
  readonly control: SettingsControl;
  readonly className?: string;
  readonly stackOnNarrow?: boolean;
}

/** Etiketi ve kontrolü tutarlı, taşmayan bir ayar satırında birleştirir. */
export class SettingsRow {
  readonly element: HTMLDivElement;
  private readonly labelElement: HTMLSpanElement | null;

  constructor(options: SettingsRowOptions) {
    this.element = document.createElement('div');
    this.element.className = [
      'vol-settings-row',
      options.label ? null : 'vol-settings-row--self-labeled',
      options.stackOnNarrow ? 'vol-settings-row--stack-narrow' : null,
      options.className,
    ]
      .filter(Boolean)
      .join(' ');

    if (options.label) {
      this.labelElement = document.createElement('span');
      this.labelElement.className = 'vol-settings-row__label';
      this.labelElement.textContent = options.label;
      this.element.appendChild(this.labelElement);
    } else {
      this.labelElement = null;
    }

    const control = document.createElement('div');
    control.className = 'vol-settings-row__control';
    control.appendChild(options.control.element);
    this.element.appendChild(control);
  }

  setLabel(label: string): void {
    if (this.labelElement) this.labelElement.textContent = label;
  }

  destroy(): void {
    this.element.remove();
  }
}

/** SettingsRow koleksiyonunu dikey form ritminde tutan sunum kabı. */
export class SettingsForm {
  readonly element: HTMLDivElement;

  constructor(options: SettingsFormOptions = {}) {
    this.element = document.createElement('div');
    this.element.className = ['vol-settings-form', options.className].filter(Boolean).join(' ');
  }

  add(row: SettingsRow): this {
    this.element.appendChild(row.element);
    return this;
  }

  destroy(): void {
    this.element.remove();
  }
}
