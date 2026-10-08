import { Counter, type CounterOptions, type CounterSetValueOptions } from './Counter';

export interface ResourceCounterOptions extends CounterOptions {
  /** SVG veya metin/emoji ikon; sayının sol tarafına yerleşir. */
  icon: string | Node;
  /** Ekran okuyucular için kaynağın adı (örn. "Mermi", "Mana"). İkon dekoratif kabul edilir. */
  label: string;
}

/**
 * Counter'ın ikonlu hali — mermi/mana gibi "ikon + sayı" ikilisi gerektiren HUD
 * göstergeleri için. İkonu dekoratif (aria-hidden) yapıp erişilebilirlik için ayrı
 * bir `label` ister; salt "🔫 12" gösterimi ekran okuyucuya anlamsız gelirdi.
 */
export class ResourceCounter {
  readonly element: HTMLSpanElement;
  private readonly counter: Counter;

  constructor(options: ResourceCounterOptions) {
    const { icon, label, ...counterOptions } = options;

    this.element = document.createElement('span');
    this.element.className = 'vol-resource-counter';
    // `aria-label` yalnız rolü olan öğede geçerlidir; ad kaynağı gruba, değer duyurusu da adı taşır.
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', label);

    const iconWrapper = document.createElement('span');
    iconWrapper.className = 'vol-resource-counter__icon';
    iconWrapper.setAttribute('aria-hidden', 'true');
    if (typeof icon === 'string') {
      iconWrapper.textContent = icon;
    } else {
      iconWrapper.appendChild(icon);
    }
    this.element.appendChild(iconWrapper);

    this.counter = new Counter({ ...counterOptions, announcePrefix: label });
    this.element.appendChild(this.counter.element);
  }

  setValue(value: number, options: CounterSetValueOptions = {}): void {
    this.counter.setValue(value, options);
  }

  getValue(): number {
    return this.counter.getValue();
  }

  pulse(): void {
    this.counter.pulse();
  }

  destroy(): void {
    this.counter.destroy();
    this.element.remove();
  }
}
