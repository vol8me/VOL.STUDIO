import { bindHoldInput } from './holdInput';

export type HoldButtonShape = 'circle' | 'square';

export interface HoldButtonOptions {
  shape?: HoldButtonShape;
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
 * Ad korunuyor çünkü public API, `vol-showcase`, README ve i18n
 * anahtarları ona bağlı — yeniden adlandırmanın kazancı estetik, bedeli dört
 * yüzeyde churn.
 *
 * **Klavye:** Space/Enter basılı tutmak `onPress`, bırakmak `onRelease`
 * üretir. `<button>` elemanının native `click`i bilinçli olarak `preventDefault`
 * ile bastırılır — aksi halde tek bir Space basımı hem keydown/keyup çiftini
 * hem de click'i tetikler.
 */
export class HoldButton {
  readonly element: HTMLButtonElement;
  private iconWrapper: HTMLSpanElement | null = null;
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
  private boundVisibility!: () => void;
  private unbindHoldInput: (() => void) | null = null;

  constructor(options: HoldButtonOptions) {
    const { shape = 'circle', size = 72, icon, label, onPress, onRelease } = options;
    this.onPressHandler = onPress;
    this.onReleaseHandler = onRelease;

    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = `vol-hold-button vol-hold-button--${shape}`;
    this.element.style.setProperty('--vol-hold-button-size', `${size}px`);
    this.element.setAttribute('aria-label', label);
    // Oynanış denetimi: arayüz sesi çalmaz (ateş/şarj/yön sesi oyunun kendi SFX'idir); kök yedek `press` sesi de almaz.
    this.element.dataset.volSilent = '';
    this.element.setAttribute('aria-pressed', 'false');

    if (icon) this.setIcon(icon);

    this.boundPointerDown = (event) => {
      // Zaten basılıyken ikinci işaretçi yok sayılır (tek basış, tek onPress).
      if (this.element.disabled || this.pressed) return;
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
    this.boundVisibility = () => {
      // Sayfa gizlenince basış bırakılır: gizliyken pointerup hiç gelmeyebilir (mandallı "basılı").
      if (document.visibilityState === 'hidden' && this.pressed) {
        this.setPressed(false, this.pressSource ?? 'pointer');
      }
    };
    this.boundPointerLeave = () => {
      // Klavyeyle basılı tutulurken imlecin butondan çıkması basımı bozmamalı.
      if (this.pressSource !== 'pointer') return;
      this.setPressed(false, 'pointer');
    };
    this.element.addEventListener('pointerdown', this.boundPointerDown);
    this.element.addEventListener('pointerup', this.boundPointerUp);
    this.element.addEventListener('pointercancel', this.boundPointerUp);
    this.element.addEventListener('lostpointercapture', this.boundPointerLeave);
    this.element.addEventListener('pointerleave', this.boundPointerLeave);
    document.addEventListener('visibilitychange', this.boundVisibility);
    // Klavye (Space/Enter) ve kol A aynı basış/bırakış çiftini üretir; native `click` yutulur.
    this.unbindHoldInput = bindHoldInput(this.element, {
      down: () => this.setPressed(true, 'keyboard'),
      up: () => this.setPressed(false, 'keyboard'),
      cancel: () => this.setPressed(false, 'keyboard'),
      isBusy: () => this.pressed,
    });
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

  /**
   * İkonu bileşeni yeniden kurmadan değiştirir.
   *
   * Slot tabanlı aksiyonlarda aynı düğme farklı bir eyleme bağlanabilir;
   * düğmeyi yıkıp kurmak basılı pointer sahipliğini ve odağı düşürürdü.
   */
  setIcon(icon: string | Node | null): void {
    if (icon === null) {
      this.iconWrapper?.remove();
      this.iconWrapper = null;
      return;
    }

    if (!this.iconWrapper) {
      this.iconWrapper = document.createElement('span');
      this.iconWrapper.className = 'vol-hold-button__icon';
      this.element.appendChild(this.iconWrapper);
    }

    if (typeof icon === 'string') {
      this.iconWrapper.textContent = icon;
    } else {
      this.iconWrapper.replaceChildren(icon);
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
    this.element.removeEventListener('lostpointercapture', this.boundPointerLeave);
    this.element.removeEventListener('pointerleave', this.boundPointerLeave);
    document.removeEventListener('visibilitychange', this.boundVisibility);
    this.unbindHoldInput?.();
    this.element.remove();
  }

  private setPressed(pressed: boolean, source: 'pointer' | 'keyboard'): void {
    if (this.pressed === pressed) {
      return;
    }
    this.pressed = pressed;
    this.pressSource = pressed ? source : null;
    this.element.classList.toggle('vol-hold-button--pressed', pressed);
    this.element.setAttribute('aria-pressed', String(pressed));
    if (pressed) {
      this.onPressHandler?.();
    } else {
      this.onReleaseHandler?.();
    }
  }
}
