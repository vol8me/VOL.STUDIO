export interface ColorPickerOptions {
  /** `#rrggbb`. Geçersizse siyaha düşer. */
  value?: string;
  label?: string;
  disabled?: boolean;
  /** Hızlı seçim için gösterilecek hazır renkler. */
  swatches?: readonly string[];
  onChange?: (value: string) => void;
  className?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Renk seçici — kutucuk + hex alanı (+ isteğe bağlı hazır renkler).
 *
 * Kutucuk yerli `<input type="color">`tır: işletim sisteminin kendi seçicisini
 * açar, klavye ve erişilebilirlik davranışını bedavaya getirir. Yanındaki hex
 * alanı, elle kesin değer girmek ve mevcut değeri KOPYALAYABİLMEK içindir —
 * yerli seçici tek başına ikisini de vermez.
 *
 * Değer her zaman `#rrggbb` biçiminde ve küçük harfle normalize edilir; palet
 * verisi (D6) bu biçimi bekler ve iki farklı yazımın aynı rengi göstermesi
 * karşılaştırmaları sessizce bozardı.
 */
export class ColorPicker {
  readonly element: HTMLDivElement;
  private readonly swatchInput: HTMLInputElement;
  private readonly hexInput: HTMLInputElement;
  private readonly swatchButtons: HTMLButtonElement[] = [];
  private readonly labelText: HTMLSpanElement | null;
  private onChangeHandler?: (value: string) => void;
  private value: string;
  private readonly boundSwatch: () => void;
  private readonly boundHex: () => void;
  private readonly boundHexBlur: () => void;

  constructor(options: ColorPickerOptions = {}) {
    this.onChangeHandler = options.onChange;
    this.value = normalize(options.value ?? '#000000');

    this.element = document.createElement('div');
    this.element.className = ['vol-color-picker', options.className].filter(Boolean).join(' ');

    if (options.label) {
      const label = document.createElement('span');
      label.className = 'vol-color-picker__label';
      label.textContent = options.label;
      this.element.appendChild(label);
      this.labelText = label;
    } else {
      this.labelText = null;
    }

    const row = document.createElement('div');
    row.className = 'vol-color-picker__row';
    this.element.appendChild(row);

    this.swatchInput = document.createElement('input');
    this.swatchInput.type = 'color';
    this.swatchInput.className = 'vol-color-picker__swatch';
    this.swatchInput.value = this.value;
    this.swatchInput.disabled = options.disabled ?? false;
    row.appendChild(this.swatchInput);

    this.hexInput = document.createElement('input');
    this.hexInput.type = 'text';
    this.hexInput.className = 'vol-color-picker__hex';
    this.hexInput.value = this.value;
    this.hexInput.spellcheck = false;
    this.hexInput.maxLength = 7;
    this.hexInput.disabled = options.disabled ?? false;
    row.appendChild(this.hexInput);

    if (options.swatches && options.swatches.length > 0) {
      const presets = document.createElement('div');
      presets.className = 'vol-color-picker__presets';
      for (const preset of options.swatches) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'vol-color-picker__preset';
        button.style.backgroundColor = preset;
        button.title = preset;
        button.addEventListener('click', () => this.apply(preset));
        presets.appendChild(button);
        this.swatchButtons.push(button);
      }
      this.element.appendChild(presets);
    }

    this.boundSwatch = () => this.apply(this.swatchInput.value);
    // Hex alanı yazarken DEĞİL, geçerli bir değer oluşunca uygulanır: her tuş
    // vuruşunda geçersiz bir ara değer yaymak, dinleyicideki paleti kırardı.
    this.boundHex = () => {
      if (HEX.test(this.hexInput.value)) this.apply(this.hexInput.value);
    };
    // Odak kaybında geçersiz metin son geçerli değere geri döner; kullanıcı
    // yarım yazdığı bir hex ile baş başa kalmaz.
    this.boundHexBlur = () => {
      this.hexInput.value = this.value;
    };

    this.swatchInput.addEventListener('input', this.boundSwatch);
    this.hexInput.addEventListener('input', this.boundHex);
    this.hexInput.addEventListener('blur', this.boundHexBlur);
  }

  getValue(): string {
    return this.value;
  }

  /** Değeri dışarıdan ayarlar; `onChange` TETİKLENMEZ (döngüyü kırar). */
  setValue(value: string): void {
    this.value = normalize(value);
    this.swatchInput.value = this.value;
    this.hexInput.value = this.value;
  }

  setDisabled(disabled: boolean): void {
    this.swatchInput.disabled = disabled;
    this.hexInput.disabled = disabled;
    for (const button of this.swatchButtons) button.disabled = disabled;
  }

  setLabel(label: string): void {
    if (this.labelText) this.labelText.textContent = label;
  }

  destroy(): void {
    this.swatchInput.removeEventListener('input', this.boundSwatch);
    this.hexInput.removeEventListener('input', this.boundHex);
    this.hexInput.removeEventListener('blur', this.boundHexBlur);
    this.element.remove();
  }

  private apply(raw: string): void {
    const next = normalize(raw);
    if (next === this.value) return;
    this.setValue(next);
    this.onChangeHandler?.(next);
  }
}

function normalize(raw: string): string {
  const trimmed = raw.trim();
  return HEX.test(trimmed) ? trimmed.toLowerCase() : '#000000';
}
