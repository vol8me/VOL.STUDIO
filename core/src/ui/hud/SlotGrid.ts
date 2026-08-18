import { DisposableScope } from '../../lifecycle/DisposableScope';
import { UI_THRESHOLD } from '../../constants';
import { i18next } from '../../systems/I18n';

export interface SlotSpan {
  /** Kaç sütun kaplar. Varsayılan 1. */
  cols?: number;
  /** Kaç satır kaplar. Varsayılan 1. */
  rows?: number;
}

export interface SlotItem {
  id: string;
  label: string;
  /** String olarak verilirse initial/emoji; Node/SVG ise kopyalanıp kullanılır. */
  icon?: string | Node;
  /** Sağ altta küçük rozet (ör. "×12"). */
  quantity?: number;
  /** Slot köşe rengi. Verilmezse nötr. */
  rarity?: 'common' | 'rare' | 'epic';
  /** 1x1'den büyük blok boyutu. */
  span?: SlotSpan;
}

export interface SlotGridOptions {
  /** Toplam hücre sayısı (satır×sütun). Span'lı item'lar bunun bir parçasıdır. */
  slotCount: number;
  /** slotIndex -> SlotItem eşlemesi; index sol-üst kök hücredir. */
  items: Record<number, SlotItem>;
  /** Bir satırda kaç hücre. Varsayılan 6. */
  columns?: number;
  /** Boş slota bırakma sonrası çağrılır. */
  onMove?: (itemId: string, fromIndex: number, toIndex: number) => void;
  /**
   * Dolu slota bırakma teklifi. true dönerse swap uygulanır.
   * Yalnızca iki taraf da 1x1 ise swap geçerli; farklı span'lı item'lar reddedilir.
   */
  onSwapRequest?: (draggedItemId: string, fromIndex: number, toIndex: number) => boolean;
  /** Tıklama (sürükleme değil) sonrası çağrılır. */
  onSlotClick?: (item: SlotItem, index: number) => void;
  /** Hücre boyutu (px). Verilmezse CSS custom property veya 56px fallback. */
  size?: number;
  /** Sürükleme ghost'unun ekleneceği kapsayıcı. Varsayılan document.body — .vol-ui-root içinde tutmak için uiRoot.element geçin. */
  dragContainer?: HTMLElement;
}

interface DragState {
  itemId: string;
  fromIndex: number;
  pointerId: number;
  itemView: ItemView;
  ghostEl: HTMLDivElement;
  /** Ghost'un cursor'a göre iç offseti (px). */
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
}

interface Geometry {
  size: number;
  gap: number;
  columns: number;
  slotCount: number;
}

function normalizeSpan(span: SlotSpan | undefined): { cols: number; rows: number } {
  return { cols: Math.max(1, span?.cols ?? 1), rows: Math.max(1, span?.rows ?? 1) };
}

/**
 * Her item için tek DOM node. Node taşındığında fiziksel element aynı kalır,
 * yalnızca pozisyon/görsel güncellenir. Büyük item'lar için kök hücreden
 * itibaren `left/top/width/height` ile mutlak konumlanır.
 */
class ItemView {
  readonly element: HTMLDivElement;
  private item: SlotItem;
  private index: number;
  private geometry: Geometry;

  private iconEl: HTMLSpanElement;
  private labelEl: HTMLSpanElement;
  private quantityEl: HTMLSpanElement;

  constructor(item: SlotItem, index: number, geometry: Geometry) {
    this.item = item;
    this.index = index;
    this.geometry = geometry;

    this.element = document.createElement('div');
    this.element.className = 'vol-slot-grid__item';
    this.element.setAttribute('role', 'gridcell');
    this.element.setAttribute('aria-label', this.ariaLabel());
    this.element.dataset.itemId = item.id;
    this.element.dataset.slotIndex = String(index);
    this.element.style.pointerEvents = 'auto';

    this.iconEl = document.createElement('span');
    this.iconEl.className = 'vol-slot-grid__item-icon';
    this.element.appendChild(this.iconEl);

    this.labelEl = document.createElement('span');
    this.labelEl.className = 'vol-slot-grid__item-label';
    this.element.appendChild(this.labelEl);

    this.quantityEl = document.createElement('span');
    this.quantityEl.className = 'vol-slot-grid__item-quantity';
    this.element.appendChild(this.quantityEl);

    this.render();
    this.applyGeometry();
  }

  update(item: SlotItem, index: number, geometry: Geometry): void {
    const changed =
      this.item.id !== item.id ||
      this.item.label !== item.label ||
      this.item.quantity !== item.quantity ||
      this.item.rarity !== item.rarity ||
      this.item.icon !== item.icon ||
      this.item.span?.cols !== item.span?.cols ||
      this.item.span?.rows !== item.span?.rows ||
      this.index !== index;

    this.item = item;
    this.index = index;
    this.geometry = geometry;

    if (changed) {
      this.element.dataset.itemId = item.id;
      this.element.dataset.slotIndex = String(index);
      this.element.setAttribute('aria-label', this.ariaLabel());
      this.render();
    }
    this.applyGeometry();
  }

  getId(): string {
    return this.item.id;
  }

  getIndex(): number {
    return this.index;
  }

  getItem(): SlotItem {
    return this.item;
  }

  setGeometry(geometry: Geometry): void {
    this.geometry = geometry;
    this.applyGeometry();
  }

  toggleDragging(active: boolean): void {
    this.element.classList.toggle('vol-slot-grid__item--dragging', active);
  }

  private render(): void {
    const { item } = this;

    this.element.className = 'vol-slot-grid__item';
    if (item.rarity) {
      this.element.classList.add(`vol-slot-grid__item--rarity-${item.rarity}`);
    }

    if (item.icon) {
      if (typeof item.icon === 'string') {
        this.iconEl.textContent = item.icon;
      } else {
        this.iconEl.replaceChildren(item.icon.cloneNode(true));
      }
      this.iconEl.style.display = '';
    } else {
      this.iconEl.textContent = item.label.slice(0, 2).toLocaleUpperCase(i18next.language ?? 'tr');
      this.iconEl.style.display = '';
    }

    this.labelEl.textContent = item.label;
    this.quantityEl.textContent =
      item.quantity !== undefined && item.quantity > 1 ? `×${item.quantity}` : '';
  }

  private applyGeometry(): void {
    const { size, gap, columns } = this.geometry;
    const { cols, rows } = normalizeSpan(this.item.span);
    const col = this.index % columns;
    const row = Math.floor(this.index / columns);

    const x = col * (size + gap);
    const y = row * (size + gap);
    const w = cols * size + (cols - 1) * gap;
    const h = rows * size + (rows - 1) * gap;

    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
    this.element.style.width = `${w}px`;
    this.element.style.height = `${h}px`;
  }

  private ariaLabel(): string {
    const { item } = this;
    return item.quantity && item.quantity > 1 ? `${item.label} (×${item.quantity})` : item.label;
  }
}

/**
 * Genel amaçlı sürükle-bırak envanter slot sistemi.
 *
 * Yeni mimarinin temel prensibi:
 * - Her item TEK DOM node olarak temsil edilir; taşındığında aynı node
 *   yeni pozisyona taşınır (`left/top/width/height` güncellenir), yıkılıp
 *   yeniden yaratılmaz.
 * - Boş hücreler statik placeholder'lardır; item'lar bunların üzerinde
 *   mutlak konumlanmış ayrı bir katmanda yer alır.
 * - Sürükleme sırasında item'ın kopyası (ghost) `transform: translate3d`
 *   ile hareket eder; drop sonrası FLIP tekniğiyle yumuşak geçiş yapılır.
 * - Pointer Events kullanılır; HTML5 Drag and Drop yerine geçmez çünkü
 *   native DnD dokunmatikte çalışmaz.
 */
export class SlotGrid {
  readonly element: HTMLDivElement;
  readonly cellsEl: HTMLDivElement;
  readonly itemsEl: HTMLDivElement;

  private columns: number;
  private slotCount: number;
  private items: Record<number, SlotItem> = {};
  private itemViews = new Map<number, ItemView>();
  private occupancy = new Map<number, number>();
  private geometry: Geometry;

  private onMoveHandler?: (itemId: string, fromIndex: number, toIndex: number) => void;
  private onSwapRequestHandler?: (
    draggedItemId: string,
    fromIndex: number,
    toIndex: number,
  ) => boolean;
  private onSlotClickHandler?: (item: SlotItem, index: number) => void;
  private readonly dragContainer: HTMLElement;

  private drag: DragState | null = null;
  /**
   * Bu bileşenin ömrüne bağlı kaynaklar.
   *
   * Elle yönetilen bir `(() => void)[]` dizisiydi. `DisposableScope`in üç
   * farkı var ve üçü de davranışsal: kapatma TERS sırada yapılır (kaynaklar
   * arası bağımlılık genelde bu yönde kurulur), ikinci `dispose()` no-op'tur
   * ve bir kaynağın kapatılması FIRLATIRSA geri kalanlar yine kapatılır —
   * düz `for` döngüsü ilk hatada duruyor ve kalan her şeyi sızdırıyordu.
   */
  private readonly scope = new DisposableScope();

  constructor(options: SlotGridOptions) {
    this.slotCount = options.slotCount;
    this.columns = options.columns ?? 6;
    this.items = { ...options.items };
    this.onMoveHandler = options.onMove;
    this.onSwapRequestHandler = options.onSwapRequest;
    this.onSlotClickHandler = options.onSlotClick;
    this.dragContainer = options.dragContainer ?? document.body;
    this.geometry = {
      size: options.size ?? 56,
      gap: 8,
      columns: this.columns,
      slotCount: this.slotCount,
    };

    this.element = document.createElement('div');
    this.element.className = 'vol-slot-grid';
    this.element.setAttribute('role', 'grid');
    this.element.style.setProperty('--vol-slot-grid-columns', String(this.columns));
    if (options.size) {
      this.element.style.setProperty('--vol-slot-grid-size', `${options.size}px`);
    }

    this.cellsEl = document.createElement('div');
    this.cellsEl.className = 'vol-slot-grid__cells';
    this.element.appendChild(this.cellsEl);

    this.itemsEl = document.createElement('div');
    this.itemsEl.className = 'vol-slot-grid__items';
    this.itemsEl.style.pointerEvents = 'none';
    this.element.appendChild(this.itemsEl);

    this.buildCells();
    this.refreshGeometry();
    this.syncItems();

    const pointerDown = (event: PointerEvent) => this.onPointerDown(event);
    this.itemsEl.addEventListener('pointerdown', pointerDown);
    this.scope.add({ dispose: () => this.itemsEl.removeEventListener('pointerdown', pointerDown) });
  }

  destroy(): void {
    this.endDrag();
    this.scope.dispose();
    for (const view of this.itemViews.values()) this.itemsEl.removeChild(view.element);
    this.itemViews.clear();
    this.element.remove();
  }

  /** Belirtilen hücredeki item'ı döner (boşsa undefined). */
  getItem(index: number): SlotItem | undefined {
    const rootIndex = this.occupancy.get(index);
    return rootIndex === undefined ? undefined : this.items[rootIndex];
  }

  /** Programatik olarak item yerleştirir. */
  setItem(index: number, item: SlotItem | null): void {
    if (item) {
      this.items[index] = item;
    } else {
      delete this.items[index];
    }
    this.syncItems();
  }

  /** İlk boş hücrenin index'ini döner (1x1 item için). */
  findFirstEmptySlot(): number {
    for (let i = 0; i < this.slotCount; i++) {
      if (!this.occupancy.has(i)) return i;
    }
    return -1;
  }

  private buildCells(): void {
    for (let i = 0; i < this.slotCount; i++) {
      const cell = document.createElement('div');
      cell.className = 'vol-slot-grid__cell';
      cell.dataset.slotIndex = String(i);
      this.cellsEl.appendChild(cell);
    }
  }

  private refreshGeometry(): void {
    this.geometry = {
      ...this.geometry,
      size: this.readSize(),
      gap: this.readGap(),
      columns: this.columns,
      slotCount: this.slotCount,
    };

    for (const view of this.itemViews.values()) {
      view.setGeometry(this.geometry);
    }
  }

  private readSize(): number {
    const raw = getComputedStyle(this.element).getPropertyValue('--vol-slot-grid-size');
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    const inline = parseFloat(this.element.style.getPropertyValue('--vol-slot-grid-size') || '0');
    return inline > 0 ? inline : 56;
  }

  private readGap(): number {
    const raw = getComputedStyle(this.cellsEl).gap;
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
  }

  private computeOccupancy(): Map<number, number> {
    const map = new Map<number, number>();
    for (const [indexStr, item] of Object.entries(this.items)) {
      const rootIndex = Number(indexStr);
      const { cols, rows } = normalizeSpan(item.span);
      const col = rootIndex % this.columns;

      if (col + cols > this.columns) continue;

      const cells: number[] = [];
      let overlaps = false;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cellIndex = rootIndex + r * this.columns + c;
          if (cellIndex >= this.slotCount || map.has(cellIndex)) {
            overlaps = true;
            break;
          }
          cells.push(cellIndex);
        }
        if (overlaps) break;
      }
      if (overlaps) continue;

      for (const cell of cells) map.set(cell, rootIndex);
    }
    return map;
  }

  /**
   * State ile DOM'u senkronize eder.
   * Diff mantığı: önceki state ve yeni state'i karşılaştırır.
   * - Aynı id farklı index'teyse: view varolan node'u yeni pozisyona taşır.
   * - Yeni id: yeni ItemView oluşturur.
   * - Eksik id: eski ItemView'i kaldırır.
   * - Aynı id, aynı index, farklı içerik: günceller.
   */
  private syncItems(): void {
    const nextOccupancy = this.computeOccupancy();
    const nextItems = { ...this.items };
    const nextViews = new Map<number, ItemView>();

    // Mevcut view'leri id -> view map'le
    const byId = new Map<string, { view: ItemView; index: number }>();
    for (const [index, view] of this.itemViews) {
      byId.set(view.getId(), { view, index });
    }

    for (const [indexStr, item] of Object.entries(nextItems)) {
      const index = Number(indexStr);
      const existing = byId.get(item.id);

      if (existing) {
        const view = existing.view;
        view.update(item, index, this.geometry);
        nextViews.set(index, view);
        byId.delete(item.id);
      } else {
        const view = new ItemView(item, index, this.geometry);
        this.itemsEl.appendChild(view.element);
        nextViews.set(index, view);
      }
    }

    // Kalan eski view'leri kaldır
    for (const { view } of byId.values()) {
      this.itemsEl.removeChild(view.element);
    }

    this.itemViews = nextViews;
    this.occupancy = nextOccupancy;
    this.items = nextItems;
    this.updateEmptyCells();
  }

  private updateEmptyCells(): void {
    for (let i = 0; i < this.slotCount; i++) {
      const cell = this.cellsEl.children[i] as HTMLDivElement;
      if (!cell) continue;
      cell.classList.toggle('vol-slot-grid__cell--empty', !this.occupancy.has(i));
    }
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== undefined && event.button !== 0) return;

    const target = event.target as HTMLElement;
    const itemEl = target.closest<HTMLDivElement>('.vol-slot-grid__item');
    if (!itemEl) return;

    const indexAttr = itemEl.dataset.slotIndex;
    if (indexAttr === undefined) return;

    const index = Number(indexAttr);
    const view = this.itemViews.get(index);
    if (!view) return;

    const item = view.getItem();
    const rect = itemEl.getBoundingClientRect();

    const ghostEl = itemEl.cloneNode(true) as HTMLDivElement;
    ghostEl.classList.add('vol-slot-grid__item-ghost');
    // Klonlanan item'in mutlak `left/top` değerleri position:fixed ile
    // görünüm penceresine göre değerlendirilip ghost'u yanlış yere kaydırır;
    // transform: translate3d ile konumlandıracağımız için sıfırlanır.
    ghostEl.style.left = '0px';
    ghostEl.style.top = '0px';
    ghostEl.style.width = `${rect.width}px`;
    ghostEl.style.height = `${rect.height}px`;

    this.drag = {
      itemId: item.id,
      fromIndex: index,
      pointerId: event.pointerId,
      itemView: view,
      ghostEl,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };

    itemEl.setPointerCapture(event.pointerId);
    itemEl.addEventListener('pointermove', this.onPointerMove);
    itemEl.addEventListener('pointerup', this.onPointerUp);
    itemEl.addEventListener('pointercancel', this.onPointerUp);

    this.scope.add({
      dispose: () => {
        itemEl.removeEventListener('pointermove', this.onPointerMove);
        itemEl.removeEventListener('pointerup', this.onPointerUp);
        itemEl.removeEventListener('pointercancel', this.onPointerUp);
      },
    });
  }

  private onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.moved) {
      if (Math.hypot(dx, dy) < UI_THRESHOLD.DRAG_START) return;
      drag.moved = true;
      drag.itemView.toggleDragging(true);
      this.dragContainer.appendChild(drag.ghostEl);
    }

    event.preventDefault();
    this.moveGhost(event.clientX, event.clientY);
    this.updateDropTarget(event.clientX, event.clientY);
  };

  private onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    if (!drag.moved) {
      // Tıklama
      this.onSlotClickHandler?.(drag.itemView.getItem(), drag.fromIndex);
      this.endDrag();
      return;
    }

    const toIndex = this.resolveDropTarget(event.clientX, event.clientY, drag);
    this.clearDropTarget();

    if (toIndex !== null && this.handleDrop(drag.fromIndex, toIndex)) {
      this.endDrag();
      return;
    }

    // Drop reddedildi veya geçersiz: item eski yerine geri döner.
    drag.itemView.toggleDragging(false);
    this.endDrag();
  };

  private moveGhost(clientX: number, clientY: number): void {
    const drag = this.drag;
    if (!drag) return;
    const x = clientX - drag.offsetX;
    const y = clientY - drag.offsetY;
    drag.ghostEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  private endDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    drag.ghostEl.remove();
    drag.itemView.toggleDragging(false);
    this.clearDropTarget();
    this.drag = null;
  }

  /** Sürüklenen item'ın sol-üst köşesinin hangi hücreye denk geldiğini döner. */
  private resolveDropTarget(clientX: number, clientY: number, drag: DragState): number | null {
    const gridRect = this.cellsEl.getBoundingClientRect();
    const { size, gap } = this.geometry;
    const track = size + gap;
    if (track <= 0) return null;

    // Ghost'un sol-üst köşesi, cursor'dan offset kadar sola/yukarıdadır.
    const ghostLeft = clientX - drag.offsetX - gridRect.left;
    const ghostTop = clientY - drag.offsetY - gridRect.top;

    const col = Math.floor(ghostLeft / track);
    const row = Math.floor(ghostTop / track);
    if (col < 0 || row < 0) return null;

    const rootIndex = row * this.columns + col;
    return this.resolveTargetCells(drag.fromIndex, rootIndex) ? rootIndex : null;
  }

  private updateDropTarget(clientX: number, clientY: number): void {
    this.clearDropTarget();
    const drag = this.drag;
    if (!drag) return;

    const toIndex = this.resolveDropTarget(clientX, clientY, drag);
    if (toIndex === null || toIndex === drag.fromIndex) return;

    const cells = this.resolveTargetCells(drag.fromIndex, toIndex);
    if (!cells) return;

    const free = this.isTargetFree(cells, drag.fromIndex);
    const singleSwap =
      cells.length === 1 && Boolean(this.onSwapRequestHandler) && this.items[toIndex] !== undefined;
    const rejected = !free && !singleSwap;

    for (const cell of cells) {
      const cellEl = this.cellsEl.children[cell] as HTMLDivElement | undefined;
      if (!cellEl) continue;
      cellEl.classList.toggle('vol-slot-grid__cell--drag-over', !rejected);
      cellEl.classList.toggle('vol-slot-grid__cell--drag-rejected', rejected);
    }
  }

  private clearDropTarget(): void {
    for (const cell of this.cellsEl.children) {
      const el = cell as HTMLDivElement;
      el.classList.remove('vol-slot-grid__cell--drag-over', 'vol-slot-grid__cell--drag-rejected');
    }
  }

  private resolveTargetCells(fromIndex: number, toIndex: number): number[] | null {
    const draggedItem = this.items[fromIndex];
    if (!draggedItem) return null;

    const { cols, rows } = normalizeSpan(draggedItem.span);
    const col = toIndex % this.columns;
    if (col + cols > this.columns) return null;

    const cells: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellIndex = toIndex + r * this.columns + c;
        if (cellIndex >= this.slotCount) return null;
        cells.push(cellIndex);
      }
    }
    return cells;
  }

  private isTargetFree(cells: number[], fromIndex: number): boolean {
    return cells.every((cell) => {
      const occupant = this.occupancy.get(cell);
      return occupant === undefined || occupant === fromIndex;
    });
  }

  private handleDrop(fromIndex: number, toIndex: number): boolean {
    if (fromIndex === toIndex) return false;

    const draggedItem = this.items[fromIndex];
    if (!draggedItem) return false;

    const cells = this.resolveTargetCells(fromIndex, toIndex);
    if (!cells) return false;

    const free = this.isTargetFree(cells, fromIndex);
    const { cols, rows } = normalizeSpan(draggedItem.span);

    if (!free) {
      if (cells.length !== 1) return false;
      const targetItem = this.items[toIndex];
      if (!targetItem) return false;
      const targetSpan = normalizeSpan(targetItem.span);
      if (cols !== 1 || rows !== 1 || targetSpan.cols !== 1 || targetSpan.rows !== 1) return false;

      const allowSwap = this.onSwapRequestHandler?.(draggedItem.id, fromIndex, toIndex) ?? false;
      if (!allowSwap) return false;

      this.applySwap(fromIndex, toIndex);
      return true;
    }

    this.applyMove(fromIndex, toIndex);
    return true;
  }

  /** State'i günceller ve DOM'u diff ile senkronize eder. */
  private applyMove(fromIndex: number, toIndex: number): void {
    const item = this.items[fromIndex];
    delete this.items[fromIndex];
    this.items[toIndex] = item;
    this.syncItems();
    this.onMoveHandler?.(item.id, fromIndex, toIndex);
  }

  private applySwap(fromIndex: number, toIndex: number): void {
    const a = this.items[fromIndex];
    const b = this.items[toIndex];
    this.items[fromIndex] = b;
    this.items[toIndex] = a;
    this.syncItems();
    this.onMoveHandler?.(a.id, fromIndex, toIndex);
    this.onMoveHandler?.(b.id, toIndex, fromIndex);
  }
}
