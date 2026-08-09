import { Popup } from '../overlays/Popup';
import { i18next } from '../../systems/I18n';

export type SelectOptionTone = 'danger' | 'success' | 'warning';

export interface SelectOption {
  value: string;
  label: string;
  /** Seçeneğin metnini vurgular (ör. "Kabus" zorluğunu kırmızıyla işaretlemek). Belirtilmezse normal renk kullanılır. */
  tone?: SelectOptionTone;
}

export interface SelectOptions {
  options: SelectOption[];
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  /** Popup'ın ekleneceği kapsayıcı. Varsayılan document.body. */
  container?: HTMLElement;
}

/**
 * Tek seçimli açılır liste (native <select> muadili). Popup üzerine kurulu:
 * tetikleyici butona tıklayınca listbox açılır, dışa tıklama/Escape ile kapanır.
 */
export class Select {
  readonly element: HTMLButtonElement;
  private readonly popup: Popup;
  private readonly labelElement: HTMLSpanElement;
  private readonly options: SelectOption[];
  private placeholder: string;
  private readonly placeholderIsI18n: boolean;
  private readonly onChangeHandler?: (value: string) => void;
  private readonly optionButtons = new Map<string, HTMLButtonElement>();
  private readonly boundOptionClicks = new Map<string, () => void>();
  private readonly boundOptionKeydowns = new Map<string, (event: KeyboardEvent) => void>();
  private value: string | undefined;
  private boundToggle: () => void;
  private boundTriggerKeydown: (event: KeyboardEvent) => void;
  private readonly onLanguageChanged = (): void => {
    if (this.placeholderIsI18n) {
      this.placeholder = i18next.t('core:select.placeholder');
      if (!this.value) this.renderLabel();
    }
  };

  constructor(options: SelectOptions) {
    const { options: items, value, placeholder, disabled = false, onChange, container } = options;
    this.options = items;
    this.placeholderIsI18n = placeholder === undefined;
    this.placeholder = placeholder ?? i18next.t('core:select.placeholder');
    this.onChangeHandler = onChange;
    this.value = value;

    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = 'vol-select';
    this.element.disabled = disabled;
    this.element.setAttribute('aria-haspopup', 'listbox');
    this.element.setAttribute('aria-expanded', 'false');

    this.labelElement = document.createElement('span');
    this.labelElement.className = 'vol-select__label';
    this.element.appendChild(this.labelElement);

    const caret = document.createElement('span');
    caret.className = 'vol-select__caret';
    caret.textContent = '▾';
    this.element.appendChild(caret);

    this.popup = new Popup(this.element, {
      onClose: () => this.element.setAttribute('aria-expanded', 'false'),
      container,
    });
    this.popup.element.classList.add('vol-select__listbox');
    this.popup.element.setAttribute('role', 'listbox');

    for (const [index, item] of items.entries()) {
      const optionButton = document.createElement('button');
      optionButton.type = 'button';
      optionButton.className = item.tone
        ? `vol-select__option vol-select__option--${item.tone}`
        : 'vol-select__option';
      optionButton.textContent = item.label;
      optionButton.setAttribute('role', 'option');
      optionButton.setAttribute('aria-selected', String(item.value === this.value));
      optionButton.tabIndex = -1;

      const onOptionClick = (): void => this.selectValue(item.value);
      optionButton.addEventListener('click', onOptionClick);
      this.boundOptionClicks.set(item.value, onOptionClick);

      const onOptionKeydown = (event: KeyboardEvent): void =>
        this.handleOptionKeydown(event, index);
      optionButton.addEventListener('keydown', onOptionKeydown);
      this.boundOptionKeydowns.set(item.value, onOptionKeydown);

      this.optionButtons.set(item.value, optionButton);
      this.popup.element.appendChild(optionButton);
    }

    this.boundToggle = () => {
      this.popup.toggle();
      this.element.setAttribute('aria-expanded', String(this.popup.isOpen()));
      if (this.popup.isOpen()) {
        this.focusOption(this.initialFocusIndex());
      }
    };
    this.element.addEventListener('click', this.boundToggle);

    this.boundTriggerKeydown = (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!this.popup.isOpen()) {
          this.popup.show();
          this.element.setAttribute('aria-expanded', 'true');
        }
        this.focusOption(this.initialFocusIndex());
      }
    };
    this.element.addEventListener('keydown', this.boundTriggerKeydown);

    this.renderLabel();

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  getValue(): string | undefined {
    return this.value;
  }

  setValue(value: string): void {
    this.selectValue(value, { silent: true });
  }

  setDisabled(disabled: boolean): void {
    this.element.disabled = disabled;
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.element.removeEventListener('click', this.boundToggle);
    this.element.removeEventListener('keydown', this.boundTriggerKeydown);
    for (const [value, optionButton] of this.optionButtons) {
      const onClick = this.boundOptionClicks.get(value);
      if (onClick) optionButton.removeEventListener('click', onClick);
      const onKeydown = this.boundOptionKeydowns.get(value);
      if (onKeydown) optionButton.removeEventListener('keydown', onKeydown);
    }
    this.popup.destroy();
    this.element.remove();
  }

  private selectValue(value: string, opts: { silent?: boolean } = {}): void {
    const previousButton = this.value ? this.optionButtons.get(this.value) : undefined;
    previousButton?.setAttribute('aria-selected', 'false');

    this.value = value;
    this.optionButtons.get(value)?.setAttribute('aria-selected', 'true');

    this.renderLabel();
    this.popup.close();

    if (!opts.silent) {
      this.onChangeHandler?.(value);
    }
  }

  private renderLabel(): void {
    const selected = this.options.find((o) => o.value === this.value);
    this.labelElement.textContent = selected ? selected.label : this.placeholder;
    this.labelElement.className = selected?.tone
      ? `vol-select__label vol-select__label--${selected.tone}`
      : 'vol-select__label';
  }

  private initialFocusIndex(): number {
    if (!this.value) return 0;
    const index = this.options.findIndex((o) => o.value === this.value);
    return index === -1 ? 0 : index;
  }

  private focusOption(index: number): void {
    const item = this.options[index];
    if (!item) return;
    this.optionButtons.get(item.value)?.focus();
  }

  private handleOptionKeydown(event: KeyboardEvent, index: number): void {
    let nextIndex: number | null = null;

    if (event.key === 'ArrowDown') {
      nextIndex = (index + 1) % this.options.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex = (index - 1 + this.options.length) % this.options.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = this.options.length - 1;
    } else if (event.key === 'Escape') {
      this.popup.close();
      this.element.setAttribute('aria-expanded', 'false');
      this.element.focus();
      return;
    } else if (event.key === 'Tab') {
      this.popup.close();
      this.element.setAttribute('aria-expanded', 'false');
      return;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    this.focusOption(nextIndex);
  }
}
