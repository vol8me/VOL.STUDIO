import { emitUiIntent } from '../feedback/uiIntent';
import { inlineSign } from '../direction';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import { UI_THRESHOLD } from '../../constants';
import { i18next } from '../../i18n/I18n';
import {
  ItemView,
  normalizeSpan,
  type Geometry,
  type SlotItem,
  type SlotSpan,
} from './slotGridItem';

// Genel tipler `slotGridItem.ts`te tanımlıdır (dosya boyutu sınırı); paket yüzeyi buradan yeniden dışa aktarılır.
export type { SlotItem, SlotSpan };

/** İşaretçi bırakışı niyetini yaydıktan sonra gelen uyumluluk `click`inin yutulacağı en uzun süre (ms). */
const CLICK_SWALLOW_MS = 500;

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
  /** Bu ana kadar gelen ilk fare/dokunma `click`i yutulur (işaretçi bırakışı zaten niyetini yaydı). */
  private swallowClickUntil = 0;
  /** Klavyeyle tutulan item: kaynak hücre ve imlecin dolaştığı hedef hücre. */
  private keyboardMove: { fromIndex: number; target: number; itemView: ItemView } | null = null;
  /** Dolaşma hedefi: Tab'ın indiği tek item (kök hücre indeksi). */
  private focusIndex: number | null = null;
  private readonly announcer: HTMLDivElement;
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
    // Dolu slotlar odaklanabilir düğmelerdir (ok tuşlarıyla gezinilir); boş hücreler ve yerleşim katmanları dekordur.
    this.element.setAttribute('role', 'group');
    this.element.style.setProperty('--vol-slot-grid-columns', String(this.columns));
    if (options.size) {
      this.element.style.setProperty('--vol-slot-grid-size', `${options.size}px`);
    }

    this.cellsEl = document.createElement('div');
    this.cellsEl.className = 'vol-slot-grid__cells';
    this.cellsEl.setAttribute('aria-hidden', 'true');
    this.element.appendChild(this.cellsEl);

    this.itemsEl = document.createElement('div');
    this.itemsEl.className = 'vol-slot-grid__items';
    this.itemsEl.setAttribute('role', 'presentation');
    this.itemsEl.style.pointerEvents = 'none';
    this.element.appendChild(this.itemsEl);

    this.announcer = document.createElement('div');
    this.announcer.className = 'vol-sr-only';
    // Rolsüz canlı bölge: duyurular ekran okuyucuya iletilir, grup yapısı bozulmaz.
    this.announcer.setAttribute('aria-live', 'polite');
    this.announcer.setAttribute('aria-atomic', 'true');
    this.element.appendChild(this.announcer);

    this.buildCells();
    this.refreshGeometry();
    this.syncItems();

    const pointerDown = (event: PointerEvent) => this.onPointerDown(event);
    this.itemsEl.addEventListener('pointerdown', pointerDown);
    this.scope.add({ dispose: () => this.itemsEl.removeEventListener('pointerdown', pointerDown) });

    const keyDown = (event: KeyboardEvent): void => this.onKeyDown(event);
    // Kol A odaktaki öğede `click` (detail 0) üretir (klavye Enter/Space'i kendi keydown'unda işler; bölüm elemanı düğme
    // olmadığından tarayıcı onlardan tıklama üretmez): öğe tutuluyorsa hedefe BIRAKIR, değilse etkinleştirir.
    // Fare/dokunma tıklaması pointerup'ta işlenir.
    const click = (event: MouseEvent): void => {
      if (event.detail !== 0) return;
      if (this.keyboardMove) this.dropKeyboardMove(event);
      else this.activateFromElement(event.target);
    };
    // Dokun-yerleştir: tutulan öğe varken boş/dolu bir hücreye dokunmak hedefi seçer ve bırakır (sürüklemenin eşdeğeri).
    const cellClick = (event: MouseEvent): void => {
      const move = this.keyboardMove;
      const cell = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        '.vol-slot-grid__cell',
      );
      if (!move || !cell?.dataset.slotIndex) return;
      this.placeAt(Number(cell.dataset.slotIndex), event);
    };
    const focusIn = (event: FocusEvent): void => {
      const index = this.indexOfElement(event.target);
      if (index !== null) this.setFocusIndex(index);
    };
    const focusOut = (event: FocusEvent): void => {
      // Odak öğe dışına çıkınca tutulan öğe bırakılmadan iptal edilir.
      if (this.keyboardMove && !this.itemsEl.contains(event.relatedTarget as Node | null)) {
        this.cancelKeyboardMove();
      }
    };
    // Tutulan öğe varken hücreye basmak odağı öğeden almasın (focusout taşımayı iptal ederdi).
    const cellMouseDown = (event: MouseEvent): void => {
      if (this.keyboardMove) event.preventDefault();
    };
    // Sürükleme/yerleştirme işaretçi bırakışında kendi niyetini (drop/reject) yayar; ardından gelen uyumluluk `click`i kök
    // yedeğinde ikinci bir `press` üretmesin diye bir kez yutulur (yakalama aşaması: kök dinleyicisinden önce).
    const swallowClick = (event: MouseEvent): void => {
      if (event.detail === 0 || performance.now() >= this.swallowClickUntil) return;
      this.swallowClickUntil = 0;
      event.stopPropagation();
      event.preventDefault();
    };
    this.element.addEventListener('click', swallowClick, true);
    this.cellsEl.addEventListener('mousedown', cellMouseDown);
    this.cellsEl.addEventListener('click', cellClick);
    this.itemsEl.addEventListener('keydown', keyDown);
    this.itemsEl.addEventListener('click', click);
    this.itemsEl.addEventListener('focusin', focusIn);
    this.itemsEl.addEventListener('focusout', focusOut);
    this.scope.add({
      dispose: () => {
        this.element.removeEventListener('click', swallowClick, true);
        this.cellsEl.removeEventListener('mousedown', cellMouseDown);
        this.cellsEl.removeEventListener('click', cellClick);
        this.itemsEl.removeEventListener('keydown', keyDown);
        this.itemsEl.removeEventListener('click', click);
        this.itemsEl.removeEventListener('focusin', focusIn);
        this.itemsEl.removeEventListener('focusout', focusOut);
      },
    });
  }

  destroy(): void {
    this.endDrag();
    this.endKeyboardMove();
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

  /** Bir öğe "tutuluyor" mu (klavye, kol ya da dokunma "Taşı" akışı)? */
  get isMoving(): boolean {
    return this.keyboardMove !== null;
  }

  /**
   * Taşıma akışını başlatır (sürüklemenin klavye/kol/dokunma eşdeğeri): `index` verilmezse odaktaki, o da yoksa ilk öğe.
   * Tutulurken oklar/D-pad hedef hücreyi seçer, kol A ya da Boşluk/Enter bırakır, B/Escape vazgeçer; dokunmada bir hücreye
   * ya da öğeye dokunmak hedefi seçip bırakır. Boş ızgarada ya da zaten tutuluyorsa `false` döner.
   */
  beginMove(index?: number): boolean {
    if (this.keyboardMove) return false;
    const from = index ?? this.focusIndex ?? [...this.itemViews.keys()].sort((a, b) => a - b)[0];
    const view = from === undefined ? undefined : this.itemViews.get(from);
    if (!view || from === undefined) return false;
    this.startKeyboardMove(from);
    view.element.focus();
    return true;
  }

  /** Tutulan öğeyi bırakmadan vazgeçer (öğe yerinde kalır). */
  cancelMove(): void {
    this.cancelKeyboardMove();
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
    this.applyRovingTabindex();
  }

  private updateEmptyCells(): void {
    for (let i = 0; i < this.slotCount; i++) {
      const cell = this.cellsEl.children[i] as HTMLDivElement;
      if (!cell) continue;
      cell.classList.toggle('vol-slot-grid__cell--empty', !this.occupancy.has(i));
    }
  }

  /* ── Klavye / kol ──────────────────────────────────────────────────────── */

  private indexOfElement(target: EventTarget | null): number | null {
    const itemEl = (target as HTMLElement | null)?.closest?.<HTMLElement>('.vol-slot-grid__item');
    const value = itemEl?.dataset.slotIndex;
    return value === undefined ? null : Number(value);
  }

  private setFocusIndex(index: number): void {
    this.focusIndex = index;
    this.applyRovingTabindex();
  }

  /** Tek item `tabindex=0` alır: son odaklanan, yoksa ilk dolu hücre. */
  private applyRovingTabindex(): void {
    const indexes = [...this.itemViews.keys()].sort((a, b) => a - b);
    if (indexes.length === 0) return;
    const active =
      this.focusIndex !== null && this.itemViews.has(this.focusIndex)
        ? this.focusIndex
        : indexes[0];
    for (const [index, view] of this.itemViews) view.element.tabIndex = index === active ? 0 : -1;
  }

  private activateFromElement(target: EventTarget | null): void {
    const index = this.indexOfElement(target);
    const view = index === null ? undefined : this.itemViews.get(index);
    if (view && index !== null) this.onSlotClickHandler?.(view.getItem(), index);
  }

  private announce(message: string): void {
    this.announcer.textContent = message;
  }

  private stepFor(key: string): number {
    // Izgara okuma yönüyle aynalanır: RTL'de sağdaki hücre bir önceki indekstir.
    const sign = inlineSign(this.element);
    if (key === 'ArrowLeft') return -sign;
    if (key === 'ArrowRight') return sign;
    return key === 'ArrowUp' ? -this.columns : this.columns;
  }

  /** Ok yönünde (hücre adımlarıyla, ızgara sınırında durarak) bir sonraki dolu item'ı bulur. */
  private neighborIndex(from: number, key: string): number | null {
    const step = this.stepFor(key);
    const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
    const row = Math.floor(from / this.columns);
    for (let i = from + step; i >= 0 && i < this.slotCount; i += step) {
      if (horizontal && Math.floor(i / this.columns) !== row) return null;
      const root = this.occupancy.get(i);
      if (root !== undefined && root !== from) return root;
    }
    return null;
  }

  private onKeyDown(event: KeyboardEvent): void {
    const index = this.indexOfElement(event.target);
    if (index === null) return;
    const arrow = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key);

    if (this.keyboardMove) {
      this.onGrabbedKeyDown(event, arrow);
      return;
    }
    if (arrow) {
      event.preventDefault();
      const next = this.neighborIndex(index, event.key);
      if (next !== null) this.itemViews.get(next)?.element.focus();
    } else if (event.key === ' ') {
      event.preventDefault();
      this.startKeyboardMove(index, event);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.activateFromElement(event.target);
    }
  }

  private startKeyboardMove(index: number, event?: Event): void {
    const itemView = this.itemViews.get(index);
    if (!itemView) return;
    this.keyboardMove = { fromIndex: index, target: index, itemView };
    itemView.toggleDragging(true);
    // Tutulan öğe yön girdisini kendisi alır (kol D-pad'i hedef hücreyi seçer, odak komşu öğeye kaçmaz); hücre katmanı
    // dokunma/fare için etkinleşir.
    itemView.element.dataset.volArrows = 'both';
    itemView.element.setAttribute('aria-pressed', 'true');
    this.element.classList.add('vol-slot-grid--moving');
    emitUiIntent({ kind: 'pick', origin: 'SlotGrid', target: this.element, event });
    this.announce(i18next.t('core:slotGrid.grabbed', { label: itemView.getItem().label }));
  }

  private onGrabbedKeyDown(event: KeyboardEvent, arrow: boolean): void {
    const move = this.keyboardMove;
    if (!move) return;
    if (event.key === 'Escape') {
      // Tutulan öğeyi bırakır; üstteki katman (modal) aynı basışla kapanmaz.
      event.preventDefault();
      event.stopPropagation();
      this.cancelKeyboardMove();
      return;
    }
    if (arrow) {
      event.preventDefault();
      const next = move.target + this.stepFor(event.key);
      const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      const sameRow = Math.floor(next / this.columns) === Math.floor(move.target / this.columns);
      if (next >= 0 && next < this.slotCount && (!horizontal || sameRow)) {
        move.target = next;
        this.showKeyboardTarget();
      }
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      this.dropKeyboardMove(event);
    }
  }

  /** İmlecin hedef hücresini sürükleme ile aynı işaretlerle gösterir ve duyurur. */
  private showKeyboardTarget(): void {
    const move = this.keyboardMove;
    if (!move) return;
    this.clearDropTarget();
    const cells = this.resolveTargetCells(move.fromIndex, move.target);
    const n = move.target + 1;
    if (!cells) {
      this.announce(i18next.t('core:slotGrid.targetBlocked', { n }));
      return;
    }
    const occupant = this.items[move.target];
    const free = this.isTargetFree(cells, move.fromIndex);
    const singleSwap =
      cells.length === 1 && Boolean(this.onSwapRequestHandler) && occupant !== undefined;
    const rejected = !free && !singleSwap;
    for (const cell of cells) {
      const cellEl = this.cellsEl.children[cell] as HTMLDivElement | undefined;
      if (!cellEl) continue;
      cellEl.classList.toggle('vol-slot-grid__cell--drag-over', !rejected);
      cellEl.classList.toggle('vol-slot-grid__cell--drag-rejected', rejected);
    }
    let message: string;
    if (rejected) message = i18next.t('core:slotGrid.targetBlocked', { n });
    else if (free) message = i18next.t('core:slotGrid.targetEmpty', { n });
    else message = i18next.t('core:slotGrid.targetSwap', { n, label: occupant?.label ?? '' });
    this.announce(message);
  }

  /** Dokunma/fare ile seçilen hücreye yerleştirir: hedefi o hücre yapar, önizlemeyi gösterir ve bırakır. */
  private placeAt(index: number, event: Event): void {
    const move = this.keyboardMove;
    if (!move) return;
    // Tutulan öğenin kendi hücresine dokunmak vazgeçmektir (kayma olmadan bırakmanın anlamı yoktur).
    if (index === move.fromIndex) {
      this.cancelKeyboardMove();
      return;
    }
    move.target = index;
    this.showKeyboardTarget();
    this.dropKeyboardMove(event);
  }

  private dropKeyboardMove(event: Event): void {
    const move = this.keyboardMove;
    if (!move) return;
    const label = move.itemView.getItem().label;
    const n = move.target + 1;
    if (this.handleDrop(move.fromIndex, move.target)) {
      emitUiIntent({ kind: 'drop', origin: 'SlotGrid', target: this.element, event });
      this.endKeyboardMove();
      this.setFocusIndex(move.target);
      this.itemViews.get(move.target)?.element.focus();
      this.announce(i18next.t('core:slotGrid.dropped', { label, n }));
      return;
    }
    // Geçersiz hedef: öğe tutulmaya devam eder, kullanıcı başka hücre seçebilir.
    emitUiIntent({ kind: 'reject', origin: 'SlotGrid', target: this.element, event });
    this.announce(i18next.t('core:slotGrid.rejected', { label, n }));
    // Dokunma başka bir öğeye odak verdiyse yön girdisi tutulan öğeye geri dönsün.
    if (document.activeElement !== move.itemView.element) move.itemView.element.focus();
  }

  private cancelKeyboardMove(): void {
    if (!this.keyboardMove) return;
    this.endKeyboardMove();
    this.announce(i18next.t('core:slotGrid.cancelled'));
  }

  private endKeyboardMove(): void {
    const move = this.keyboardMove;
    if (!move) return;
    delete move.itemView.element.dataset.volArrows;
    move.itemView.element.removeAttribute('aria-pressed');
    this.element.classList.remove('vol-slot-grid--moving');
    move.itemView.toggleDragging(false);
    this.clearDropTarget();
    this.keyboardMove = null;
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
      if (Math.hypot(dx, dy) < UI_THRESHOLD.DRAG_START_PX) return;
      drag.moved = true;
      // İşaretçi sürüklemesi başlayınca tutulan öğe bırakılır: iki taşıma aynı anda sürmez.
      this.cancelKeyboardMove();
      drag.itemView.toggleDragging(true);
      emitUiIntent({ kind: 'pick', origin: 'SlotGrid', target: this.element, event });
      this.dragContainer.appendChild(drag.ghostEl);
    }

    event.preventDefault();
    this.moveGhost(event.clientX, event.clientY);
    this.updateDropTarget(event.clientX, event.clientY);
  };

  private onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    // İptal edilen sürükleme ne tıklama ne bırakma sayılır; öğe yerinde kalır.
    if (event.type === 'pointercancel') {
      this.clearDropTarget();
      this.endDrag();
      return;
    }

    if (!drag.moved) {
      // Tıklama: öğe tutuluyorsa dokunulan öğenin hücresi hedeftir (yer değiştirme), aksi halde etkinleştirme.
      if (this.keyboardMove) {
        this.swallowNextClick();
        this.placeAt(drag.fromIndex, event);
      } else this.onSlotClickHandler?.(drag.itemView.getItem(), drag.fromIndex);
      this.endDrag();
      return;
    }
    this.swallowNextClick();

    const toIndex = this.resolveDropTarget(event.clientX, event.clientY, drag);
    this.clearDropTarget();

    if (toIndex !== null && this.handleDrop(drag.fromIndex, toIndex)) {
      emitUiIntent({ kind: 'drop', origin: 'SlotGrid', target: this.element, event });
      this.endDrag();
      return;
    }

    // Drop reddedildi veya geçersiz: item eski yerine geri döner.
    emitUiIntent({ kind: 'reject', origin: 'SlotGrid', target: this.element, event });
    drag.itemView.toggleDragging(false);
    this.endDrag();
  };

  private swallowNextClick(): void {
    this.swallowClickUntil = performance.now() + CLICK_SWALLOW_MS;
  }

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

    // En yakın hücreye oturur (`floor` değil): öğe hücre merkezinden tutulup hedef hücrenin merkezine bırakılınca köşe tam
    // hücre sınırındadır ve parmağın alt-piksel sapması bir önceki hücreye (çoğu kez dolu) düşürür — cihazda ölçüldü.
    const col = Math.round(ghostLeft / track);
    const row = Math.round(ghostTop / track);
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
      // Tüketici karar verirken envanteri yenileyebilir veya bileşeni sökebilir.
      // Eski referansla yeni öğeleri taşımak veri kaybına ve yanlış drop niyetine yol açar.
      if (
        this.scope.isDisposed() ||
        this.items[fromIndex] !== draggedItem ||
        this.items[toIndex] !== targetItem
      )
        return false;

      return this.applySwap(fromIndex, toIndex);
    }

    return this.applyMove(fromIndex, toIndex);
  }

  /** State'i günceller ve DOM'u diff ile senkronize eder. */
  private applyMove(fromIndex: number, toIndex: number): boolean {
    const item = this.items[fromIndex];
    if (!item) return false;
    delete this.items[fromIndex];
    this.items[toIndex] = item;
    this.syncItems();
    this.onMoveHandler?.(item.id, fromIndex, toIndex);
    return true;
  }

  private applySwap(fromIndex: number, toIndex: number): boolean {
    const a = this.items[fromIndex];
    const b = this.items[toIndex];
    if (!a || !b) return false;
    this.items[fromIndex] = b;
    this.items[toIndex] = a;
    this.syncItems();
    this.onMoveHandler?.(a.id, fromIndex, toIndex);
    this.onMoveHandler?.(b.id, toIndex, fromIndex);
    return true;
  }
}
