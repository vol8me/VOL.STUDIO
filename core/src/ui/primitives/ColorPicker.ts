import { Popover } from '../overlays/Popover';
import { DisposableScope } from '../../lifecycle/DisposableScope';

export interface ColorPickerOptions {
  /** `#rrggbb`. Geçersizse siyaha düşer. */
  value?: string;
  label?: string;
  disabled?: boolean;
  /** Hızlı seçim için gösterilecek hazır renkler. */
  swatches?: readonly string[];
  onInput?: (value: string) => void;
  onCommit?: (value: string) => void;
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
  private readonly swatchButtons: HTMLButtonElement[] = [];
  private readonly labelText: HTMLSpanElement | null;
  private readonly popover: Popover | null = null;
  private onInputHandler?: (value: string) => void;
  private onCommitHandler?: (value: string) => void;
  private readonly scope = new DisposableScope();
  private value: string;
  private committedValue: string;

  constructor(options: ColorPickerOptions = {}) {
    this.onInputHandler = options.onInput;
    this.onCommitHandler = options.onCommit;
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
        presets.appendChild(button);
        this.scope.addListener(button, 'click', handler);
        this.swatchButtons.push(button);
      }

      this.popover = new Popover(this.swatchButton, {
        closeOnOutsideClick: true,
        ...(options.label ? { ariaLabel: options.label } : {}),
      });
      this.popover.add(presets);
      this.scope.addDestroyable(this.popover);
      this.scope.addListener(this.swatchButton, 'click', () => this.popover?.toggle());
    }

    // Hex alanı yazarken DEĞİL, geçerli bir değer oluşunca uygulanır: her tuş
    // vuruşunda geçersiz bir ara değer yaymak, dinleyicideki paleti kırardı.
    const boundHex = (): void => {
      if (HEX.test(this.hexInput.value)) this.applyInput(this.hexInput.value);
    };
    const boundHexChange = (): void => this.commitCurrent();
    const boundHexKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || this.value === this.committedValue) return;
      event.preventDefault();
      this.setVisualValue(this.committedValue);
      this.onInputHandler?.(this.value);
    };
    // Odak kaybında geçersiz metin son geçerli değere geri döner; kullanıcı
    // yarım yazdığı bir hex ile baş başa kalmaz.
    const boundHexBlur = (): void => {
      this.commitCurrent();
      this.hexInput.value = this.value;
    };

    this.scope.addListener(this.hexInput, 'input', boundHex);
    this.scope.addListener(this.hexInput, 'change', boundHexChange);
    this.scope.addListener(this.hexInput, 'keydown', boundHexKeydown as EventListener);
    this.scope.addListener(this.hexInput, 'blur', boundHexBlur);
  }

  getValue(): string {
    return this.value;
  }

  /** Değeri dışarıdan ayarlar; kullanıcı callback'leri TETİKLENMEZ. */
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
    for (const button of this.swatchButtons) button.disabled = disabled;
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
    this.scope.dispose();
    this.element.remove();
  }

  private applyInput(raw: string): void {
    const next = normalize(raw);
    if (next === this.value) return;
    this.setVisualValue(next);
    this.onInputHandler?.(next);
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
