import { animateValue } from '../animation';

export interface CounterOptions {
  value?: number;
  /** Sayı gösterimini biçimlendirir (örn. binlik ayraç, "x3" formatı). Varsayılan: Math.round + String. */
  format?: (value: number) => string;
  /** Değer değişimini akıcı sayma animasyonu süresi. 0 = anında. */
  animateMs?: number;
  /** Okuyucu duyurusunun başına eklenen ad ("Mermi 12"); ikonlu sayaçlar adını buradan taşır. */
  announcePrefix?: string;
}

/**
 * Okuyucu duyuruları arasındaki asgari aralık (ms). Skor/süre gibi sık yazılan sayaç her değişimde
 * duyurulsaydı okuyucu boğulurdu: ilk değişim hemen, sonrakiler birleşip aralık sonunda SON değerle duyulur.
 */
export const COUNTER_ANNOUNCE_GAP_MS = 1000;

/** Sayı değişiminin kullanıcıya görsel olarak anlatılan yönü. */
export type CounterValueChange = 'increase' | 'decrease' | 'none';

export interface CounterSetValueOptions {
  /**
   * Yön verilmezse eski ve yeni değer karşılaştırılarak otomatik bulunur.
   *
   * **`'none'` vurguyu KAPATIR.** Değeri her karede yazan bir HUD (skor,
   * süre, mesafe) varsayılan otomatik yönü kullanırsa sürekli animasyon
   * alır; böyle bir tüketici açıkça `change: 'none'` geçer.
   */
  change?: CounterValueChange;
  /** Değer değişmese bile nötr vurgu oynatır. */
  pulse?: boolean;
}

export class Counter {
  readonly element: HTMLSpanElement;
  private readonly displayElement: HTMLSpanElement;
  private readonly announceElement: HTMLSpanElement;
  private value: number;
  private readonly format: (value: number) => string;
  private readonly animateMs: number;
  private cancelAnimation?: () => void;
  private feedbackTimeout?: ReturnType<typeof setTimeout>;
  private readonly announcePrefix: string;
  private lastAnnounceAt = Number.NEGATIVE_INFINITY;
  private pendingAnnounce?: ReturnType<typeof setTimeout>;

  constructor(options: CounterOptions = {}) {
    const {
      value = 0,
      format = (v) => String(Math.round(v)),
      animateMs = 150,
      announcePrefix = '',
    } = options;
    this.announcePrefix = announcePrefix;

    this.value = value;
    this.format = format;
    this.animateMs = animateMs;

    this.element = document.createElement('span');
    this.element.className = 'vol-counter';

    // ARIA duyurusu ayrı, gizli bir elemente konur ve yalnızca final değerde güncellenir —
    // aksi halde ekran okuyucu animasyon sırasında onlarca ara değeri anons ederdi.
    this.displayElement = document.createElement('span');
    this.displayElement.className = 'vol-counter__display';
    this.displayElement.setAttribute('aria-hidden', 'true');
    this.displayElement.textContent = this.format(value);
    this.element.appendChild(this.displayElement);

    this.announceElement = document.createElement('span');
    this.announceElement.className = 'vol-sr-only';
    this.announceElement.setAttribute('role', 'status');
    this.announceElement.setAttribute('aria-live', 'polite');
    this.announceElement.textContent = this.announceText();
    this.element.appendChild(this.announceElement);
  }

  /**
   * Değeri yazar ve varsayılan olarak DEĞİŞİM YÖNÜNÜ vurgular.
   *
   * Sözleşme (öncelik sırasıyla):
   * - `change: 'increase' | 'decrease'` → o yön zorlanır.
   * - `change: 'none'` → vurgu yok (`pulse: true` verilirse yalnız nötr pulse).
   * - `change` yok, `pulse: true` → eski nötr sözleşme korunur.
   * - Hiçbiri yok → yön eski/yeni değerden çıkarılır; değer aynıysa vurgu yok.
   *
   * Yön çıkarımı varsayılandır. Her karede aynı sayacı yazan tüketiciler için
   * `change: 'none'` çıkış kapısıdır.
   */
  setValue(value: number, options: CounterSetValueOptions = {}): void {
    const from = this.value;
    this.value = value;

    this.cancelAnimation?.();

    if (this.animateMs <= 0 || from === value) {
      this.displayElement.textContent = this.format(value);
    } else {
      this.cancelAnimation = animateValue({
        from,
        to: value,
        durationMs: this.animateMs,
        onUpdate: (v) => {
          this.displayElement.textContent = this.format(v);
        },
      });
    }

    this.announce();

    const change = options.change ?? inferValueChange(from, value);
    if (options.change !== undefined) {
      if (options.change === 'none') {
        if (options.pulse) this.pulse();
      } else {
        this.flashChange(options.change);
      }
    } else if (options.pulse) {
      // `pulse:true` eski API'nin nötr vurgu sözleşmesidir; yön bilgisi
      // isteyen çağrı açıkça `change` verir veya varsayılan infer davranışını kullanır.
      this.pulse();
    } else if (change !== 'none') {
      this.flashChange(change);
    }
  }

  getValue(): number {
    return this.value;
  }

  /** Değer görsel olarak değişmese bile vurgu animasyonu tetikler (örn. hasar aldığında). */
  pulse(): void {
    this.clearFeedbackClasses();
    // Reflow zorunlu: aynı class art arda eklenirse animasyon oynamaz.
    void this.element.offsetWidth;
    this.element.classList.add('vol-counter--pulse');

    this.scheduleFeedbackCleanup();
  }

  /** Değer yönünü renk ve aynı kısa pulse animasyonuyla anlatır. */
  private flashChange(change: Exclude<CounterValueChange, 'none'>): void {
    this.clearFeedbackClasses();
    void this.element.offsetWidth;
    this.element.classList.add(`vol-counter--${change}`);
    this.scheduleFeedbackCleanup();
  }

  private clearFeedbackClasses(): void {
    this.element.classList.remove(
      'vol-counter--pulse',
      'vol-counter--increase',
      'vol-counter--decrease',
    );
    clearTimeout(this.feedbackTimeout);
    this.feedbackTimeout = undefined;
  }

  private scheduleFeedbackCleanup(): void {
    this.feedbackTimeout = setTimeout(() => {
      this.feedbackTimeout = undefined;
      this.clearFeedbackClasses();
    }, 400);
  }

  private announceText(): string {
    const text = this.format(this.value);
    return this.announcePrefix ? `${this.announcePrefix} ${text}` : text;
  }

  /** İlk duyuru hemen, sıkışık olanlar aralık sonunda son değerle (bkz. `COUNTER_ANNOUNCE_GAP_MS`). */
  private announce(): void {
    const wait = COUNTER_ANNOUNCE_GAP_MS - (Date.now() - this.lastAnnounceAt);
    if (wait <= 0) {
      clearTimeout(this.pendingAnnounce);
      this.pendingAnnounce = undefined;
      this.announceElement.textContent = this.announceText();
      this.lastAnnounceAt = Date.now();
    } else if (this.pendingAnnounce === undefined) {
      this.pendingAnnounce = setTimeout(() => {
        this.pendingAnnounce = undefined;
        this.announceElement.textContent = this.announceText();
        this.lastAnnounceAt = Date.now();
      }, wait);
    }
  }

  destroy(): void {
    this.cancelAnimation?.();
    clearTimeout(this.feedbackTimeout);
    clearTimeout(this.pendingAnnounce);
    this.element.remove();
  }
}

function inferValueChange(from: number, to: number): CounterValueChange {
  if (to > from) return 'increase';
  if (to < from) return 'decrease';
  return 'none';
}
