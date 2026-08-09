export interface VirtualListOptions<T> {
  items: T[];
  /** Satır başına sabit piksel yükseklik; pencereleme hesabı buna dayanır (değişken yükseklik desteklenmez). */
  itemHeight: number;
  /** Viewport yüksekliği (piksel). */
  height: number;
  /** Bir item için DOM elementi üretir; yalnızca görünür + overscan aralığındaki item'lar için çağrılır. */
  renderItem: (item: T, index: number) => HTMLElement;
  /** Viewport üstünde/altında ön-render edilen ek satır sayısı — hızlı kaydırmada boşluk yanıp sönmesini önler. Varsayılan 4. */
  overscan?: number;
}

/**
 * Binlerce satırı (envanter, liderlik, sohbet geçmişi) hepsini mount etmeden
 * render eder — her an yalnızca görünür aralık (+ overscan) DOM'da vardır.
 * ScrollView küçük/statik listeler için yeterliyken bununla farkı budur.
 *
 * `setItems()` liste içeriğini değiştirir (ör. filtre uygulama) ve scroll
 * pozisyonunu korur.
 */
export class VirtualList<T> {
  readonly element: HTMLDivElement;
  private readonly spacer: HTMLDivElement;
  private readonly viewport: HTMLDivElement;
  private readonly itemHeight: number;
  private readonly overscan: number;
  private readonly renderItemFn: (item: T, index: number) => HTMLElement;
  private readonly viewportHeightHint: number;
  private items: T[];
  private renderedRange: { start: number; end: number } | null = null;
  private boundScroll: () => void;
  private rafHandle: number | null = null;

  constructor(options: VirtualListOptions<T>) {
    this.items = options.items;
    this.itemHeight = options.itemHeight;
    this.overscan = options.overscan ?? 4;
    this.renderItemFn = options.renderItem;
    this.viewportHeightHint = options.height;

    this.element = document.createElement('div');
    this.element.className = 'vol-virtual-list';
    this.element.style.height = `${options.height}px`;
    // tabindex="0" bu overflow:auto kapsayıcını klavye-odaklanabilir yapar, native
    // Page Up/Down/Home/End/ok kaydırmasını etkinleştirir; olmadan klavye-only
    // kullanıcılar erişemez.
    this.element.tabIndex = 0;
    this.element.setAttribute('role', 'list');

    this.spacer = document.createElement('div');
    this.spacer.className = 'vol-virtual-list__spacer';
    this.element.appendChild(this.spacer);

    this.viewport = document.createElement('div');
    this.viewport.className = 'vol-virtual-list__viewport';
    this.element.appendChild(this.viewport);

    this.boundScroll = () => this.scheduleRender();
    this.element.addEventListener('scroll', this.boundScroll);

    this.updateSpacerHeight();
    this.renderVisible();
  }

  /** Liste içeriğini değiştirir (ör. filtre uygulama); scroll pozisyonunu korur. */
  setItems(items: T[]): void {
    this.items = items;
    this.renderedRange = null;
    this.updateSpacerHeight();
    // Yeni liste daha kısaysa scrollTop aralık dışında kalabilir. Tarayıcı bunu
    // asenkron sınırlandırır, bu yüzden boş kare yanıp sönmesini önlemek için
    // burada senkron sınırlandırırız.
    const maxScrollTop = Math.max(
      0,
      this.items.length * this.itemHeight - this.element.clientHeight,
    );
    if (this.element.scrollTop > maxScrollTop) {
      this.element.scrollTop = maxScrollTop;
    }
    this.renderVisible();
  }

  /** Verilen indeksteki item'ı görünür alana kaydırır. */
  scrollToIndex(index: number): void {
    const clamped = Math.max(0, Math.min(index, this.items.length - 1));
    this.element.scrollTop = clamped * this.itemHeight;
  }

  destroy(): void {
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    this.element.removeEventListener('scroll', this.boundScroll);
    this.element.remove();
  }

  private updateSpacerHeight(): void {
    this.spacer.style.height = `${this.items.length * this.itemHeight}px`;
  }

  private scheduleRender(): void {
    if (this.rafHandle !== null) return;
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null;
      this.renderVisible();
    });
  }

  private renderVisible(): void {
    const scrollTop = this.element.scrollTop;
    // clientHeight element DOM'a yerleşmeden önce 0'dır (ör. constructor'ın ilk
    // çağrısı), bu viewport'u eksik render eder. options.height güvenli fallback.
    const viewportHeight = this.element.clientHeight || this.viewportHeightHint;

    const firstVisible = Math.floor(scrollTop / this.itemHeight);
    const lastVisible = Math.ceil((scrollTop + viewportHeight) / this.itemHeight);

    const start = Math.max(0, firstVisible - this.overscan);
    const end = Math.min(this.items.length, lastVisible + this.overscan);

    if (
      this.renderedRange &&
      this.renderedRange.start === start &&
      this.renderedRange.end === end
    ) {
      return;
    }
    this.renderedRange = { start, end };

    this.viewport.replaceChildren();
    this.viewport.style.transform = `translateY(${start * this.itemHeight}px)`;

    const fragment = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      const row = document.createElement('div');
      row.className = 'vol-virtual-list__row';
      row.style.height = `${this.itemHeight}px`;
      row.appendChild(this.renderItemFn(this.items[i], i));
      fragment.appendChild(row);
    }
    this.viewport.appendChild(fragment);
  }
}
