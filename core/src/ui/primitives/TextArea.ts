import { DisposableScope } from '../../lifecycle/DisposableScope';

export interface TextAreaOptions {
  placeholder?: string;
  value?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
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

  constructor(options: TextAreaOptions = {}) {
    const {
      placeholder,
      value = '',
      rows = 4,
      maxLength,
      disabled = false,
      onInput,
      onCommit,
    } = options;
    this.maxLength = maxLength;
    this.onInputHandler = onInput;
    this.onCommitHandler = onCommit;
    this.committedValue = value;

    this.element = document.createElement('div');
    this.element.className = 'vol-textarea';

    this.textarea = document.createElement('textarea');
    this.textarea.className = 'vol-textarea__input';
    this.textarea.rows = rows;
    this.textarea.value = value;
    this.textarea.disabled = disabled;
    if (placeholder) this.textarea.placeholder = placeholder;
    if (maxLength) this.textarea.maxLength = maxLength;
    this.element.appendChild(this.textarea);

    if (maxLength) {
      this.counterElement = document.createElement('span');
      this.counterElement.className = 'vol-textarea__counter';
      this.element.appendChild(this.counterElement);
    } else {
      this.counterElement = null;
    }

    const boundInput = (): void => {
      this.renderCounter();
      this.onInputHandler?.(this.textarea.value);
    };
    const boundChange = (): void => {
      const value = this.textarea.value;
      if (value === this.committedValue) return;
      this.committedValue = value;
      this.onCommitHandler?.(value);
    };
    this.scope.addListener(this.textarea, 'input', boundInput);
    this.scope.addListener(this.textarea, 'change', boundChange);

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
    this.textarea.value = value;
    this.committedValue = value;
    this.renderCounter();
  }

  setValueAndNotify(value: string): void {
    const changed = value !== this.textarea.value;
    this.textarea.value = value;
    this.committedValue = value;
    this.renderCounter();
    if (changed) {
      this.onInputHandler?.(value);
      this.onCommitHandler?.(value);
    }
  }

  setDisabled(disabled: boolean): void {
    this.textarea.disabled = disabled;
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
    if (!this.counterElement || !this.maxLength) return;
    this.counterElement.textContent = `${this.textarea.value.length} / ${this.maxLength}`;
  }
}
