export interface TabContent {
  element: HTMLElement;
  /** Tabs.destroy() tarafından çağrılır (verilirse). */
  destroy?: () => void;
}

export interface TabDefinition {
  id: string;
  label: string;
  content: TabContent;
}

export type TabsOrientation = 'horizontal' | 'vertical';

let tabsInstanceCounter = 0;

export interface TabsOptions {
  onChange?: (id: string) => void;
  /** Sekme çubuğu yönü. Varsayılan 'horizontal'. */
  orientation?: TabsOrientation;
  /** Sekme listesinin başına eklenen opsiyonel element (ör. dikey kenar çubuğunda başlık/logo). */
  listHeader?: HTMLElement;
}

/**
 * ARIA tablist deseni: `role="tablist"` çubuğu, her sekme `role="tab"` +
 * `aria-selected`, paneller `role="tabpanel"`. Pasif paneller `hidden` attribute
 * yerine CSS class ile gizlenir — çünkü panel içeriğindeki yazar `display`
 * kuralları UA'nın `[hidden] { display: none }` kuralını ezebilir.
 */
export class Tabs {
  readonly element: HTMLDivElement;
  private readonly sidebar: HTMLDivElement;
  private readonly tablist: HTMLDivElement;
  private readonly panelContainer: HTMLDivElement;
  private readonly tabs: TabDefinition[];
  private readonly tabButtons = new Map<string, HTMLButtonElement>();
  private readonly boundClickHandlers = new Map<string, () => void>();
  private readonly boundKeydownHandlers = new Map<string, (event: KeyboardEvent) => void>();
  private activeId: string;
  private readonly onChange?: (id: string) => void;
  private readonly orientation: TabsOrientation;
  private readonly listHeader: HTMLElement | null;
  private readonly instanceId = `vol-tabs-${++tabsInstanceCounter}`;

  constructor(tabs: TabDefinition[], options: TabsOptions = {}) {
    if (tabs.length === 0) {
      throw new Error('Tabs: en az bir sekme gerekli');
    }

    this.tabs = tabs;
    this.onChange = options.onChange;
    this.orientation = options.orientation ?? 'horizontal';
    this.activeId = tabs[0].id;

    this.element = document.createElement('div');
    this.element.className = `vol-tabs vol-tabs--${this.orientation}`;

    this.tablist = document.createElement('div');
    this.tablist.className = 'vol-tabs__list';
    this.tablist.setAttribute('role', 'tablist');
    this.tablist.setAttribute('aria-orientation', this.orientation);

    this.listHeader = options.listHeader ?? null;

    this.panelContainer = document.createElement('div');
    this.panelContainer.className = 'vol-tabs__panels';

    for (const [index, tab] of tabs.entries()) {
      // id çifti sekme ve paneli çift yönlü bağlar: aria-controls (sekme->panel) ve aria-labelledby (panel->sekme).
      const tabId = `${this.instanceId}-tab-${tab.id}`;
      const panelId = `${this.instanceId}-panel-${tab.id}`;

      const button = document.createElement('button');
      button.type = 'button';
      button.id = tabId;
      button.className = 'vol-tabs__tab';
      button.textContent = tab.label;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(tab.id === this.activeId));
      button.setAttribute('aria-controls', panelId);
      button.tabIndex = tab.id === this.activeId ? 0 : -1;

      const onClick = (): void => this.select(tab.id);
      const onKeydown = (event: KeyboardEvent): void => this.handleKeydown(event, index);
      button.addEventListener('click', onClick);
      button.addEventListener('keydown', onKeydown);
      this.boundClickHandlers.set(tab.id, onClick);
      this.boundKeydownHandlers.set(tab.id, onKeydown);

      this.tablist.appendChild(button);
      this.tabButtons.set(tab.id, button);

      const isActive = tab.id === this.activeId;
      tab.content.element.id = panelId;
      tab.content.element.setAttribute('role', 'tabpanel');
      tab.content.element.setAttribute('aria-labelledby', tabId);
      tab.content.element.setAttribute('aria-hidden', String(!isActive));
      tab.content.element.classList.toggle('vol-tabs__panel--hidden', !isActive);
      this.panelContainer.appendChild(tab.content.element);
    }

    this.sidebar = document.createElement('div');
    this.sidebar.className = 'vol-tabs__sidebar';
    if (this.listHeader) {
      this.sidebar.appendChild(this.listHeader);
    }
    this.sidebar.appendChild(this.tablist);

    this.element.appendChild(this.sidebar);
    this.element.appendChild(this.panelContainer);
  }

  select(id: string): void {
    if (id === this.activeId || !this.tabButtons.has(id)) {
      return;
    }

    const previousButton = this.tabButtons.get(this.activeId);
    previousButton?.setAttribute('aria-selected', 'false');
    if (previousButton) previousButton.tabIndex = -1;

    const previousTab = this.tabs.find((t) => t.id === this.activeId);
    if (previousTab) {
      previousTab.content.element.setAttribute('aria-hidden', 'true');
      previousTab.content.element.classList.add('vol-tabs__panel--hidden');
    }

    this.activeId = id;

    const nextButton = this.tabButtons.get(id);
    nextButton?.setAttribute('aria-selected', 'true');
    if (nextButton) nextButton.tabIndex = 0;

    const nextTab = this.tabs.find((t) => t.id === id);
    if (nextTab) {
      nextTab.content.element.setAttribute('aria-hidden', 'false');
      nextTab.content.element.classList.remove('vol-tabs__panel--hidden');
    }

    this.onChange?.(id);
  }

  /** DOM'u, sekme butonu listener'larını ve `content.destroy` sağlayan sekmeleri temizler. */
  destroy(): void {
    for (const [id, button] of this.tabButtons) {
      const onClick = this.boundClickHandlers.get(id);
      const onKeydown = this.boundKeydownHandlers.get(id);
      if (onClick) button.removeEventListener('click', onClick);
      if (onKeydown) button.removeEventListener('keydown', onKeydown);
    }
    for (const tab of this.tabs) {
      tab.content.destroy?.();
    }
    this.element.remove();
  }

  private handleKeydown(event: KeyboardEvent, index: number): void {
    let nextIndex: number | null = null;
    const nextKey = this.orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    const prevKey = this.orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';

    if (event.key === nextKey) {
      nextIndex = (index + 1) % this.tabs.length;
    } else if (event.key === prevKey) {
      nextIndex = (index - 1 + this.tabs.length) % this.tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = this.tabs.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextTab = this.tabs[nextIndex];
    this.select(nextTab.id);
    this.tabButtons.get(nextTab.id)?.focus();
  }
}
