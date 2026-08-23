export type VirtualListKey = string | number;

export interface KeyedVirtualListOptions<T> {
  items: readonly T[];
  getKey: (item: T) => VirtualListKey;
  itemHeight: number;
  /** Verilmezse liste parent yüksekliğine esner (`height: 100%`). */
  height?: number | string;
  overscan?: number;
  ariaLabel?: string;
  renderItem: (item: T, index: number) => HTMLElement;
  /** Aynı key'in DOM'unu koruyarak içerik güncellemek için. */
  updateItem?: (element: HTMLElement, item: T, index: number) => void;
  /**
   * Satır görünürden çıktığında ve liste yıkıldığında çağrılır.
   *
   * `renderItem` içinde CORE bileşeni (Button, Icon, Popover…) kuran listeler
   * bu kanca olmadan her kaydırmada dinleyici ve i18n aboneliği sızdırır:
   * satır DOM'dan düşer ama bileşenin `destroy()`'u hiç çağrılmazdı.
   */
  destroyItem?: (element: HTMLElement, item: T) => void;
}

interface RenderedRow<T> {
  row: HTMLDivElement;
  content: HTMLElement;
  item: T;
  index: number;
}

/**
 * Görünür satırları key'e göre diff'leyen sabit yükseklikli liste. Aynı key
 * görünür kaldığı sürece DOM düğümü ve içindeki klavye odağı korunur.
 */
export class KeyedVirtualList<T> {
  readonly element: HTMLDivElement;
  private readonly viewport: HTMLDivElement;
  private readonly itemHeight: number;
  private readonly overscan: number;
  private readonly heightHint: number;
  private readonly getKeyFn: (item: T) => VirtualListKey;
  private readonly renderItemFn: (item: T, index: number) => HTMLElement;
  private readonly updateItemFn?: (element: HTMLElement, item: T, index: number) => void;
  private readonly destroyItemFn?: (element: HTMLElement, item: T) => void;
  private readonly rendered = new Map<VirtualListKey, RenderedRow<T>>();
  private items: readonly T[];
  private range: { start: number; end: number } | null = null;
  private dirty = true;
  private rafHandle: number | null = null;
  private readonly boundScroll: () => void;
  private readonly resizeObserver: ResizeObserver | null;

  constructor(options: KeyedVirtualListOptions<T>) {
    if (!Number.isFinite(options.itemHeight) || options.itemHeight <= 0) {
      throw new Error('KeyedVirtualList.itemHeight pozitif ve sonlu olmalıdır');
    }
    this.items = options.items;
    this.itemHeight = options.itemHeight;
    this.overscan = Math.max(0, Math.floor(options.overscan ?? 4));
    this.heightHint = typeof options.height === 'number' ? options.height : 240;
    this.getKeyFn = options.getKey;
    this.renderItemFn = options.renderItem;
    this.updateItemFn = options.updateItem;
    this.destroyItemFn = options.destroyItem;
    this.assertUniqueKeys(this.items);

    this.element = document.createElement('div');
    this.element.className = 'vol-keyed-virtual-list';
    this.element.tabIndex = 0;
    this.element.setAttribute('role', 'list');
    if (options.ariaLabel) this.element.setAttribute('aria-label', options.ariaLabel);
    this.element.style.height =
      typeof options.height === 'number' ? `${options.height}px` : options.height ?? '100%';

    this.viewport = document.createElement('div');
    this.viewport.className = 'vol-keyed-virtual-list__viewport';
    this.element.appendChild(this.viewport);

    this.boundScroll = () => this.scheduleRender();
    this.element.addEventListener('scroll', this.boundScroll);
    this.resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => this.scheduleRender());
    this.resizeObserver?.observe(this.element);
    this.updateExtent();
    this.renderVisible();
  }

  setItems(items: readonly T[]): void {
    this.assertUniqueKeys(items);
    this.items = items;
    this.dirty = true;
    this.updateExtent();
    const maxScrollTop = Math.max(0, items.length * this.itemHeight - this.viewportHeight());
    if (this.element.scrollTop > maxScrollTop) this.element.scrollTop = maxScrollTop;
    this.renderVisible();
  }

  getItems(): readonly T[] {
    return this.items;
  }

  /** Görünür key'leri, DOM sırasıyla döndürür. */
  getRenderedKeys(): VirtualListKey[] {
    return [...this.viewport.children].map((row) => {
      const encoded = (row as HTMLElement).dataset.virtualKey;
      const rendered = [...this.rendered.entries()].find(([, value]) => value.row === row);
      return rendered?.[0] ?? encoded ?? '';
    });
  }

  getRenderedElement(key: VirtualListKey): HTMLElement | undefined {
    return this.rendered.get(key)?.content;
  }

  scrollToIndex(index: number, align: 'start' | 'center' | 'end' = 'start'): void {
    if (this.items.length === 0) return;
    const clamped = Math.max(0, Math.min(Math.floor(index), this.items.length - 1));
    const viewportHeight = this.viewportHeight();
    const offset =
      align === 'center'
        ? (viewportHeight - this.itemHeight) / 2
        : align === 'end'
        ? viewportHeight - this.itemHeight
        : 0;
    this.element.scrollTop = Math.max(0, clamped * this.itemHeight - offset);
    this.renderVisible();
  }

  scrollToKey(key: VirtualListKey, align: 'start' | 'center' | 'end' = 'start'): void {
    const index = this.items.findIndex((item) => this.getKeyFn(item) === key);
    if (index >= 0) this.scrollToIndex(index, align);
  }

  /** Aynı veriyle `updateItem` callback'lerini yeniden çalıştırır. */
  refresh(): void {
    this.dirty = true;
    this.renderVisible();
  }

  destroy(): void {
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    this.resizeObserver?.disconnect();
    this.element.removeEventListener('scroll', this.boundScroll);
    for (const rendered of this.rendered.values()) {
      this.destroyItemFn?.(rendered.content, rendered.item);
    }
    this.rendered.clear();
    this.element.remove();
  }

  private scheduleRender(): void {
    if (this.rafHandle !== null) return;
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null;
      this.renderVisible();
    });
  }

  private renderVisible(): void {
    const viewportHeight = this.viewportHeight();
    const firstVisible = Math.floor(this.element.scrollTop / this.itemHeight);
    const lastVisible = Math.ceil((this.element.scrollTop + viewportHeight) / this.itemHeight);
    const start = Math.max(0, firstVisible - this.overscan);
    const end = Math.min(this.items.length, lastVisible + this.overscan);
    if (!this.dirty && this.range?.start === start && this.range.end === end) return;
    const forceUpdate = this.dirty;
    this.range = { start, end };
    this.dirty = false;

    const wanted = new Set<VirtualListKey>();
    const orderedRows: HTMLDivElement[] = [];
    for (let index = start; index < end; index++) {
      const item = this.items[index];
      const key = this.getKeyFn(item);
      wanted.add(key);
      let rendered = this.rendered.get(key);
      if (!rendered) {
        const content = this.renderItemFn(item, index);
        const row = document.createElement('div');
        row.className = 'vol-keyed-virtual-list__row';
        row.dataset.virtualKey = String(key);
        row.setAttribute('role', 'listitem');
        row.appendChild(content);
        rendered = { row, content, item, index };
        this.rendered.set(key, rendered);
      } else if (
        this.updateItemFn &&
        (forceUpdate || rendered.item !== item || rendered.index !== index)
      ) {
        this.updateItemFn(rendered.content, item, index);
      }

      rendered.item = item;
      rendered.index = index;
      rendered.row.style.height = `${this.itemHeight}px`;
      rendered.row.style.transform = `translateY(${index * this.itemHeight}px)`;
      rendered.row.setAttribute('aria-posinset', String(index + 1));
      rendered.row.setAttribute('aria-setsize', String(this.items.length));
      orderedRows.push(rendered.row);
    }

    // `replaceChildren()` odaklı bir satırı geçici olarak DOM'dan koparıp
    // odağı düşürür. insertBefore aynı parent içindeki düğümü taşır ve odağı
    // korur; gereksiz satırlar ancak sıralama tamamlandıktan sonra kaldırılır.
    let cursor = this.viewport.firstChild;
    for (const row of orderedRows) {
      if (row !== cursor) this.viewport.insertBefore(row, cursor);
      cursor = row.nextSibling;
    }
    for (const [key, rendered] of [...this.rendered]) {
      if (wanted.has(key)) continue;
      rendered.row.remove();
      this.rendered.delete(key);
      this.destroyItemFn?.(rendered.content, rendered.item);
    }
  }

  private updateExtent(): void {
    this.viewport.style.height = `${this.items.length * this.itemHeight}px`;
  }

  private viewportHeight(): number {
    return this.element.clientHeight || this.heightHint;
  }

  private assertUniqueKeys(items: readonly T[]): void {
    const seen = new Set<VirtualListKey>();
    for (const item of items) {
      const key = this.getKeyFn(item);
      if (seen.has(key)) throw new Error(`KeyedVirtualList içinde yinelenen key: "${String(key)}"`);
      seen.add(key);
    }
  }
}
