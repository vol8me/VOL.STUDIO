import { animateValue } from '../animation';

export interface CounterOptions {
  value?: number;
  /** Sayı gösterimini biçimlendirir (örn. binlik ayraç, "x3" formatı). Varsayılan: Math.round + String. */
  format?: (value: number) => string;
  /** Değer değişimini akıcı sayma animasyonu süresi. 0 = anında. */
  animateMs?: number;
}

export class Counter {
  readonly element: HTMLSpanElement;
  private readonly displayElement: HTMLSpanElement;
  private readonly announceElement: HTMLSpanElement;
  private value: number;
  private readonly format: (value: number) => string;
  private readonly animateMs: number;
  private cancelAnimation?: () => void;
  private pulseTimeout?: ReturnType<typeof setTimeout>;

  constructor(options: CounterOptions = {}) {
    const { value = 0, format = (v) => String(Math.round(v)), animateMs = 150 } = options;

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
    this.announceElement.textContent = this.format(value);
    this.element.appendChild(this.announceElement);
  }

  setValue(value: number, options: { pulse?: boolean } = {}): void {
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

    this.announceElement.textContent = this.format(value);

    if (options.pulse) {
      this.pulse();
    }
  }

  getValue(): number {
    return this.value;
  }

  /** Değer görsel olarak değişmese bile vurgu animasyonu tetikler (örn. hasar aldığında). */
  pulse(): void {
    this.element.classList.remove('vol-counter--pulse');
    // Reflow zorunlu: aynı class art arda eklenirse animasyon oynamaz.
    void this.element.offsetWidth;
    this.element.classList.add('vol-counter--pulse');

    clearTimeout(this.pulseTimeout);
    this.pulseTimeout = setTimeout(() => {
      this.element.classList.remove('vol-counter--pulse');
    }, 400);
  }

  destroy(): void {
    this.cancelAnimation?.();
    clearTimeout(this.pulseTimeout);
    this.element.remove();
  }
}
