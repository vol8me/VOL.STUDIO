import { DisposableScope } from '../../lifecycle/DisposableScope';
import { emitUiIntent } from '../feedback/uiIntent';
import type { HapticFeedback } from './hapticFeedback';

export interface CheckboxOptions {
  checked?: boolean;
  label?: string;
  /** Görünür etiket yokken erişilebilir ad; çevrilmiş metin. */
  ariaLabel?: string;
  disabled?: boolean;
  /**
   * Anlam: `checkbox` (varsayılan) seçim/onay içindir ("kabul ediyorum"); `switch` anında etkili açma/kapama
   * ayarıdır. Çizim ikisinde de aynı iz+başparmaktır; ekran okuyucu `switch` rolüyle "açık/kapalı" der.
   */
  variant?: 'checkbox' | 'switch';
  /** Doğrulama hatası: `aria-invalid`. Hata metni `aria-describedby` ile tüketicide bağlanır. */
  invalid?: boolean;
  onInput?: (checked: boolean) => void;
  onCommit?: (checked: boolean) => void;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
  /** Kullanıcı değer commitindeki semantik titreşim; varsayılan `select`. */
  haptic?: HapticFeedback;
}

export class Checkbox {
  readonly element: HTMLLabelElement;
  private readonly input: HTMLInputElement;
  private readonly labelText: HTMLSpanElement | null;
  private checked: boolean;
  private onInputHandler?: (checked: boolean) => void;
  private onCommitHandler?: (checked: boolean) => void;
  private readonly scope = new DisposableScope();
  private readonly haptic: HapticFeedback | undefined;

  constructor(options: CheckboxOptions = {}) {
    const {
      checked = false,
      label,
      ariaLabel,
      disabled = false,
      variant = 'checkbox',
      invalid = false,
      onInput,
      onCommit,
    } = options;
    this.checked = checked;
    this.onInputHandler = onInput;
    this.onCommitHandler = onCommit;
    this.haptic = options.haptic;

    this.element = document.createElement('label');
    this.element.className = ['vol-checkbox', options.className].filter(Boolean).join(' ');

    this.input = document.createElement('input');
    this.input.type = 'checkbox';
    this.input.className = 'vol-checkbox__input';
    this.input.checked = checked;
    this.input.disabled = disabled;
    if (variant === 'switch') this.input.setAttribute('role', 'switch');
    if (ariaLabel && !label) this.input.setAttribute('aria-label', ariaLabel);
    this.setInvalid(invalid);
    this.element.appendChild(this.input);

    const track = document.createElement('span');
    track.className = 'vol-checkbox__track';
    const thumb = document.createElement('span');
    thumb.className = 'vol-checkbox__thumb';
    track.appendChild(thumb);
    this.element.appendChild(track);

    if (label) {
      const labelText = document.createElement('span');
      labelText.className = 'vol-checkbox__label';
      labelText.textContent = label;
      this.element.appendChild(labelText);
      this.labelText = labelText;
    } else {
      this.labelText = null;
    }

    this.scope.addListener(this.input, 'change', (event: Event) =>
      this.commitUser(this.input.checked, event),
    );
  }

  isChecked(): boolean {
    return this.input.checked;
  }

  setChecked(checked: boolean): void {
    this.checked = checked;
    this.input.checked = checked;
  }

  setCheckedAndNotify(checked: boolean): void {
    this.commitUser(checked);
  }

  setDisabled(disabled: boolean): void {
    this.input.disabled = disabled;
  }

  setInvalid(invalid: boolean): void {
    if (invalid) this.input.setAttribute('aria-invalid', 'true');
    else this.input.removeAttribute('aria-invalid');
  }

  /** Label metnini günceller — dil değişiminde kullanılır. */
  setLabel(label: string): void {
    if (this.labelText) this.labelText.textContent = label;
  }

  destroy(): void {
    this.scope.dispose();
    this.element.remove();
  }

  private commitUser(checked: boolean, event?: Event): void {
    if (checked === this.checked) return;
    this.checked = checked;
    this.input.checked = checked;
    emitUiIntent({
      kind: 'toggle',
      origin: 'Checkbox',
      target: this.element,
      event,
      haptic: this.haptic,
      defaultHaptic: 'select',
    });
    this.onInputHandler?.(checked);
    this.onCommitHandler?.(checked);
  }
}
