import { animateValue } from '../animation';
import { UI_RATIO, UI_TIMING } from '../../constants';
import { i18next } from '../../systems/I18n';

/**
 * Görsel varyant — `vol-bar--<variant>` CSS sınıfına çevrilir.
 *
 * Küme AÇIKTIR (`string`). Bir dönem `'health' | 'stamina' | 'cooldown'`
 * kapalı union'ıydı ve "kalkan", "ısı", "yakıt" gibi bir barı ifade etmek
 * İMKÂNSIZDI — CORE, tüketicinin hangi kaynaklara sahip olabileceğine karar
 * veriyordu. Üç ad CSS'te hazır önayar olarak durmayı sürdürür; başka bir
 * varyant için ya kendi CSS'ini yaz ya da `fillColor` ver.
 */
export type BarVariant = string;

export type BarLabel = string | ((value: number, max: number) => string);

export interface BarOptions {
  variant?: BarVariant;
  /**
   * Dolgu rengi (CSS renk değeri). CORE'un CSS'ine dokunmadan özel bir
   * varyant kurmak için: `{ variant: 'shield', fillColor: 'var(--kalkan)' }`.
   * Verilmezse renk `vol-bar--<variant>` sınıfından gelir.
   */
  fillColor?: string;
  max: number;
  value?: number;
  /**
   * value/max oranı bu eşiğin altına düşünce 'low' class'ı eklenir (örn. kritik
   * can uyarısı). `null` verilirse uyarı durumu tamamen kapanır: TÜKENEN bir
   * kaynakta (can, mana, dash) düşük değer uyarıdır, ama DOLAN bir barda
   * (deneyim) boşluk normaldir — kırmızı orada yanlış algı yaratır.
   */
  lowThreshold?: number | null;
  /** Değer değişimini akıcı gösterme süresi. 0 = anında. */
  animateMs?: number;
  /**
   * Sabit metin veya `(value, max) => string` formatter.
   * Formatter her setValue()/setMax() çağrısında yeniden çalıştırılır.
   * Düz string dinamik olarak güncellenecekse `setLabel()` kullanılmalıdır.
   */
  label?: BarLabel;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
  /**
   * Etiketsiz barlarda erişilebilirlik adı — ÇEVRİLMİŞ metin beklenir.
   *
   * Önceden CORE `t('core:bar.ariaLabel', { variant })` ile varyant adını
   * enterpole ediyordu; sonuç Türkçe arayüzde "health bar" gibi yarı çevrilmiş
   * bir etiketti. Varyant adı oyunun kelimesi, çevirisi de oyunun sorumluluğu.
   * Verilmezse jenerik bir yedek kullanılır.
   */
  ariaLabel?: string;
}

let barInstanceCounter = 0;

export class Bar {
  readonly element: HTMLDivElement;
  private readonly fillElement: HTMLDivElement;
  private labelElement: HTMLSpanElement | null;
  private readonly variant: BarVariant;
  private readonly ariaLabel?: string;
  private max: number;
  private value: number;
  private readonly lowThreshold: number | null;
  private readonly animateMs: number;
  private label?: BarLabel;
  private cancelAnimation?: () => void;
  private readonly onLanguageChanged = (): void => {
    if (this.labelElement) {
      this.renderFill(this.value);
    } else {
      this.element.setAttribute('aria-label', this.resolveAriaLabel());
    }
  };

  constructor(options: BarOptions) {
    const {
      variant = 'health',
      max,
      value = max,
      lowThreshold = UI_RATIO.BAR_LOW_THRESHOLD,
      animateMs = UI_TIMING.BAR_DEFAULT_ANIMATE,
      label,
    } = options;

    this.variant = variant;
    this.ariaLabel = options.ariaLabel;
    this.max = max;
    // Değer burada da kelepçelenmeli, aksi halde `new Bar({ max: 100, value: 150 })` gibi
    // durumlarda getValue()/aria-valuenow max'ı aşan geçersiz bir değer döndürürdü.
    this.value = Math.max(0, Math.min(max, value));
    this.lowThreshold = lowThreshold;
    this.animateMs = animateMs;
    this.label = label;

    this.element = document.createElement('div');
    this.element.className = [`vol-bar vol-bar--${variant}`, options.className]
      .filter(Boolean)
      .join(' ');
    this.element.setAttribute('role', 'progressbar');
    this.element.setAttribute('aria-valuemin', '0');

    this.fillElement = document.createElement('div');
    this.fillElement.className = 'vol-bar__fill';
    this.element.appendChild(this.fillElement);

    if (label) {
      const labelId = `vol-bar-label-${++barInstanceCounter}`;
      this.labelElement = document.createElement('span');
      this.labelElement.id = labelId;
      this.labelElement.className = 'vol-bar__label';
      this.element.appendChild(this.labelElement);
      this.element.setAttribute('aria-labelledby', labelId);
    } else {
      this.labelElement = null;
      this.element.setAttribute('aria-label', this.resolveAriaLabel());
    }

    if (options.fillColor) {
      this.fillElement.style.background = options.fillColor;
    }

    this.renderFill(this.value);
    this.renderAria();

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  setMax(max: number): void {
    this.max = max;
    // value yeni max'tan büyükse clamp edilmeli, aksi halde state tutarsız kalır.
    this.value = Math.max(0, Math.min(this.max, this.value));
    this.renderFill(this.value);
    this.renderAria();
  }

  setValue(value: number): void {
    const clamped = Math.max(0, Math.min(this.max, value));
    const from = this.value;
    this.value = clamped;
    this.renderAria();

    this.cancelAnimation?.();

    if (this.animateMs <= 0 || from === clamped) {
      this.renderFill(clamped);
      return;
    }

    this.cancelAnimation = animateValue({
      from,
      to: clamped,
      durationMs: this.animateMs,
      onUpdate: (v) => this.renderFill(v),
    });
  }

  getValue(): number {
    return this.value;
  }

  /** Etiketi runtime'da degistirir. Yeni etiket hemen render edilir. */
  setLabel(label: BarLabel): void {
    this.label = label;

    if (!this.labelElement) {
      const labelId = `vol-bar-label-${++barInstanceCounter}`;
      this.labelElement = document.createElement('span');
      this.labelElement.id = labelId;
      this.labelElement.className = 'vol-bar__label';
      this.element.appendChild(this.labelElement);
      this.element.removeAttribute('aria-label');
      this.element.setAttribute('aria-labelledby', labelId);
    }

    this.renderFill(this.value);
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.cancelAnimation?.();
    this.element.remove();
  }

  /**
   * Erişilebilirlik adı: çağıranın verdiği çevrilmiş metin, yoksa jenerik
   * yedek. CORE varyant adını çevirmeye ÇALIŞMAZ — o oyunun kelimesidir.
   */
  private resolveAriaLabel(): string {
    return this.ariaLabel ?? i18next.t('core:bar.ariaLabel');
  }

  private renderFill(value: number): void {
    const ratio = this.max > 0 ? value / this.max : 0;
    this.fillElement.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    this.element.classList.toggle(
      'vol-bar--low',
      this.lowThreshold !== null && ratio <= this.lowThreshold,
    );

    if (this.labelElement && typeof this.label === 'function') {
      this.labelElement.textContent = this.label(Math.round(value), this.max);
    } else if (this.labelElement && typeof this.label === 'string') {
      this.labelElement.textContent = this.label;
    }
  }

  /** ARIA değeri her zaman hedef değeri yansıtır, ara animasyon adımlarıyla gürültü yapmaz. */
  private renderAria(): void {
    this.element.setAttribute('aria-valuemax', String(this.max));
    this.element.setAttribute('aria-valuenow', String(Math.round(this.value)));
  }
}
