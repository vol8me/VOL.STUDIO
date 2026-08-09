import { ResourceCounter, type ResourceCounterOptions } from './ResourceCounter';
import { i18next } from '../../systems/I18n';

export interface ResourceBarEntry extends ResourceCounterOptions {
  /** Bu kaynağı setResource()/getResource() ile bulmak için anahtar (örn. 'gold'). */
  key: string;
}

export interface ResourceBarOptions {
  resources: ResourceBarEntry[];
}

/** Yan yana dizilmiş çoklu kaynak şeridi (RTS'te mineral/gaz/nüfus vb.). Her kaynak kendi ResourceCounter'ı; anahtar ile ayrı ayrı güncellenebilir. */
export class ResourceBar {
  readonly element: HTMLDivElement;
  private readonly counters = new Map<string, ResourceCounter>();
  private readonly onLanguageChanged = (): void => {
    this.element.setAttribute('aria-label', i18next.t('core:resourcebar.label'));
  };

  constructor(options: ResourceBarOptions) {
    this.element = document.createElement('div');
    this.element.className = 'vol-resource-bar';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', i18next.t('core:resourcebar.label'));

    for (const entry of options.resources) {
      const { key, ...counterOptions } = entry;
      const counter = new ResourceCounter(counterOptions);
      this.counters.set(key, counter);
      this.element.appendChild(counter.element);
    }

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  setResource(key: string, value: number, options: { pulse?: boolean } = {}): void {
    this.counters.get(key)?.setValue(value, options);
  }

  getResource(key: string): number | undefined {
    return this.counters.get(key)?.getValue();
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    for (const counter of this.counters.values()) {
      counter.destroy();
    }
    this.counters.clear();
    this.element.remove();
  }
}
