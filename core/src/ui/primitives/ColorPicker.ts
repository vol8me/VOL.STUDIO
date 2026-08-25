import { Popover } from '../overlays/Popover';

export interface ColorPickerOptions {
  /** `#rrggbb`. Geçersizse siyaha düşer. */
  value?: string;
  label?: string;
  disabled?: boolean;
  /** Hızlı seçim için gösterilecek hazır renkler. */
  swatches?: readonly string[];
  onInput?: (value: string) => void;
  onCommit?: (value: string) => void;
  /** @deprecated Canlı kullanıcı değişimleri için korunur; yeni kodda `onInput` kullanın. */
  onChange?: (value: string) => void;
  className?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Renk seçici — kutucuk + hex alanı (+ isteğe bağlı hazır renkler).
 *
 * Kutucuk `<input type="color">` DEĞİLDİR. Yerli bu tür bir alan işletim
 * sisteminin/tarayıcının KENDİ diyaloğunu açar — VOL temasız, fontsuz, i18n'siz,
 * uygulamaya hiç benzemeyen bir pencere (Firefox'ta bu görünür şekilde ayrı bir
 * "Bir renk seçin" penceresidir). Kutucuk bunun yerine sade bir DÜĞMEDİR: o anki
 * rengi arka plan olarak gösterir ve — yalnızca `swatches` verildiyse — VOL'un
 * kendi `Popover`'ında hazır renk ızgarasını açar. `swatches` verilmezse düğme
 * salt görsel bir gösterge kalır; kesin/keyfi değer HER ZAMAN yanındaki hex
 * alanından girilir.
 *
 * Değer her zaman `#rrggbb` biçiminde ve küçük harfle normalize edilir; palet
 * verisi (D6) bu biçimi bekler ve iki farklı yazımın aynı rengi göstermesi
 * karşılaştırmaları sessizce bozardı.
 */
export class ColorPicker {
  readonly element: HTMLDivElement;
  private readonly swatchButton: HTMLButtonElement;
  private readonly hexInput: HTMLInputElement;
  private readonly swatchButtons: Array<{ button: HTMLButtonElement; handler: () => void }> = [];
  private readonly labelText: HTMLSpanElement | null;
  private readonly popover: Popover | null = null;
  private onInputHandler?: (value: string) => void;
  private onCommitHandler?: (value: string) => void;
  private onChangeHandler?: (value: string) => void;
  private value: string;
  private committedValue: string;
  private readonly boundSwatchToggle: (() => void) | null = null;
  private readonly boundHex: () => void;
  private readonly boundHexChange: () => void;
  private readonly boundHexKeydown: (event: KeyboardEvent) => void;
  private readonly boundHexBlur: () => void;

  constructor(options: ColorPickerOptions = {}) {
    this.onInputHandler = options.onInput;
    this.onCommitHandler = options.onCommit;
    this.onChangeHandler = options.onChange;
    this.value = normalize(options.value ?? '#000000');
    this.committedValue = this.value;

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

    this.swatchButton = document.createElement('button');
    this.swatchButton.type = 'button';
    this.swatchButton.className = 'vol-color-picker__swatch';
    this.swatchButton.style.backgroundColor = this.value;
    this.swatchButton.disabled = options.disabled ?? false;
    // Görünür bir alan etiketi varsa erişilebilir ada da yeniden kullanılır —
    // ayrı bir i18n anahtarı gerektirmez (bkz. AGENTS.md Bozulamaz Kural #1).
    if (options.label) this.swatchButton.setAttribute('aria-label', options.label);
    row.appendChild(this.swatchButton);

    this.hexInput = document.createElement('input');
    this.hexInput.type = 'text';
    this.hexInput.className = 'vol-color-picker__hex';
    this.hexInput.value = this.value;
    this.hexInput.spellcheck = false;
    this.hexInput.maxLength = 7;
    this.hexInput.disabled = options.disabled ?? false;
    if (options.label) this.hexInput.setAttribute('aria-label', options.label);
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
        button.setAttribute('aria-label', preset);
        const handler = (): void => {
          this.applyInput(preset);
          this.commitCurrent();
          this.popover?.close();
        };
        button.addEventListener('click', handler);
        presets.appendChild(button);
        this.swatchButtons.push({ button, handler });
      }

      this.popover = new Popover(this.swatchButton, {
        closeOnOutsideClick: true,
        ...(options.label ? { ariaLabel: options.label } : {}),
      });
      this.popover.add(presets);

      this.boundSwatchToggle = () => this.popover?.toggle();
      this.swatchButton.addEventListener('click', this.boundSwatchToggle);
    }

    // Hex alanı yazarken DEĞİL, geçerli bir değer oluşunca uygulanır: her tuş
    // vuruşunda geçersiz bir ara değer yaymak, dinleyicideki paleti kırardı.
    this.boundHex = () => {
      if (HEX.test(this.hexInput.value)) this.applyInput(this.hexInput.value);
    };
    this.boundHexChange = () => this.commitCurrent();
    this.boundHexKeydown = (event) => {
      if (event.key !== 'Escape' || this.value === this.committedValue) return;
      event.preventDefault();
      this.setVisualValue(this.committedValue);
      this.onInputHandler?.(this.value);
      this.onChangeHandler?.(this.value);
    };
    // Odak kaybında geçersiz metin son geçerli değere geri döner; kullanıcı
    // yarım yazdığı bir hex ile baş başa kalmaz.
    this.boundHexBlur = () => {
      this.commitCurrent();
      this.hexInput.value = this.value;
    };

    this.hexInput.addEventListener('input', this.boundHex);
    this.hexInput.addEventListener('change', this.boundHexChange);
    this.hexInput.addEventListener('keydown', this.boundHexKeydown);
    this.hexInput.addEventListener('blur', this.boundHexBlur);
  }

  getValue(): string {
    return this.value;
  }

  /** Değeri dışarıdan ayarlar; `onChange` TETİKLENMEZ (döngüyü kırar). */
  setValue(value: string): void {
    this.setVisualValue(normalize(value));
    this.committedValue = this.value;
  }

  setValueAndNotify(value: string): void {
    this.applyInput(value);
    this.commitCurrent();
  }

  private setVisualValue(value: string): void {
    this.value = value;
    this.swatchButton.style.backgroundColor = this.value;
    this.hexInput.value = this.value;
  }

  setDisabled(disabled: boolean): void {
    this.swatchButton.disabled = disabled;
    this.hexInput.disabled = disabled;
    for (const { button } of this.swatchButtons) button.disabled = disabled;
    if (disabled) this.popover?.close();
  }

  setLabel(label: string): void {
    if (this.labelText) this.labelText.textContent = label;
    if (label) {
      this.swatchButton.setAttribute('aria-label', label);
      this.hexInput.setAttribute('aria-label', label);
      this.popover?.element.setAttribute('aria-label', label);
    } else {
      this.swatchButton.removeAttribute('aria-label');
      this.hexInput.removeAttribute('aria-label');
      this.popover?.element.removeAttribute('aria-label');
    }
  }

  destroy(): void {
    if (this.boundSwatchToggle)
      this.swatchButton.removeEventListener('click', this.boundSwatchToggle);
    this.popover?.destroy();
    this.hexInput.removeEventListener('input', this.boundHex);
    this.hexInput.removeEventListener('change', this.boundHexChange);
    this.hexInput.removeEventListener('keydown', this.boundHexKeydown);
    this.hexInput.removeEventListener('blur', this.boundHexBlur);
    for (const { button, handler } of this.swatchButtons) {
      button.removeEventListener('click', handler);
    }
    this.element.remove();
  }

  private applyInput(raw: string): void {
    const next = normalize(raw);
    if (next === this.value) return;
    this.setVisualValue(next);
    this.onInputHandler?.(next);
    this.onChangeHandler?.(next);
  }

  private commitCurrent(): void {
    if (this.value === this.committedValue) return;
    this.committedValue = this.value;
    this.onCommitHandler?.(this.value);
  }
}

function normalize(raw: string): string {
  const trimmed = raw.trim();
  return HEX.test(trimmed) ? trimmed.toLowerCase() : '#000000';
}
