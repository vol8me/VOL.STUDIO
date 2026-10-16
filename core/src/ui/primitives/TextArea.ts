import { DisposableScope } from '../../lifecycle/DisposableScope';
import { emitUiIntent } from '../feedback/uiIntent';
import { isComposingKey } from '../textEntry/ime';
import { requestTextEntryForElement } from '../textEntry/textEntry';

export interface TextAreaOptions {
  placeholder?: string;
  value?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  /** Salt okunur: odaklanır, seçilir, kopyalanır; değişmez ve kol klavyesi açılmaz. */
  readOnly?: boolean;
  /** Görünür etiket yokken erişilebilir ad; çevrilmiş metin. Etiket `PropertyField`/`SettingsRow` ile bağlanır. */
  ariaLabel?: string;
  /** Doğrulama hatası: `aria-invalid`. Hata metni `aria-describedby` ile tüketicide bağlanır. */
  invalid?: boolean;
  onInput?: (value: string) => void;
  onCommit?: (value: string) => void;
}

/**
 * Çok satırlı metin girişi (native <textarea> muadili, Input ile aynı
 * desende). Notlar, mod/sunucu açıklaması, sohbet mesajı gibi tek satırlık
 * Input'un yetmediği durumlar için. `maxLength` verilirse karakter sayacı
 * gösterilir.
 */
export class TextArea {
  readonly element: HTMLDivElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly counterElement: HTMLSpanElement | null;
  private readonly maxLength?: number;
  private onInputHandler?: (value: string) => void;
  private onCommitHandler?: (value: string) => void;
  private committedValue: string;
  private readonly scope = new DisposableScope();
  private cancelTextEntry: (() => void) | undefined;

  constructor(options: TextAreaOptions = {}) {
    this.scope.add({ dispose: () => this.cancelTextEntry?.() });
    const {
      placeholder,
      value = '',
      rows = 4,
      maxLength,
      disabled = false,
      readOnly = false,
      ariaLabel,
      invalid = false,
      onInput,
      onCommit,
    } = options;
    this.maxLength = maxLength;
    this.onInputHandler = onInput;
    this.onCommitHandler = onCommit;

    this.element = document.createElement('div');
    this.element.className = 'vol-textarea';

    this.textarea = document.createElement('textarea');
    this.textarea.className = 'vol-textarea__input';
    this.textarea.rows = rows;
    this.textarea.value = value;
    this.committedValue = this.textarea.value;
    this.textarea.disabled = disabled;
    this.textarea.readOnly = readOnly;
    if (ariaLabel) this.textarea.setAttribute('aria-label', ariaLabel);
    this.setInvalid(invalid);
    if (placeholder) this.textarea.placeholder = placeholder;
    if (maxLength !== undefined) this.textarea.maxLength = maxLength;
    this.element.appendChild(this.textarea);

    if (maxLength !== undefined) {
      this.counterElement = document.createElement('span');
      this.counterElement.className = 'vol-textarea__counter';
      this.element.appendChild(this.counterElement);
    } else {
      this.counterElement = null;
    }

    // Klavye/kol klavyesi olayı varsa niyet kaynağını taşır; olaysız (kol klavyesi uygulaması) da kalıcı değişimdir.
    const boundInput = (event?: Event): void => {
      this.renderCounter();
      emitUiIntent({
        kind: 'valuePreview',
        origin: 'TextArea',
        target: this.textarea,
        event,
        persistent: false,
      });
      this.onInputHandler?.(this.textarea.value);
    };
    const boundChange = (event?: Event): void => {
      const value = this.textarea.value;
      if (value === this.committedValue) return;
      this.committedValue = value;
      emitUiIntent({ kind: 'valueCommit', origin: 'TextArea', target: this.textarea, event });
      this.onCommitHandler?.(value);
    };
    this.scope.addListener(this.textarea, 'input', boundInput);
    this.scope.addListener(this.textarea, 'change', boundChange);
    this.scope.addListener(this.textarea, 'keydown', ((event: KeyboardEvent) => {
      // Çok satırlı alanda Enter satır sonudur (IME dahil gönderme yok); Escape yalnız taslağı geri alır.
      if (isComposingKey(event)) return;
      if (event.key === 'Escape' && this.textarea.value !== this.committedValue) {
        event.preventDefault();
        event.stopPropagation();
        this.textarea.value = this.committedValue;
        this.renderCounter();
        this.onInputHandler?.(this.committedValue);
      }
    }) as EventListener);
    // Kol kipinde native odak metin yazdıramaz; kolla klavye istenir
    // (Input ile aynı kanca; `multiline` klavyeye satırsonu tuşu ekler).
    this.scope.addListener(this.textarea, 'focus', () => {
      if (this.textarea.readOnly) return;
      this.cancelTextEntry = requestTextEntryForElement(this.textarea, {
        multiline: true,
        apply: (value) => {
          this.textarea.value = value;
          boundInput();
          boundChange();
        },
      });
    });

    this.renderCounter();

    // rows sadece native başlangıç yüksekliğini belirler; resize:vertical
    // kullanıcının bunun altına küçültmesini engellemez. Constructor anında
    // element henüz DOM'a bağlanmamış olabilir (caller genelde element'i
    // constructor'dan SONRA ağaca ekler), bu yüzden tek bir rAF güvenilir
    // değil — ResizeObserver ile gerçekten ilk defa ölçülebilir bir boyuta
    // kavuştuğu an (offsetHeight > 0) min-height bir kerelik sabitlenir,
    // ardından gözlemci durdurulur.
    const minHeightObserver = new ResizeObserver(() => {
      if (this.textarea.offsetHeight > 0) {
        this.textarea.style.minHeight = `${this.textarea.offsetHeight}px`;
        minHeightObserver.disconnect();
      }
    });
    minHeightObserver.observe(this.textarea);
    this.scope.add({ dispose: () => minHeightObserver.disconnect() });
  }

  getValue(): string {
    return this.textarea.value;
  }

  setValue(value: string): void {
    this.cancelTextEntry?.();
    this.textarea.value = value;
    this.committedValue = this.textarea.value;
    this.renderCounter();
  }

  setValueAndNotify(value: string): void {
    this.cancelTextEntry?.();
    const previous = this.textarea.value;
    this.textarea.value = value;
    const actual = this.textarea.value;
    this.committedValue = actual;
    this.renderCounter();
    if (actual !== previous) {
      this.onInputHandler?.(actual);
      this.onCommitHandler?.(actual);
    }
  }

  setDisabled(disabled: boolean): void {
    if (disabled) this.cancelTextEntry?.();
    this.textarea.disabled = disabled;
  }

  setReadOnly(readOnly: boolean): void {
    if (readOnly) this.cancelTextEntry?.();
    this.textarea.readOnly = readOnly;
  }

  setInvalid(invalid: boolean): void {
    if (invalid) this.textarea.setAttribute('aria-invalid', 'true');
    else this.textarea.removeAttribute('aria-invalid');
  }

  focus(): void {
    this.textarea.focus();
  }

  destroy(): void {
    // Gözlemci kendini yalnızca ilk ölçülebilir boyutta durdurur; component
    // hiç görünür olmadan (ör. açılmamış bir sekmede) destroy edilirse
    // gözlemci bağlı kalır ve DOM'dan çıkan textarea'yı canlı tutar.
    this.scope.dispose();
    this.element.remove();
  }

  private renderCounter(): void {
    if (!this.counterElement || this.maxLength === undefined) return;
    this.counterElement.textContent = `${this.textarea.value.length} / ${this.maxLength}`;
  }
}
