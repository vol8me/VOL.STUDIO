import { Icon } from './Icon';
import { Popup } from '../overlays/Popup';
import { i18next } from '../../i18n/I18n';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import { emitUiIntent } from '../feedback/uiIntent';
import type { HapticFeedback } from './hapticFeedback';

export type SelectOptionTone = 'danger' | 'success' | 'warning';

export interface SelectOption {
  value: string;
  label: string;
  /** Seçeneğin metnini vurgular (ör. "Kabus" zorluğunu kırmızıyla işaretlemek). Belirtilmezse normal renk kullanılır. */
  tone?: SelectOptionTone;
  /** Seçilemez: görünür kalır, klavye gezinmesi atlar, tıklama değer üretmez. */
  disabled?: boolean;
}

export interface SelectOptions {
  options: SelectOption[];
  value?: string;
  placeholder?: string;
  /** Açılan listenin erişilebilir adı; verilmezse ortak `core:select.listbox`. */
  listboxLabel?: string;
  disabled?: boolean;
  /** Doğrulama hatası: tetikleyicide `aria-invalid`. Hata metni `aria-describedby` ile tüketicide bağlanır. */
  invalid?: boolean;
  onInput?: (value: string) => void;
  onCommit?: (value: string) => void;
  /** Popup'ın ekleneceği kapsayıcı. Varsayılan document.body. */
  container?: HTMLElement;
  /** Kullanıcı değer commitindeki semantik titreşim; varsayılan `select`. */
  haptic?: HapticFeedback;
}

/**
 * Tek seçimli açılır liste (native <select> muadili). Popup üzerine kurulu:
 * tetikleyici butona tıklayınca listbox açılır, dışa tıklama/Escape ile kapanır.
 */
export class Select {
  readonly element: HTMLButtonElement;
  private readonly popup: Popup;
  private readonly labelElement: HTMLSpanElement;
  private options: SelectOption[];
  private placeholder: string;
  private readonly placeholderIsI18n: boolean;
  private readonly onInputHandler?: (value: string) => void;
  private readonly onCommitHandler?: (value: string) => void;
  private readonly optionButtons = new Map<string, HTMLButtonElement>();
  private readonly scope = new DisposableScope();
  private optionScope = new DisposableScope();
  private value: string | undefined;
  private readonly haptic: HapticFeedback | undefined;
  private boundToggle: () => void;
  private boundTriggerKeydown: (event: KeyboardEvent) => void;
  private readonly onLanguageChanged = (): void => {
    if (this.placeholderIsI18n) {
      this.placeholder = i18next.t('core:select.placeholder');
      if (!this.value) this.renderLabel();
    }
  };

  constructor(options: SelectOptions) {
    const {
      options: items,
      value,
      placeholder,
      disabled = false,
      invalid = false,
      onInput,
      onCommit,
      container,
    } = options;
    this.options = [...items];
    this.placeholderIsI18n = placeholder === undefined;
    this.placeholder = placeholder ?? i18next.t('core:select.placeholder');
    this.onInputHandler = onInput;
    this.onCommitHandler = onCommit;
    this.value = value;
    this.haptic = options.haptic;

    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = 'vol-select';
    this.element.disabled = disabled;
    this.setInvalid(invalid);
    this.element.setAttribute('aria-haspopup', 'listbox');
    this.element.setAttribute('aria-expanded', 'false');

    this.labelElement = document.createElement('span');
    this.labelElement.className = 'vol-select__label';
    this.element.appendChild(this.labelElement);

    const caret = document.createElement('span');
    caret.className = 'vol-select__caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.appendChild(new Icon({ name: 'chevronDown', size: 14 }).element);
    this.element.appendChild(caret);

    this.popup = new Popup(this.element, {
      onClose: () => this.element.setAttribute('aria-expanded', 'false'),
      container,
    });
    this.popup.element.classList.add('vol-select__listbox');
    this.popup.element.setAttribute('role', 'listbox');
    this.popup.element.setAttribute(
      'aria-label',
      options.listboxLabel ?? i18next.t('core:select.listbox'),
    );
    this.scope.addDestroyable(this.popup);
    this.scope.add({ dispose: () => this.optionScope.dispose() });
    this.renderOptions();

    this.boundToggle = () => {
      this.popup.toggle();
      this.element.setAttribute('aria-expanded', String(this.popup.isOpen()));
      if (this.popup.isOpen()) {
        this.focusOption(this.initialFocusIndex());
      }
    };
    this.scope.addListener(this.element, 'click', this.boundToggle);

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
    this.scope.addListener(this.element, 'keydown', this.boundTriggerKeydown as EventListener);

    this.renderLabel();

    i18next.on('languageChanged', this.onLanguageChanged);
    this.scope.addSubscription(() => i18next.off('languageChanged', this.onLanguageChanged));
  }

  getValue(): string | undefined {
    return this.value;
  }

  setValue(value: string): void {
    this.selectValue(value, { silent: true });
  }

  setValueAndNotify(value: string): void {
    this.selectValue(value);
  }

  /**
   * Açılır listenin veri/etiket kümesini programatik olarak yeniler.
   * Mevcut değer yeni kümede varsa korunur; yoksa placeholder'a düşer.
   */
  setOptions(options: SelectOption[]): void {
    this.popup.close();
    this.element.setAttribute('aria-expanded', 'false');
    this.optionScope.dispose();
    this.optionScope = new DisposableScope();
    this.optionButtons.clear();
    this.popup.element.replaceChildren();
    this.options = [...options];
    if (this.value !== undefined && !this.options.some((option) => option.value === this.value)) {
      this.value = undefined;
    }
    this.renderOptions();
    this.renderLabel();
  }

  setInvalid(invalid: boolean): void {
    if (invalid) this.element.setAttribute('aria-invalid', 'true');
    else this.element.removeAttribute('aria-invalid');
  }

  setDisabled(disabled: boolean): void {
    if (disabled && this.popup.isOpen()) {
      // Açık liste yetim kalmasın; odak listeden tetikleyiciye döner, sonra tetikleyici kilitlenir.
      if (this.popup.element.contains(document.activeElement)) this.element.focus();
      this.popup.close();
      this.element.setAttribute('aria-expanded', 'false');
    }
    this.element.disabled = disabled;
  }

  destroy(): void {
    this.scope.dispose();
    this.element.remove();
  }

  private selectValue(value: string, opts: { silent?: boolean; event?: Event } = {}): void {
    // Devre dışı seçenek kullanıcı eylemiyle seçilemez (programatik ayar sessizce kabul edilir).
    if (!opts.silent && this.options.find((o) => o.value === value)?.disabled) return;
    if (!opts.silent && value === this.value) {
      // Aynı değeri yeniden seçmek kalıcı değişiklik değildir: yalnız listeyi kapat.
      this.popup.close();
      this.element.setAttribute('aria-expanded', 'false');
      this.element.focus();
      return;
    }
    const previousButton = this.value ? this.optionButtons.get(this.value) : undefined;
    previousButton?.setAttribute('aria-selected', 'false');

    this.value = value;
    this.optionButtons.get(value)?.setAttribute('aria-selected', 'true');

    this.renderLabel();
    this.popup.close();

    if (!opts.silent) {
      emitUiIntent({
        kind: 'select',
        origin: 'Select',
        target: this.element,
        event: opts.event,
        haptic: this.haptic,
        defaultHaptic: 'select',
      });
      this.onInputHandler?.(value);
      this.onCommitHandler?.(value);
    }
  }

  private renderOptions(): void {
    if (this.options.length === 0) {
      // Boş liste boş bir kutu değildir: nedeni söyleyen seçilemez tek satır.
      const empty = document.createElement('div');
      empty.className = 'vol-select__empty';
      empty.setAttribute('role', 'option');
      empty.setAttribute('aria-disabled', 'true');
      empty.setAttribute('aria-selected', 'false');
      empty.textContent = i18next.t('core:select.empty');
      this.popup.element.appendChild(empty);
      return;
    }
    for (const [index, item] of this.options.entries()) {
      const optionButton = document.createElement('button');
      optionButton.type = 'button';
      optionButton.className = item.tone
        ? `vol-select__option vol-select__option--${item.tone}`
        : 'vol-select__option';
      optionButton.textContent = item.label;
      optionButton.dataset.value = item.value;
      optionButton.setAttribute('role', 'option');
      optionButton.setAttribute('aria-selected', String(item.value === this.value));
      optionButton.tabIndex = -1;
      if (item.disabled) {
        optionButton.disabled = true;
        optionButton.setAttribute('aria-disabled', 'true');
      }

      this.optionScope.addListener(optionButton, 'click', (event: Event) =>
        this.selectValue(item.value, { event }),
      );
      this.optionScope.addListener(optionButton, 'keydown', (event: Event) =>
        this.handleOptionKeydown(event as KeyboardEvent, index),
      );
      this.optionButtons.set(item.value, optionButton);
      this.popup.element.appendChild(optionButton);
    }
  }

  private renderLabel(): void {
    const selected = this.options.find((o) => o.value === this.value);
    this.labelElement.textContent = selected ? selected.label : this.placeholder;
    // Dar kutuda üç nokta ile kısalan seçili metin yine okunabilir kalsın (fare bekleyince, AT için ad zaten ayrı).
    this.labelElement.title = this.labelElement.textContent ?? '';
    this.labelElement.className = selected?.tone
      ? `vol-select__label vol-select__label--${selected.tone}`
      : 'vol-select__label';
  }

  private initialFocusIndex(): number {
    const selected = this.value ? this.options.findIndex((o) => o.value === this.value) : -1;
    if (selected !== -1 && !this.options[selected].disabled) return selected;
    const first = this.options.findIndex((o) => !o.disabled);
    return first === -1 ? 0 : first;
  }

  /** `from`dan `step` yönünde (döngüsel) ilk etkin seçeneğin indeksi; etkin yoksa `null`. */
  private enabledIndexFrom(from: number, step: 1 | -1): number | null {
    const count = this.options.length;
    for (let offset = 1; offset <= count; offset++) {
      const index = (((from + step * offset) % count) + count) % count;
      if (!this.options[index].disabled) return index;
    }
    return null;
  }

  private focusOption(index: number): void {
    const item = this.options[index];
    if (!item) return;
    this.optionButtons.get(item.value)?.focus();
  }

  private handleOptionKeydown(event: KeyboardEvent, index: number): void {
    let nextIndex: number | null = null;

    if (event.key === 'ArrowDown') {
      nextIndex = this.enabledIndexFrom(index, 1);
    } else if (event.key === 'ArrowUp') {
      nextIndex = this.enabledIndexFrom(index, -1);
    } else if (event.key === 'Home') {
      nextIndex = this.enabledIndexFrom(-1, 1);
    } else if (event.key === 'End') {
      nextIndex = this.enabledIndexFrom(this.options.length, -1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.popup.close();
      this.element.setAttribute('aria-expanded', 'false');
      this.element.focus();
      return;
    } else if (event.key === 'Tab') {
      this.popup.close();
      this.element.setAttribute('aria-expanded', 'false');
      return;
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Yazarak ilk eşleşen seçeneğe git (yerel <select> gibi, etiketin ilk harfi).
      const typed = event.key.toLocaleLowerCase();
      const order = [...this.options.keys()];
      const start = [...order.slice(index + 1), ...order.slice(0, index + 1)];
      nextIndex =
        start.find(
          (i) =>
            !this.options[i].disabled &&
            this.options[i].label.toLocaleLowerCase().startsWith(typed),
        ) ?? null;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    this.focusOption(nextIndex);
  }
}
