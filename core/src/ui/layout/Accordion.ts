export interface AccordionSectionContent {
  element: HTMLElement;
  /** Accordion.destroy() tarafından çağrılır (verilirse). */
  destroy?: () => void;
}

export interface AccordionSection {
  id: string;
  title: string;
  content: AccordionSectionContent;
  /** Başlığın solundaki ikon (svgIcon() veya emoji/Node), Tree'nin node.icon deseniyle aynı. */
  icon?: string | Node;
}

export interface AccordionOptions {
  /** Aynı anda yalnızca bir panel açık. Varsayılan true. */
  singleOpen?: boolean;
  /** Başlangıçta açık bölüm id'leri. */
  defaultOpen?: string[];
}

let accordionInstanceCounter = 0;

/** Tıklayınca açılan panellerden oluşan dikey liste. Tree'den farkı: düz — hiyerarşi yok (SSS, ayar grupları, envanter kategorileri). */
export class Accordion {
  readonly element: HTMLDivElement;
  private readonly singleOpen: boolean;
  private readonly sections: AccordionSection[];
  private readonly openIds = new Set<string>();
  private readonly headerElements = new Map<string, HTMLButtonElement>();
  private readonly panelElements = new Map<string, HTMLDivElement>();
  private readonly boundHeaderClicks = new Map<string, () => void>();
  private readonly instanceId = `vol-accordion-${++accordionInstanceCounter}`;

  constructor(sections: AccordionSection[], options: AccordionOptions = {}) {
    const { singleOpen = true, defaultOpen = [] } = options;
    this.singleOpen = singleOpen;
    this.sections = sections;

    this.element = document.createElement('div');
    this.element.className = 'vol-accordion';

    for (const section of sections) {
      this.element.appendChild(this.buildSection(section, defaultOpen.includes(section.id)));
    }
  }

  toggle(id: string): void {
    if (this.openIds.has(id)) {
      this.close(id);
    } else {
      this.open(id);
    }
  }

  open(id: string): void {
    if (this.singleOpen) {
      for (const openId of [...this.openIds]) {
        if (openId !== id) this.close(openId);
      }
    }
    this.openIds.add(id);
    this.headerElements.get(id)?.setAttribute('aria-expanded', 'true');
    this.panelElements.get(id)?.classList.add('vol-accordion__panel--open');
  }

  close(id: string): void {
    this.openIds.delete(id);
    this.headerElements.get(id)?.setAttribute('aria-expanded', 'false');
    this.panelElements.get(id)?.classList.remove('vol-accordion__panel--open');
  }

  /** DOM'u, başlık listener'larını ve `content.destroy` sağlayan bölümleri temizler. */
  destroy(): void {
    for (const [id, header] of this.headerElements) {
      const onClick = this.boundHeaderClicks.get(id);
      if (onClick) header.removeEventListener('click', onClick);
    }
    for (const section of this.sections) {
      section.content.destroy?.();
    }
    this.element.remove();
  }

  private buildSection(section: AccordionSection, isOpen: boolean): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'vol-accordion__section';

    const panelId = `${this.instanceId}-${section.id}`;
    const headerId = `${panelId}-header`;

    const header = document.createElement('button');
    header.type = 'button';
    header.id = headerId;
    header.className = 'vol-accordion__header';
    header.setAttribute('aria-expanded', String(isOpen));
    header.setAttribute('aria-controls', panelId);

    const caret = document.createElement('span');
    caret.className = 'vol-accordion__caret';
    caret.textContent = '▸';
    header.appendChild(caret);

    if (section.icon) {
      const iconSlot = document.createElement('span');
      iconSlot.className = 'vol-accordion__icon';
      if (typeof section.icon === 'string') {
        iconSlot.textContent = section.icon;
      } else {
        iconSlot.appendChild(section.icon);
      }
      header.appendChild(iconSlot);
    }

    const title = document.createElement('span');
    title.className = 'vol-accordion__title';
    title.textContent = section.title;
    header.appendChild(title);

    const onClick = (): void => this.toggle(section.id);
    header.addEventListener('click', onClick);
    this.boundHeaderClicks.set(section.id, onClick);
    this.headerElements.set(section.id, header);

    // Panel her zaman DOM'da kalır; görünürlük CSS class ile aç/kapa yapılır
    // (grid-template-rows 0fr<->1fr geçişi, bkz. theme.css) — `hidden` yerine,
    // böylece aç/kapa animasyonlu olabilir.
    const panel = document.createElement('div');
    panel.id = panelId;
    panel.className = 'vol-accordion__panel';
    // Başlıkla çift yönlü bağ: aria-controls (başlık->panel) artı role="region" +
    // aria-labelledby (panel->başlık) — ekran okuyucu hangi bölümde olduğunu anons eder.
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-labelledby', headerId);
    if (isOpen) panel.classList.add('vol-accordion__panel--open');
    const panelInner = document.createElement('div');
    panelInner.className = 'vol-accordion__panel-inner';
    panelInner.appendChild(section.content.element);
    panel.appendChild(panelInner);
    this.panelElements.set(section.id, panel);

    if (isOpen) {
      this.openIds.add(section.id);
    }

    wrapper.appendChild(header);
    wrapper.appendChild(panel);
    return wrapper;
  }
}
