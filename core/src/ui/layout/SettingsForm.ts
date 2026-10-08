export interface SettingsControl {
  readonly element: HTMLElement;
}

export interface SettingsFormOptions {
  readonly className?: string;
}

export interface SettingsRowOptions {
  readonly label?: string;
  /** Etiketin altında ikincil açıklama; denetime `aria-describedby` ile bağlanır. */
  readonly description?: string;
  readonly control: SettingsControl;
  readonly className?: string;
  readonly stackOnNarrow?: boolean;
}

let rowSeq = 0;
const LABELABLE =
  'input, select, textarea, button, [role="slider"], [role="group"], [role="radiogroup"]';

/** Etiketi ve kontrolü tutarlı, taşmayan bir ayar satırında birleştirir. */
export class SettingsRow {
  readonly element: HTMLDivElement;
  private readonly labelElement: HTMLSpanElement | null;
  private readonly descriptionElement: HTMLDivElement | null = null;
  private readonly errorElement: HTMLDivElement;
  private readonly target: HTMLElement | null;
  private readonly id = `vol-settings-row-${++rowSeq}`;

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

    if (options.description) {
      this.descriptionElement = document.createElement('div');
      this.descriptionElement.className = 'vol-settings-row__description';
      this.descriptionElement.id = `${this.id}-desc`;
      this.descriptionElement.textContent = options.description;
      this.element.appendChild(this.descriptionElement);
    }
    this.errorElement = document.createElement('div');
    this.errorElement.className = 'vol-settings-row__error';
    this.errorElement.id = `${this.id}-error`;
    this.errorElement.setAttribute('role', 'alert');
    this.errorElement.hidden = true;
    this.element.appendChild(this.errorElement);

    const root = options.control.element;
    this.target = root.matches(LABELABLE) ? root : root.querySelector<HTMLElement>(LABELABLE);
    this.bindTarget();
  }

  /** Doğrulama hatasını satırda gösterir ve denetimi `aria-invalid` yapar; `null` temizler. */
  setError(message: string | null): void {
    this.errorElement.textContent = message ?? '';
    this.errorElement.hidden = message === null;
    this.element.classList.toggle('vol-settings-row--invalid', message !== null);
    if (message === null) this.target?.removeAttribute('aria-invalid');
    else this.target?.setAttribute('aria-invalid', 'true');
    this.bindTarget();
  }

  /** Görünür etiketi ve açıklama/hata kimliklerini denetime bağlar (kendi adı olan denetime dokunmaz). */
  private bindTarget(): void {
    const target = this.target;
    if (!target) return;
    if (
      this.labelElement &&
      !target.hasAttribute('aria-label') &&
      !target.hasAttribute('aria-labelledby') &&
      !target.closest('label')
    ) {
      this.labelElement.id = `${this.id}-label`;
      // Düğme görünümlü denetimde (Select) değer metni adın parçası kalsın.
      target.id ||= `${this.id}-control`;
      const own = target.tagName === 'BUTTON' ? ` ${target.id}` : '';
      target.setAttribute('aria-labelledby', `${this.labelElement.id}${own}`);
    }
    const described = [
      this.descriptionElement ? this.descriptionElement.id : null,
      this.errorElement.hidden ? null : this.errorElement.id,
    ].filter(Boolean);
    if (described.length > 0) target.setAttribute('aria-describedby', described.join(' '));
    else target.removeAttribute('aria-describedby');
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
  private busy = false;

  constructor(options: SettingsFormOptions = {}) {
    this.element = document.createElement('div');
    this.element.className = ['vol-settings-form', options.className].filter(Boolean).join(' ');
  }

  /**
   * Kaydetme gibi bekleyen bir işi tek seferde çalıştırır: sürerken form `aria-busy` olur ve ikinci çağrı
   * işi başlatmaz (`false` döner). Kaydedilmemiş değişim kararı tüketicinindir; burada karar verilmez.
   */
  async runExclusive(task: () => Promise<void> | void): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.element.setAttribute('aria-busy', 'true');
    try {
      await task();
    } finally {
      this.busy = false;
      this.element.removeAttribute('aria-busy');
    }
    return true;
  }

  isBusy(): boolean {
    return this.busy;
  }

  add(row: SettingsRow): this {
    this.element.appendChild(row.element);
    return this;
  }

  destroy(): void {
    this.element.remove();
  }
}
