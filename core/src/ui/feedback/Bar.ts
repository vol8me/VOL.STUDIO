import { playJuice } from '../motion/juice';
import { prefersReducedMotion } from '../motion/reducedMotion';
import { animateValue } from '../animation';
import { UI_RATIO, UI_TIMING } from '../../constants';
import { i18next } from '../../i18n/I18n';

/**
 * Görsel varyant — `vol-bar--<variant>` CSS sınıfına çevrilir.
 *
 * Küme AÇIKTIR (`string`). Üç hazır varyant (`health`, `stamina`, `cooldown`)
 * CSS'te önayar olarak durur; başka bir varyant için kendi CSS'ini yaz ya da
 * `fillColor` ver.
 */
export type BarVariant = string;

export type BarLabel = string | ((value: number, max: number) => string);

/**
 * Çubuğun sunum durumu: `normal` değeri gösterir; `busy` belirsiz ilerlemedir (`aria-busy`, değer yok, kayan bant);
 * `error` hata işaretidir (tehlike rengi VE çapraz şerit, adı okuyucuya "hata" olarak duyulur). Durum değeri silmez:
 * `normal`e dönünce son değer yerinde durur.
 */
export type BarStatus = 'normal' | 'busy' | 'error';

/**
 * Dolgunun büyüme ekseni. Dikey bar TABANDAN yukarı dolar — üstten dolan bir
 * ölçek "azalan" okunur.
 */
export type BarOrientation = 'horizontal' | 'vertical';

export interface BarOptions {
  variant?: BarVariant;
  /** Dolgunun büyüme ekseni; varsayılan yatay. */
  orientation?: BarOrientation;
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
  /**
   * Değer değişimini akıcı gösterme süresi. 0 = anında. Hareket azaltma açıkken dolgu doğrudan son değere gider
   * (hasar şeridi de erimez; vuruş flaşı anlam taşıdığı için kalır).
   */
  animateMs?: number;
  /**
   * Sabit metin veya `(value, max) => string` formatter.
   * Formatter her setValue()/setMax() çağrısında yeniden çalıştırılır.
   * Düz string dinamik olarak güncellenecekse `setLabel()` kullanılmalıdır.
   */
  label?: BarLabel;
  /** Hasar gecikme şeridi; verilmezse `health` ve `stamina` varyantlarında açık. */
  trail?: boolean;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
  /**
   * Erişilebilirlik adı — ÇEVRİLMİŞ metin beklenir ("Can", "Mana").
   *
   * Varyant adı oyunun kelimesi, çevirisi de oyunun sorumluluğu. Etiketsiz barda ad budur (verilmezse jenerik bir
   * yedek). Görünür `label` ile BİRLİKTE verilirse ad yine budur ve görünür etiket DEĞER metnine döner (okuyucu
   * "Can, 40 / 250" der; etiketin kendisi ad olsaydı "40 / 250" adsız kalırdı). Görünür etiket gizlenir (`aria-hidden`).
   */
  ariaLabel?: string;
  /**
   * Okuyucuya okunan değer metni (`aria-valuetext`) — ÇEVRİLMİŞ metin beklenir ("40 / 250", "3 can"). Verilmezse
   * `core:bar.valueText` ("40 / 250") yazılır. Görünür etiket formatter'ı ADI taşıyorsa (`ariaLabel` yok) değer metni
   * ayrıca yazılmaz: aynı değerin iki kez okunması önlenir. Değer düşük eşiğin altındaysa sona "düşük" eklenir.
   */
  valueText?: (value: number, max: number) => string;
  /** Başlangıç durumu; varsayılan `normal`. */
  status?: BarStatus;
}

let barInstanceCounter = 0;

/** Sonlu olmayan sınır 0'a, eksi sınır 0'a iner; geçerli değer olduğu gibi kalır. */
function sanitizeMax(max: number): number {
  return Number.isFinite(max) ? Math.max(0, max) : 0;
}

/** Eşik [0, 1] aralığında olmalı; geçersiz (NaN, sonsuz) eşik varsayılana düşer. */
function sanitizeThreshold(threshold: number | null): number | null {
  if (threshold === null) return null;
  return Number.isFinite(threshold)
    ? Math.min(1, Math.max(0, threshold))
    : UI_RATIO.BAR_LOW_THRESHOLD;
}

export class Bar {
  readonly element: HTMLDivElement;
  private readonly fillElement: HTMLDivElement;
  private trailElement: HTMLDivElement | null = null;
  private labelElement: HTMLSpanElement | null;
  private readonly variant: BarVariant;
  private readonly orientation: BarOrientation;
  private ariaLabel?: string;
  /** Ad `ariaLabel`'dan gelir ve görünür etiket değer metnidir (bkz. `BarOptions.ariaLabel`). */
  private readonly nameFromAria: boolean;
  private readonly valueText?: (value: number, max: number) => string;
  private max: number;
  private value: number;
  private status: BarStatus = 'normal';
  private readonly lowThreshold: number | null;
  private readonly animateMs: number;
  private label?: BarLabel;
  private cancelAnimation?: () => void;
  private readonly onLanguageChanged = (): void => {
    if (this.labelElement) {
      this.renderFill(this.value);
    }
    if (!this.labelElement || this.nameFromAria) {
      this.element.setAttribute('aria-label', this.resolveAriaLabel());
    }
    this.renderAria();
  };

  constructor(options: BarOptions) {
    const {
      variant = 'health',
      max,
      value = max,
      lowThreshold = UI_RATIO.BAR_LOW_THRESHOLD,
      animateMs = UI_TIMING.BAR_DEFAULT_ANIMATE_MS,
      label,
      orientation = 'horizontal',
    } = options;

    this.variant = variant;
    this.orientation = orientation;
    this.ariaLabel = options.ariaLabel;
    this.nameFromAria = Boolean(options.ariaLabel) && Boolean(label);
    this.valueText = options.valueText;
    this.max = sanitizeMax(max);
    // Değer burada da kelepçelenmeli, aksi halde `new Bar({ max: 100, value: 150 })` gibi
    // durumlarda getValue()/aria-valuenow max'ı aşan geçersiz bir değer döndürürdü.
    this.value = Number.isFinite(value) ? Math.max(0, Math.min(this.max, value)) : 0;
    this.lowThreshold = sanitizeThreshold(lowThreshold);
    this.animateMs = animateMs;
    this.label = label;

    this.element = document.createElement('div');
    this.element.className = [
      `vol-bar vol-bar--${variant}`,
      orientation === 'vertical' ? 'vol-bar--vertical' : null,
      options.className,
    ]
      .filter(Boolean)
      .join(' ');
    this.element.setAttribute('role', 'progressbar');
    this.element.setAttribute('aria-valuemin', '0');
    // `aria-orientation` progressbar rolünde GEÇERSİZ bir öznitelik (axe aria-allowed-attr); dikey eksen
    // yalnız görseldir, okuma yönü değer/ad ile verilir.

    // Hasar gecikme şeridi: değer düşünce eski seviye kısa süre kalır, sonra erir (gecikme ve süre
    // `MOTION_JUICE`); artışta anında izler. Yalnız tükenen kaynaklarda (can, dayanıklılık) varsayılan açık.
    if (options.trail ?? (variant === 'health' || variant === 'stamina')) {
      this.trailElement = document.createElement('div');
      this.trailElement.className = 'vol-bar__trail';
      this.element.appendChild(this.trailElement);
    }

    this.fillElement = document.createElement('div');
    this.fillElement.className = 'vol-bar__fill';
    this.element.appendChild(this.fillElement);

    if (label) {
      const labelId = `vol-bar-label-${++barInstanceCounter}`;
      this.labelElement = document.createElement('span');
      this.labelElement.id = labelId;
      this.labelElement.className = 'vol-bar__label';
      this.element.appendChild(this.labelElement);
      if (this.nameFromAria) {
        this.labelElement.setAttribute('aria-hidden', 'true');
        this.element.setAttribute('aria-label', this.resolveAriaLabel());
      } else {
        this.element.setAttribute('aria-labelledby', labelId);
      }
    } else {
      this.labelElement = null;
      this.element.setAttribute('aria-label', this.resolveAriaLabel());
    }

    if (options.fillColor) {
      this.fillElement.style.backgroundColor = options.fillColor;
    }

    this.renderFill(this.value);
    this.renderTrail(this.value, true);
    this.renderAria();
    if (options.status && options.status !== 'normal') this.setStatus(options.status);

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  /**
   * Sunum durumunu değiştirir (bkz. `BarStatus`). Değer ve eşik durumu korunur; `busy` iken `setValue` değeri
   * saklar ama gösterilmez.
   */
  setStatus(status: BarStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.element.classList.toggle('vol-bar--busy', status === 'busy');
    this.element.classList.toggle('vol-bar--error', status === 'error');
    this.renderFill(this.value);
    this.renderTrail(this.value, true);
    this.renderAria();
  }

  getStatus(): BarStatus {
    return this.status;
  }

  /**
   * Erişilebilirlik adını değiştirir (dil değişimi, seçili öğenin değişmesi). Ad kaynağı etiket olan barda (`ariaLabel`
   * ve `label` birlikte verilmemişse) etkisizdir: orada ad görünür etikettir.
   */
  setAriaLabel(label: string): void {
    this.ariaLabel = label;
    if (!this.labelElement || this.nameFromAria) this.element.setAttribute('aria-label', label);
  }

  setMax(max: number): void {
    this.max = sanitizeMax(max);
    // value yeni max'tan büyükse clamp edilmeli, aksi halde state tutarsız kalır.
    this.value = Math.max(0, Math.min(this.max, this.value));
    this.renderFill(this.value);
    this.renderAria();
  }

  setValue(value: number): void {
    // Geçersiz sayı ("NaN", "Infinity") yok sayılır: son geçerli değer kalır, çubuk "NaN%" ile bozulmaz.
    if (!Number.isFinite(value)) return;
    const clamped = Math.max(0, Math.min(this.max, value));
    const from = this.value;
    this.value = clamped;
    this.renderAria();
    this.renderTrail(clamped, clamped >= from);
    // Vuruş flaşı: şeritli (tükenen) barlarda düşüş kısa bir parlama taşır; tek vuruşta tek flaş.
    if (this.trailElement && clamped < from) playJuice(this.element, 'flash');

    this.cancelAnimation?.();

    if (this.animateMs <= 0 || from === clamped || prefersReducedMotion()) {
      this.cancelAnimation = undefined;
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

  /** Etiketi runtime'da değiştirir. Yeni etiket hemen render edilir. */
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

  /** Şerit hedef değeri izler: düşüşte geciktirilmiş erime (CSS geçişi), artışta anında. */
  private renderTrail(value: number, instant: boolean): void {
    const trail = this.trailElement;
    if (!trail) return;
    const ratio = this.max > 0 ? value / this.max : 0;
    const percent = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    trail.classList.toggle('vol-bar__trail--instant', instant);
    if (this.orientation === 'vertical') trail.style.height = percent;
    else trail.style.width = percent;
  }

  private renderFill(value: number): void {
    const ratio = this.max > 0 ? value / this.max : 0;
    const busy = this.status === 'busy';
    // Belirsiz ilerlemede dolgunun boyutunu CSS belirler (kayan bant); satır içi oran silinir, değer saklı kalır.
    const percent = busy ? '' : `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    if (this.orientation === 'vertical') this.fillElement.style.height = percent;
    else this.fillElement.style.width = percent;
    // Düşük uyarısı yalnız değer gösterilirken anlamlıdır: kayan bant ve hata kendi tonunu taşır.
    this.element.classList.toggle(
      'vol-bar--low',
      this.status === 'normal' && this.lowThreshold !== null && ratio <= this.lowThreshold,
    );

    if (this.labelElement && typeof this.label === 'function') {
      this.labelElement.textContent = this.label(Math.round(value), this.max);
    } else if (this.labelElement && typeof this.label === 'string') {
      this.labelElement.textContent = this.label;
    }
  }

  /**
   * ARIA değeri her zaman hedef değeri yansıtır, ara animasyon adımlarıyla gürültü yapmaz. Öznitelikler yalnız değişince
   * yazılır: aynı değeri yeniden yazmak bazı okuyucularda yeniden duyuruya yol açar.
   */
  private renderAria(): void {
    const busy = this.status === 'busy';
    this.writeAttribute('aria-busy', busy ? 'true' : null);
    this.writeAttribute('aria-valuemax', busy ? null : String(this.max));
    this.writeAttribute('aria-valuenow', busy ? null : String(Math.round(this.value)));
    this.writeAttribute('aria-valuetext', busy ? null : this.resolveValueText());
  }

  /** Düşük uyarısı HEDEF değerden türer (ara animasyon karesinden değil). */
  private isLow(): boolean {
    if (this.status !== 'normal' || this.lowThreshold === null) return false;
    return (this.max > 0 ? this.value / this.max : 0) <= this.lowThreshold;
  }

  /**
   * Okuyucuya okunan değer metni; `null` ise öznitelik yazılmaz (ad değeri zaten taşıyor ya da belirsiz ilerleme).
   * Düşük durum yalnız renkle değil metinle de söylenir ("40 / 250, düşük").
   */
  private resolveValueText(): string | null {
    if (this.status === 'error') return i18next.t('core:bar.error');
    const value = Math.round(this.value);
    const low = this.isLow() ? i18next.t('core:bar.low') : null;
    let text: string | null;
    if (this.valueText) text = this.valueText(value, this.max);
    else if (this.nameFromAria && typeof this.label === 'function')
      text = this.label(value, this.max);
    else if (typeof this.label === 'function') text = null;
    else text = i18next.t('core:bar.valueText', { value, max: this.max });
    if (low === null) return text;
    return text === null ? low : `${text}, ${low}`;
  }

  private writeAttribute(name: string, value: string | null): void {
    if (value === null) {
      if (this.element.hasAttribute(name)) this.element.removeAttribute(name);
    } else if (this.element.getAttribute(name) !== value) {
      this.element.setAttribute(name, value);
    }
  }
}
