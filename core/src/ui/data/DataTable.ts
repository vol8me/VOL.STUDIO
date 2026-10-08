import { DisposableScope } from '../../lifecycle/DisposableScope';
import { i18next } from '../../i18n/I18n';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Hücre içeriğini üretir. Verilmezse row[key] ham değeri gösterilir. */
  render?: (row: T) => string | Node;
  sortable?: boolean;
  /** Sıralama karşılaştırma değeri (render() görsel içerik döndürüyorsa gereklidir). */
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right' | 'center';
  width?: string;
}

export type DataTableSortDirection = 'asc' | 'desc';

export interface DataTableOptions<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** Satırı benzersiz tanımlayan alan adı. Varsayılan 'id'. */
  rowKey?: keyof T & string;
  /** true ise satırlar tıklanabilir ve tek seçim yapılabilir. Varsayılan false. */
  selectable?: boolean;
  /** true ise checkbox ile çoklu seçim. selectable:true'yu ima eder. Varsayılan false. */
  multiSelect?: boolean;
  onSelectionChange?: (keys: string[]) => void;
  onRowClick?: (row: T) => void;
  initialSort?: { key: string; direction: DataTableSortDirection };
  /** Satır yoksa gösterilecek metin. Varsayılan 'Kayıt yok'. */
  emptyText?: string;
  /**
   * Binlerce satırlık veri setleri için pencereleme (windowing) — VirtualList
   * ile aynı desen, ama `<table>` semantiği korunur: eksik satırların yüksekliği
   * tbody başına/sonuna konan boş "spacer" satırlarla telafi edilir.
   */
  virtualize?: DataTableVirtualizeOptions;
}

export interface DataTableVirtualizeOptions {
  /** Sabit satır yüksekliği (px) — pencere hesabı buna dayanır, değişken yükseklik desteklenmez. */
  rowHeight: number;
  height: number;
  /** Varsayılan 4. */
  overscan?: number;
}

/**
 * Sıralanabilir, satır-seçimli veri tablosu. Envanter/liderlik/görev listesi
 * gibi satır-sütun yapısındaki veriler için (Tree'nin hiyerarşik yapısından
 * farklı olarak).
 */
export class DataTable<T extends object> {
  readonly element: HTMLDivElement;
  private readonly table: HTMLTableElement;
  private readonly tbody: HTMLTableSectionElement;
  private readonly headerCells = new Map<string, HTMLTableCellElement>();
  private readonly columns: DataTableColumn<T>[];
  private rows: T[];
  private readonly rowKey: string;
  private readonly selectable: boolean;
  private readonly multiSelect: boolean;
  private readonly onSelectionChangeHandler?: (keys: string[]) => void;
  private readonly onRowClickHandler?: (row: T) => void;
  private emptyText: string;
  private readonly emptyTextIsI18n: boolean;
  private sortKey: string | null = null;
  private sortDirection: DataTableSortDirection = 'asc';
  private selectedKey: string | null = null;
  /** Dolaşma (roving tabindex) hedefi: Tab'ın indiği tek satır; ok tuşları bunu taşır. */
  private focusKey: string | null = null;
  private readonly selectedKeys = new Set<string>();
  /** Satır (tbody) listener temizlikleri — her renderRows() çağrısında sıfırlanır. */
  /**
   * Satır listener'ları. Satırlar her render'da yeniden kurulduğu için scope
   * `dispose()` edilip YENİDEN oluşturulur — `dispose()` sonrası bir scope'a
   * eklenen kaynak anında kapatılacağından aynı örnek tekrar kullanılamaz.
   */
  private rowScope = new DisposableScope();
  /**
   * Header sort-button listener'ları, ayrı ve kalıcı scope'ta tutulur — satır scope'u
   * içinde tutulsaydı her sıralama tıklaması header'ın kendi click listener'ını
   * silip yeniden eklemezdi (ikinci tıklama, ör. asc→desc, hiçbir şey yapmazdı).
   */
  private readonly headerScope = new DisposableScope();
  private readonly virtualize: DataTableVirtualizeOptions | null;
  /** Sıralanmış satır önbelleği — pencereleme açıkken her kaydırma karesi renderRows()'u tetikler; önbellek olmadan büyük veri setleri her karede yeniden sıralanırdı. */
  private sortedCache: T[] | null = null;
  private renderedRange: { start: number; end: number } | null = null;
  private scrollRafId: number | null = null;
  private readonly boundScroll: (() => void) | null;

  constructor(options: DataTableOptions<T>) {
    this.columns = options.columns;
    this.rows = [...options.rows];
    this.rowKey = options.rowKey ?? 'id';
    this.multiSelect = options.multiSelect ?? false;
    this.selectable = options.selectable ?? this.multiSelect;
    this.onSelectionChangeHandler = options.onSelectionChange;
    this.onRowClickHandler = options.onRowClick;
    this.emptyTextIsI18n = options.emptyText === undefined;
    this.emptyText = options.emptyText ?? i18next.t('core:datatable.empty');
    this.virtualize = options.virtualize ?? null;

    if (options.initialSort) {
      this.sortKey = options.initialSort.key;
      this.sortDirection = options.initialSort.direction;
    }

    this.element = document.createElement('div');
    this.element.className = 'vol-datatable';

    if (this.virtualize) {
      this.element.classList.add('vol-datatable--virtualized');
      this.element.style.height = `${this.virtualize.height}px`;
      this.boundScroll = () => this.scheduleWindowRender();
      this.element.addEventListener('scroll', this.boundScroll);
    } else {
      this.boundScroll = null;
    }

    this.table = document.createElement('table');
    this.table.className = 'vol-datatable__table';

    const thead = document.createElement('thead');
    thead.appendChild(this.buildHeaderRow());
    this.table.appendChild(thead);

    this.tbody = document.createElement('tbody');
    this.table.appendChild(this.tbody);
    if (this.selectable) {
      const onKeyDown = (event: KeyboardEvent): void => this.onRowKeyDown(event);
      this.tbody.addEventListener('keydown', onKeyDown);
      this.headerScope.add({ dispose: () => this.tbody.removeEventListener('keydown', onKeyDown) });
    }

    this.element.appendChild(this.table);

    this.renderRows();

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  private readonly onLanguageChanged = (): void => {
    if (this.emptyTextIsI18n) {
      this.emptyText = i18next.t('core:datatable.empty');
      this.renderRows();
    }
  };

  setRows(rows: T[]): void {
    this.rows = [...rows];
    this.selectedKeys.clear();
    this.selectedKey = null;
    this.sortedCache = null;
    this.renderedRange = null;
    if (this.virtualize) {
      const maxScrollTop = Math.max(
        0,
        this.rows.length * this.virtualize.rowHeight - this.element.clientHeight,
      );
      if (this.element.scrollTop > maxScrollTop) this.element.scrollTop = maxScrollTop;
    }
    this.renderRows();
  }

  getSelectedKeys(): string[] {
    return this.multiSelect ? [...this.selectedKeys] : this.selectedKey ? [this.selectedKey] : [];
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    if (this.scrollRafId !== null) cancelAnimationFrame(this.scrollRafId);
    if (this.boundScroll) this.element.removeEventListener('scroll', this.boundScroll);
    this.rowScope.dispose();
    this.headerScope.dispose();
    this.element.remove();
  }

  private buildHeaderRow(): HTMLTableRowElement {
    const row = document.createElement('tr');
    if (this.virtualize) row.setAttribute('aria-rowindex', '1');

    if (this.multiSelect) {
      const th = document.createElement('th');
      th.className = 'vol-datatable__header-cell vol-datatable__header-cell--checkbox';
      th.scope = 'col';
      row.appendChild(th);
    }

    for (const column of this.columns) {
      const th = document.createElement('th');
      th.className = 'vol-datatable__header-cell';
      // scope="col" olmadan ekran okuyucu hücreyi sütun başlığıyla ilişkilendiremez.
      th.scope = 'col';
      if (column.align) th.style.textAlign = column.align;
      if (column.width) th.style.width = column.width;

      const sortable = column.sortable ?? true;
      if (sortable) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'vol-datatable__sort-button';

        const label = document.createElement('span');
        label.textContent = column.header;
        button.appendChild(label);

        const indicator = document.createElement('span');
        indicator.className = 'vol-datatable__sort-indicator';
        button.appendChild(indicator);

        const onClick = (): void => this.toggleSort(column.key);
        button.addEventListener('click', onClick);
        this.headerScope.add({ dispose: () => button.removeEventListener('click', onClick) });

        th.appendChild(button);
      } else {
        th.textContent = column.header;
      }

      this.headerCells.set(column.key, th);
      row.appendChild(th);
    }

    return row;
  }

  private toggleSort(key: string): void {
    if (this.sortKey === key) {
      if (this.sortDirection === 'asc') {
        this.sortDirection = 'desc';
      } else {
        // Üçüncü tıklama sıralamayı kaldırır (asc → desc → none).
        this.sortKey = null;
        this.sortDirection = 'asc';
      }
    } else {
      this.sortKey = key;
      this.sortDirection = 'asc';
    }
    this.sortedCache = null;
    this.renderedRange = null;
    this.renderRows();
  }

  private sortedRows(): T[] {
    if (!this.sortedCache) this.sortedCache = this.computeSortedRows();
    return this.sortedCache;
  }

  private computeSortedRows(): T[] {
    if (!this.sortKey) return this.rows;
    const column = this.columns.find((c) => c.key === this.sortKey);
    if (!column) return this.rows;

    const getValue = (row: T): string | number => {
      if (column.sortValue) return column.sortValue(row);
      const raw = (row as Record<string, unknown>)[column.key] as
        string | number | boolean | null | undefined;
      return typeof raw === 'number' ? raw : String(raw ?? '');
    };

    // Yön karşılaştırma işaretiyle uygulanır — sonucu reverse() etmek eşit
    // değerli satırların sırasını da ters çevirip stable-sort garantisini bozardı.
    const factor = this.sortDirection === 'asc' ? 1 : -1;

    return [...this.rows].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv)) * factor;
    });
  }

  /**
   * Satırları yeniden kurar ve odağı korur: seçim, sıralama ve pencereleme satırları sıfırdan
   * yarattığı için odaktaki satır yok olur, odak gövdeye düşerdi (klavye/kol kullanıcısı yerini kaybeder).
   */
  private renderRows(): void {
    const active = document.activeElement;
    const focusedKey =
      active instanceof HTMLElement && this.tbody.contains(active)
        ? (active.closest<HTMLElement>('tr')?.dataset.key ?? null)
        : null;
    if (focusedKey !== null) this.focusKey = focusedKey;
    this.renderRowsNow();
    this.applyRovingTabindex();
    if (focusedKey !== null) this.rowElement(focusedKey)?.focus({ preventScroll: true });
  }

  private rowElement(key: string): HTMLTableRowElement | null {
    for (const tr of this.tbody.querySelectorAll<HTMLTableRowElement>('tr.vol-datatable__row')) {
      if (tr.dataset.key === key) return tr;
    }
    return null;
  }

  /** Seçilebilir tabloda tek satır `tabindex=0` alır: odak anahtarı, seçili satır ya da ilk satır. */
  private applyRovingTabindex(): void {
    if (!this.selectable) return;
    const rows = [...this.tbody.querySelectorAll<HTMLTableRowElement>('tr.vol-datatable__row')];
    if (rows.length === 0) return;
    const keys = new Set(rows.map((tr) => tr.dataset.key));
    const candidates = [
      this.focusKey,
      this.selectedKey,
      ...this.selectedKeys,
      rows[0].dataset.key ?? null,
    ];
    const preferred = candidates.find((key) => key !== null && keys.has(key));
    for (const tr of rows) tr.tabIndex = tr.dataset.key === preferred ? 0 : -1;
  }

  private onRowKeyDown(event: KeyboardEvent): void {
    const row = (event.target as HTMLElement).closest<HTMLElement>('tr.vol-datatable__row');
    const key = row?.dataset.key;
    if (key === undefined) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectRow(key);
      return;
    }
    const rows = this.sortedRows();
    const index = rows.findIndex((item) => this.keyOf(item) === key);
    let target = index;
    if (event.key === 'ArrowDown') target = index + 1;
    else if (event.key === 'ArrowUp') target = index - 1;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = rows.length - 1;
    else return;
    event.preventDefault();
    this.focusIndex(target);
  }

  private focusIndex(index: number): void {
    const rows = this.sortedRows();
    if (rows.length === 0) return;
    const clamped = Math.min(Math.max(0, index), rows.length - 1);
    const key = this.keyOf(rows[clamped]);
    this.focusKey = key;
    if (this.virtualize) {
      // Hedef pencerenin dışındaysa önce görünür kıl ve pencereyi hemen yeniden kur.
      const { rowHeight } = this.virtualize;
      const viewport = this.element.clientHeight || this.virtualize.height;
      const top = clamped * rowHeight;
      if (top < this.element.scrollTop) this.element.scrollTop = top;
      else if (top + rowHeight > this.element.scrollTop + viewport) {
        this.element.scrollTop = top + rowHeight - viewport;
      }
      this.renderRowsNow();
    }
    this.applyRovingTabindex();
    this.rowElement(key)?.focus({ preventScroll: !this.virtualize });
  }

  private keyOf(row: T): string {
    return String((row as Record<string, unknown>)[this.rowKey]);
  }

  private renderRowsNow(): void {
    // Yalnızca satır listener'ları temizlenir — başlık scope'una dokunulmaz.
    this.rowScope.dispose();
    this.rowScope = new DisposableScope();
    this.tbody.replaceChildren();

    for (const [key, th] of this.headerCells) {
      const isSorted = this.sortKey === key;
      const indicator = th.querySelector('.vol-datatable__sort-indicator');
      if (indicator) {
        // Üçgen CSS ile çizilir (▲▼ yazı tiplerinde yok); yön `data-direction`dadır.
        if (isSorted) indicator.setAttribute('data-direction', this.sortDirection);
        else indicator.removeAttribute('data-direction');
      }
      if (th.querySelector('.vol-datatable__sort-button')) {
        th.setAttribute(
          'aria-sort',
          isSorted ? (this.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none',
        );
      }
    }

    const rows = this.sortedRows();
    if (this.virtualize) this.table.setAttribute('aria-rowcount', String(rows.length + 1));

    if (rows.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.className = 'vol-datatable__empty';
      td.colSpan = this.columns.length + (this.multiSelect ? 1 : 0);
      td.textContent = this.emptyText;
      tr.appendChild(td);
      this.tbody.appendChild(tr);
      return;
    }

    if (!this.virtualize) {
      for (const row of rows) {
        this.tbody.appendChild(this.buildRow(row));
      }
      return;
    }

    const { rowHeight } = this.virtualize;
    const { start, end } = this.visibleRange(rows.length);
    this.renderedRange = { start, end };

    const colSpan = this.columns.length + (this.multiSelect ? 1 : 0);
    if (start > 0) {
      this.tbody.appendChild(this.buildSpacerRow(start * rowHeight, colSpan));
    }
    for (let i = start; i < end; i++) {
      const tr = this.buildRow(rows[i], i);
      tr.style.height = `${rowHeight}px`;
      this.tbody.appendChild(tr);
    }
    if (end < rows.length) {
      this.tbody.appendChild(this.buildSpacerRow((rows.length - end) * rowHeight, colSpan));
    }
  }

  private visibleRange(total: number): { start: number; end: number } {
    if (!this.virtualize) return { start: 0, end: total };
    const { rowHeight, height } = this.virtualize;
    const overscan = this.virtualize.overscan ?? 4;
    // clientHeight, DOM'a bağlanıp layout almadan 0 döner (ilk render constructor'da olur);
    // bu durumda verilen `height` fallback'tir — aksi halde ilk açılışta yalnızca overscan kadar satır görünürdü.
    const viewportHeight = this.element.clientHeight || height;
    const first = Math.floor(this.element.scrollTop / rowHeight);
    const last = Math.ceil((this.element.scrollTop + viewportHeight) / rowHeight);
    return { start: Math.max(0, first - overscan), end: Math.min(total, last + overscan) };
  }

  /** Render edilmeyen satırların yüksekliğini taşıyan boş satır — kaydırma çubuğu gerçek satır sayısını yansıtsın diye. */
  private buildSpacerRow(height: number, colSpan: number): HTMLTableRowElement {
    const tr = document.createElement('tr');
    tr.className = 'vol-datatable__spacer';
    tr.setAttribute('aria-hidden', 'true');
    const td = document.createElement('td');
    td.colSpan = colSpan;
    td.style.height = `${height}px`;
    tr.appendChild(td);
    return tr;
  }

  private scheduleWindowRender(): void {
    if (this.scrollRafId !== null) return;
    this.scrollRafId = requestAnimationFrame(() => {
      this.scrollRafId = null;
      const range = this.visibleRange(this.sortedRows().length);
      if (
        this.renderedRange &&
        this.renderedRange.start === range.start &&
        this.renderedRange.end === range.end
      ) {
        return;
      }
      this.renderRows();
    });
  }

  private buildRow(row: T, index?: number): HTMLTableRowElement {
    const key = this.keyOf(row);
    const tr = document.createElement('tr');
    tr.className = 'vol-datatable__row';
    tr.dataset.key = key;
    // Pencerelemede satırın gerçek sırası AT'ye bildirilir (başlık 1. satırdır).
    if (index !== undefined) tr.setAttribute('aria-rowindex', String(index + 2));
    if (this.selectable) tr.classList.add('vol-datatable__row--selectable');

    const isSelected = this.multiSelect ? this.selectedKeys.has(key) : this.selectedKey === key;
    if (isSelected) tr.classList.add('vol-datatable__row--selected');
    if (this.selectable) tr.setAttribute('aria-selected', String(isSelected));

    if (this.multiSelect) {
      const td = document.createElement('td');
      td.className = 'vol-datatable__cell vol-datatable__cell--checkbox';
      const checkbox = document.createElement('span');
      checkbox.className = 'vol-datatable__checkbox';
      // Durum satırın aria-selected'ında; işaret yalnız görseldir.
      checkbox.setAttribute('aria-hidden', 'true');
      td.appendChild(checkbox);
      tr.appendChild(td);
    }

    for (const column of this.columns) {
      const td = document.createElement('td');
      td.className = 'vol-datatable__cell';
      if (column.align) td.style.textAlign = column.align;

      const content = column.render
        ? column.render(row)
        : String(
            ((row as Record<string, unknown>)[column.key] as
              string | number | boolean | null | undefined) ?? '',
          );
      if (typeof content === 'string') {
        td.textContent = content;
      } else {
        td.appendChild(content);
      }
      tr.appendChild(td);
    }

    if (this.selectable) {
      const onClick = (): void => this.selectRow(key);
      tr.addEventListener('click', onClick);
      this.rowScope.add({ dispose: () => tr.removeEventListener('click', onClick) });
    }

    return tr;
  }

  private selectRow(key: string): void {
    const row = this.rows.find((r) => String((r as Record<string, unknown>)[this.rowKey]) === key);
    if (!row) return;

    if (this.multiSelect) {
      if (this.selectedKeys.has(key)) {
        this.selectedKeys.delete(key);
      } else {
        this.selectedKeys.add(key);
      }
      this.onSelectionChangeHandler?.(this.getSelectedKeys());
    } else {
      this.selectedKey = key;
      this.onSelectionChangeHandler?.(this.getSelectedKeys());
    }

    this.onRowClickHandler?.(row);
    this.renderRows();
  }
}
