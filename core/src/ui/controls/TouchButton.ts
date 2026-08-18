/** Space/Enter — `<button>`ın native aktivasyon tuşları. */
function isActivationKey(event: KeyboardEvent): boolean {
  return event.key === ' ' || event.key === 'Enter' || event.key === 'Spacebar';
}

export type TouchButtonShape = 'circle' | 'square';

export interface TouchButtonOptions {
  shape?: TouchButtonShape;
  /** Buton çapı/kenar uzunluğu (piksel). Varsayılan 72. */
  size?: number;
  icon?: string | Node;
  /** Erişilebilirlik için zorunlu. */
  label: string;
  onPress?: () => void;
  onRelease?: () => void;
}

/**
 * Büyük, basılı-tutma durumu raporlayan aksiyon butonu. `Button`dan farkı
 * `click` yerine `onPress`/`onRelease` kullanması — sürekli basılı tutulan
 * aksiyonlar (ateş, gaz, hızlandırma) `click` ile ifade edilemez.
 *
 * **Adı yanıltıcıdır: bu bileşen dokunmatiğe ÖZEL DEĞİLDİR.** Taşıdığı şey
 * press/hold semantiğidir; fare, kalem ve klavye de aynı semantiği kullanır.
 * Ad korunuyor çünkü public API, `vol-ui` showcase'i, README ve i18n
 * anahtarları ona bağlı — yeniden adlandırmanın kazancı estetik, bedeli dört
 * yüzeyde churn.
 *
 * **Klavye:** Space/Enter basılı tutmak `onPress`, bırakmak `onRelease`
 * üretir. `<button>` elemanının native `click`i bilinçli olarak `preventDefault`
 * ile bastırılır — aksi halde tek bir Space basımı hem keydown/keyup çiftini
 * hem de click'i tetikler.
 */
export class TouchButton {
  readonly element: HTMLButtonElement;
  private readonly onPressHandler?: () => void;
  private readonly onReleaseHandler?: () => void;
  private pressed = false;
  /**
   * Basımın hangi kaynaktan geldiği. Klavye ile basılı tutarken gelen bir
   * `pointerleave` (ör. fare imleci butonun üstünden geçip çıkarsa) basımı
   * iptal ETMEMELİ; kaynak ayrımı olmadan iki girdi birbirini bozar.
   */
  private pressSource: 'pointer' | 'keyboard' | null = null;
  private boundPointerDown!: (event: PointerEvent) => void;
  private boundPointerUp!: (event: PointerEvent) => void;
  private boundPointerLeave!: () => void;
  private boundKeyDown!: (event: KeyboardEvent) => void;
  private boundKeyUp!: (event: KeyboardEvent) => void;
  private boundClick!: (event: MouseEvent) => void;

  constructor(options: TouchButtonOptions) {
    const { shape = 'circle', size = 72, icon, label, onPress, onRelease } = options;
    this.onPressHandler = onPress;
    this.onReleaseHandler = onRelease;

    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = `vol-touch-button vol-touch-button--${shape}`;
    this.element.style.setProperty('--vol-touch-button-size', `${size}px`);
    this.element.setAttribute('aria-label', label);

    if (icon) {
      const iconWrapper = document.createElement('span');
      iconWrapper.className = 'vol-touch-button__icon';
      if (typeof icon === 'string') {
        iconWrapper.textContent = icon;
      } else {
        iconWrapper.appendChild(icon);
      }
      this.element.appendChild(iconWrapper);
    }

    this.boundPointerDown = (event) => {
      if (this.element.disabled) return;
      event.preventDefault();
      this.setPressed(true, 'pointer');
      this.element.setPointerCapture(event.pointerId);
    };
    this.boundPointerUp = (event) => {
      if (this.element.hasPointerCapture(event.pointerId)) {
        this.element.releasePointerCapture(event.pointerId);
      }
      if (this.pressSource !== 'pointer') return;
      this.setPressed(false, 'pointer');
    };
    this.boundPointerLeave = () => {
      // Klavyeyle basılı tutulurken imlecin butondan çıkması basımı bozmamalı.
      if (this.pressSource !== 'pointer') return;
      this.setPressed(false, 'pointer');
    };
    this.boundKeyDown = (event) => {
      if (this.element.disabled) return;
      if (!isActivationKey(event)) return;
      // Space sayfayı kaydırır, Enter form gönderir; ikisi de bastırılır.
      event.preventDefault();
      // Basılı tutmada tarayıcı keydown'ı TEKRARLAR — her tekrar yeni bir
      // onPress sayılırsa çağıran her karede bir "basıldı" olayı görür.
      if (event.repeat) return;
      this.setPressed(true, 'keyboard');
    };
    this.boundKeyUp = (event) => {
      if (!isActivationKey(event)) return;
      event.preventDefault();
      if (this.pressSource !== 'keyboard') return;
      this.setPressed(false, 'keyboard');
    };
    this.boundClick = (event) => {
      // `<button>` Space/Enter'da native `click` de üretir. Bu bileşenin
      // sözleşmesi press/release olduğu için click YUTULUR; aksi halde tek bir
      // tuş basımı hem keydown/keyup çiftini hem click'i tetiklerdi.
      event.preventDefault();
    };

    this.element.addEventListener('pointerdown', this.boundPointerDown);
    this.element.addEventListener('pointerup', this.boundPointerUp);
    this.element.addEventListener('pointercancel', this.boundPointerUp);
    this.element.addEventListener('pointerleave', this.boundPointerLeave);
    this.element.addEventListener('keydown', this.boundKeyDown);
    this.element.addEventListener('keyup', this.boundKeyUp);
    this.element.addEventListener('click', this.boundClick);
  }

  isPressed(): boolean {
    return this.pressed;
  }

  setDisabled(disabled: boolean): void {
    this.element.disabled = disabled;
    if (disabled) {
      this.setPressed(false, this.pressSource ?? 'pointer');
    }
  }

  destroy(): void {
    // Basılıyken yok edilirse çağıranın "basılı" durumu MANDALLI kalırdı:
    // oyuncu ateş tuşunu tutarken sahne kapanınca onRelease hiç gelmiyordu.
    if (this.pressed) {
      this.setPressed(false, this.pressSource ?? 'pointer');
    }

    this.element.removeEventListener('pointerdown', this.boundPointerDown);
    this.element.removeEventListener('pointerup', this.boundPointerUp);
    this.element.removeEventListener('pointercancel', this.boundPointerUp);
    this.element.removeEventListener('pointerleave', this.boundPointerLeave);
    this.element.removeEventListener('keydown', this.boundKeyDown);
    this.element.removeEventListener('keyup', this.boundKeyUp);
    this.element.removeEventListener('click', this.boundClick);
    this.element.remove();
  }

  private setPressed(pressed: boolean, source: 'pointer' | 'keyboard'): void {
    if (this.pressed === pressed) {
      return;
    }
    this.pressed = pressed;
    this.pressSource = pressed ? source : null;
    this.element.classList.toggle('vol-touch-button--pressed', pressed);
    if (pressed) {
      this.onPressHandler?.();
    } else {
      this.onReleaseHandler?.();
    }
  }
}
