import { UI_THRESHOLD } from '../../constants';
import { i18next } from '../../systems/I18n';

export type KanbanPriority = 'low' | 'medium' | 'high';

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  /** Renkli rozet ile gösterilir (ör. üretim kuyruğunda acil/normal işler). */
  priority?: KanbanPriority;
  /** Kısa etiketler, kart altında küçük çipler halinde gösterilir. */
  tags?: string[];
  /** Atanan kişi/birim adı — kartın sağ üstünde baş harfli rozet olarak gösterilir (ör. "Ork Ustası" → "OU"). */
  assignee?: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
  /** Sütun bu sayıda karta ulaşınca sayaç kırmızıya döner ve yeni kart bırakılamaz. Verilmezse sınırsız. */
  wipLimit?: number;
}

export interface KanbanOptions {
  columns: KanbanColumn[];
  onCardMove?: (cardId: string, fromColumnId: string, toColumnId: string, toIndex: number) => void;
  /** WIP limiti dolu bir sütuna bırakma denemesinde çağrılır (taşıma zaten engellenmiştir, yalnızca bilgilendirme amaçlı — ör. Toast göstermek için). */
  onWipLimitExceeded?: (columnId: string, cardId: string) => void;
  /** Karta tıklandığında çağrılır (sürükleme değil). Detay panelini açmak tüketiciye aittir. */
  onCardClick?: (card: KanbanCard, columnId: string) => void;
  /** true ise sütunların üstünde arama kutusu gösterilir; eşleşmeyen kartlar gizlenir (silinmez). Varsayılan false. */
  searchable?: boolean;
  /** Yüzlerce kart için pencereleme. Sabit kart yüksekliği varsayar — değişken yükseklikte kullanılmamalı. */
  virtualizeCards?: KanbanVirtualizeOptions;
  /** Sürükleme ghost'unun ekleneceği kapsayıcı. Varsayılan document.body — .vol-ui-root içinde tutmak için uiRoot.element geçin. */
  dragContainer?: HTMLElement;
}

export interface KanbanVirtualizeOptions {
  cardHeight: number;
  bodyHeight: number;
  /** Varsayılan 3. */
  overscan?: number;
}

const PRIORITY_I18N_KEYS = {
  low: 'core:kanban.priority.low',
  medium: 'core:kanban.priority.medium',
  high: 'core:kanban.priority.high',
} as const;

/** Klavye ile taşıma modu durumu (WCAG 2.1.1 uyumu için). `origin*` alanları Escape ile iptalde kartı eski yerine geri koymak için tutulur. */
interface KeyboardMoveState {
  cardId: string;
  originColumnId: string;
  originIndex: number;
}

interface DragState {
  cardId: string;
  fromColumnId: string;
  pointerId: number;
  cardEl: HTMLDivElement;
  ghostEl: HTMLDivElement;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
}

/** Sütunlu sürükle-bırak panosu. Native HTML5 DnD yerine Pointer Events kullanılır (native DnD dokunmatikte tetiklenmez). */
export class Kanban {
  readonly element: HTMLDivElement;
  private readonly columns: KanbanColumn[];
  private readonly columnElements = new Map<string, HTMLDivElement>();
  private readonly columnBodies = new Map<string, HTMLDivElement>();
  /** Kartların gerçekten eklendiği kapsayıcı — pencereleme açıkken gövde içindeki kaydırma penceresi (VirtualList'teki spacer + translateY deseni). */
  private readonly columnViewports = new Map<string, HTMLDivElement>();
  private readonly columnSpacers = new Map<string, HTMLDivElement>();
  private readonly virtualizeCards: KanbanVirtualizeOptions | null;
  private readonly columnScrollRaf = new Map<string, number>();
  private readonly onCardMoveHandler?: (
    cardId: string,
    fromColumnId: string,
    toColumnId: string,
    toIndex: number,
  ) => void;
  private readonly onWipLimitExceededHandler?: (columnId: string, cardId: string) => void;
  private readonly onCardClickHandler?: (card: KanbanCard, columnId: string) => void;
  private readonly cleanups: (() => void)[] = [];
  /** Kart listener temizlikleri, sütun bazında — tek düz listede biriktirilirse eskiler hiç kaldırılmaz ve bellek sınırsız büyür. */
  private readonly cardCleanups = new Map<string, (() => void)[]>();
  /** Sürükleme sırasında hedef sütunda kartın tam olarak nereye bırakılacağını gösteren ince çizgi. */
  private readonly dropIndicator: HTMLDivElement;
  /** flashCard() için işgal edilen timeout. */
  private highlightTimeout: number | null = null;
  private searchQuery = '';
  private readonly dragContainer: HTMLElement;
  private drag: DragState | null = null;
  private keyboardMove: KeyboardMoveState | null = null;
  private readonly announcer: HTMLDivElement;
  private boundPointerMove: (event: PointerEvent) => void;
  private boundPointerUp: (event: PointerEvent) => void;
  private readonly onLanguageChanged = (): void => {
    const searchInput = this.element.querySelector<HTMLInputElement>('.vol-kanban__search-input');
    if (searchInput) searchInput.placeholder = i18next.t('core:kanban.search');
    for (const column of this.columns) {
      this.rerenderColumn(column.id);
    }
  };

  constructor(options: KanbanOptions) {
    this.columns = options.columns.map((col) => ({ ...col, cards: [...col.cards] }));
    this.onCardMoveHandler = options.onCardMove;
    this.onWipLimitExceededHandler = options.onWipLimitExceeded;
    this.onCardClickHandler = options.onCardClick;
    this.virtualizeCards = options.virtualizeCards ?? null;
    this.dragContainer = options.dragContainer ?? document.body;

    this.element = document.createElement('div');
    this.element.className = 'vol-kanban-wrap';

    // Klavye ile taşımanın her adımı buradan duyurulur (görsel geri bildirim ekran okuyucuya ulaşmaz).
    this.announcer = document.createElement('div');
    this.announcer.className = 'vol-sr-only';
    this.announcer.setAttribute('role', 'status');
    this.announcer.setAttribute('aria-live', 'polite');
    this.element.appendChild(this.announcer);

    this.dropIndicator = document.createElement('div');
    this.dropIndicator.className = 'vol-kanban__drop-indicator';

    if (options.searchable) {
      this.element.appendChild(this.buildSearchBar());
    }

    const board = document.createElement('div');
    board.className = 'vol-kanban';
    this.element.appendChild(board);

    for (const column of this.columns) {
      board.appendChild(this.buildColumn(column));
    }

    this.boundPointerMove = (event) => this.handlePointerMove(event);
    this.boundPointerUp = (event) => this.handlePointerUp(event);

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    document.removeEventListener('pointermove', this.boundPointerMove);
    document.removeEventListener('pointerup', this.boundPointerUp);
    document.removeEventListener('pointercancel', this.boundPointerUp);
    for (const rafId of this.columnScrollRaf.values()) cancelAnimationFrame(rafId);
    this.columnScrollRaf.clear();
    if (this.highlightTimeout !== null) window.clearTimeout(this.highlightTimeout);
    for (const cleanup of this.cleanups) cleanup();
    for (const columnId of [...this.cardCleanups.keys()]) this.clearCardCleanups(columnId);
    this.element.remove();
  }

  private trackCardCleanup(columnId: string, cleanup: () => void): void {
    const existing = this.cardCleanups.get(columnId);
    if (existing) {
      existing.push(cleanup);
      return;
    }
    this.cardCleanups.set(columnId, [cleanup]);
  }

  private clearCardCleanups(columnId: string): void {
    const cleanups = this.cardCleanups.get(columnId);
    if (!cleanups) return;
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
  }

  private isColumnFull(column: KanbanColumn): boolean {
    return column.wipLimit !== undefined && column.cards.length >= column.wipLimit;
  }

  private cardMatchesSearch(card: KanbanCard): boolean {
    if (!this.searchQuery) return true;
    const haystack = [card.title, card.description ?? '', ...(card.tags ?? [])]
      .join(' ')
      .toLocaleLowerCase(i18next.language ?? 'tr');
    return haystack.includes(this.searchQuery);
  }

  private buildSearchBar(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.className = 'vol-kanban__search-bar';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'vol-kanban__search-input';
    input.placeholder = i18next.t('core:kanban.search');
    const onInput = (): void => {
      this.searchQuery = input.value.trim().toLocaleLowerCase(i18next.language ?? 'tr');
      for (const column of this.columns) {
        this.rerenderColumn(column.id);
      }
    };
    input.addEventListener('input', onInput);
    this.cleanups.push(() => input.removeEventListener('input', onInput));
    bar.appendChild(input);

    return bar;
  }

  private buildColumn(column: KanbanColumn): HTMLDivElement {
    const columnEl = document.createElement('div');
    columnEl.className = 'vol-kanban__column';
    columnEl.dataset.columnId = column.id;

    const header = document.createElement('div');
    header.className = 'vol-kanban__column-header';

    const title = document.createElement('span');
    title.className = 'vol-kanban__column-title';
    title.textContent = column.title;
    header.appendChild(title);

    const count = document.createElement('span');
    count.className = 'vol-kanban__column-count';
    header.appendChild(count);

    columnEl.appendChild(header);

    const body = document.createElement('div');
    body.className = 'vol-kanban__column-body';
    columnEl.appendChild(body);

    this.columnElements.set(column.id, columnEl);
    this.columnBodies.set(column.id, body);

    if (this.virtualizeCards) {
      body.classList.add('vol-kanban__column-body--virtualized');
      body.style.height = `${this.virtualizeCards.bodyHeight}px`;

      const spacer = document.createElement('div');
      spacer.className = 'vol-kanban__column-spacer';
      body.appendChild(spacer);
      this.columnSpacers.set(column.id, spacer);

      const viewport = document.createElement('div');
      viewport.className = 'vol-kanban__column-viewport';
      body.appendChild(viewport);
      this.columnViewports.set(column.id, viewport);

      const onScroll = (): void => this.scheduleColumnWindowRender(column.id);
      body.addEventListener('scroll', onScroll);
      this.cleanups.push(() => body.removeEventListener('scroll', onScroll));
    } else {
      this.columnViewports.set(column.id, body);
    }

    this.rerenderColumn(column.id);

    return columnEl;
  }

  private initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase(i18next.language ?? 'tr');
    return (parts[0][0] + parts[parts.length - 1][0]).toLocaleUpperCase(i18next.language ?? 'tr');
  }

  private buildCard(card: KanbanCard, columnId: string): HTMLDivElement {
    const cardEl = document.createElement('div');
    cardEl.className = 'vol-kanban__card';
    cardEl.dataset.cardId = card.id;
    cardEl.style.touchAction = 'none';
    // Kart klavye ile odaklanabilir ve taşınabilir olmalı; role="button" ekran okuyucuya "etkinleştirilebilir" olduğunu bildirir.
    cardEl.tabIndex = 0;
    cardEl.setAttribute('role', 'button');
    cardEl.setAttribute(
      'aria-keyshortcuts',
      'Enter Space Escape ArrowUp ArrowDown ArrowLeft ArrowRight',
    );
    cardEl.setAttribute('aria-label', this.cardAriaLabel(card, columnId));
    if (this.keyboardMove?.cardId === card.id) {
      cardEl.classList.add('vol-kanban__card--keyboard-grabbed');
    }

    if (card.priority) {
      const badge = document.createElement('span');
      badge.className = `vol-kanban__card-priority vol-kanban__card-priority--${card.priority}`;
      badge.setAttribute('aria-label', i18next.t(PRIORITY_I18N_KEYS[card.priority]));
      cardEl.appendChild(badge);
    }

    const headerRow = document.createElement('div');
    headerRow.className = 'vol-kanban__card-header';

    const title = document.createElement('div');
    title.className = 'vol-kanban__card-title';
    title.textContent = card.title;
    headerRow.appendChild(title);

    if (card.assignee) {
      const avatar = document.createElement('span');
      avatar.className = 'vol-kanban__card-avatar';
      avatar.textContent = this.initials(card.assignee);
      avatar.setAttribute('aria-label', card.assignee);
      avatar.title = card.assignee;
      headerRow.appendChild(avatar);
    }

    cardEl.appendChild(headerRow);

    if (card.description) {
      const description = document.createElement('div');
      description.className = 'vol-kanban__card-description';
      description.textContent = card.description;
      cardEl.appendChild(description);
    }

    if (card.tags?.length) {
      const tagRow = document.createElement('div');
      tagRow.className = 'vol-kanban__card-tags';
      for (const tag of card.tags) {
        const chip = document.createElement('span');
        chip.className = 'vol-kanban__card-tag';
        chip.textContent = tag;
        tagRow.appendChild(chip);
      }
      cardEl.appendChild(tagRow);
    }

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== undefined && event.button !== 0) return;
      this.beginDrag(event, card, columnId, cardEl);
    };
    cardEl.addEventListener('pointerdown', onPointerDown);
    this.trackCardCleanup(columnId, () => cardEl.removeEventListener('pointerdown', onPointerDown));

    const onKeydown = (event: KeyboardEvent): void => this.handleCardKeydown(event, card.id);
    cardEl.addEventListener('keydown', onKeydown);
    this.trackCardCleanup(columnId, () => cardEl.removeEventListener('keydown', onKeydown));

    return cardEl;
  }

  /** Sürüklemeyi başlatır: imleci takip eden bir "ghost" kopya document.body'ye eklenir. Eşik (UI_THRESHOLD.DRAG_START) aşılana kadar hareket "tıklama" sayılır, böylece kart hem tıklanabilir hem sürüklenebilir kalır. */
  private beginDrag(
    event: PointerEvent,
    card: KanbanCard,
    columnId: string,
    cardEl: HTMLDivElement,
  ): void {
    const rect = cardEl.getBoundingClientRect();
    const ghostEl = cardEl.cloneNode(true) as HTMLDivElement;
    ghostEl.className = 'vol-kanban__card vol-kanban__card--ghost';
    ghostEl.style.width = `${rect.width}px`;

    this.drag = {
      cardId: card.id,
      fromColumnId: columnId,
      pointerId: event.pointerId,
      cardEl,
      ghostEl,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };

    document.addEventListener('pointermove', this.boundPointerMove);
    document.addEventListener('pointerup', this.boundPointerUp);
    document.addEventListener('pointercancel', this.boundPointerUp);
  }

  private handlePointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.moved) {
      if (Math.hypot(dx, dy) < UI_THRESHOLD.DRAG_START) return;
      // Eşik aşıldı: gerçek kart yarı saydam bırakılır, ghost imleci takip etmeye başlar.
      drag.moved = true;
      drag.cardEl.classList.add('vol-kanban__card--dragging');
      drag.ghostEl.classList.add('vol-kanban__card--ghost-active');
      this.dragContainer.appendChild(drag.ghostEl);
    }

    event.preventDefault();
    drag.ghostEl.style.left = `${event.clientX - drag.offsetX}px`;
    drag.ghostEl.style.top = `${event.clientY - drag.offsetY}px`;

    this.updateDropTarget(event.clientX, event.clientY, drag.fromColumnId);
  }

  private handlePointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    document.removeEventListener('pointermove', this.boundPointerMove);
    document.removeEventListener('pointerup', this.boundPointerUp);
    document.removeEventListener('pointercancel', this.boundPointerUp);

    if (!drag.moved) {
      // Eşik aşılmadı — tıklamaydı, sürükleme değil.
      this.drag = null;
      const card = this.findCard(drag.cardId, drag.fromColumnId);
      if (card) this.onCardClickHandler?.(card, drag.fromColumnId);
      return;
    }

    drag.cardEl.classList.remove('vol-kanban__card--dragging');
    drag.ghostEl.remove();
    this.clearDropTargetVisuals();

    const target = this.resolveDropTarget(event.clientX, event.clientY);
    this.drag = null;

    if (target) {
      this.commitMove(drag.cardId, drag.fromColumnId, target.columnId, target.index);
    }
  }

  private findCard(cardId: string, columnId: string): KanbanCard | undefined {
    return this.columns.find((c) => c.id === columnId)?.cards.find((c) => c.id === cardId);
  }

  /** Hedef sütunu görsel olarak vurgular/reddeder (WIP dolu sütun kırmızı) ve dropIndicator çizgisini yerleştirir. */
  private updateDropTarget(clientX: number, clientY: number, fromColumnId: string): void {
    this.clearDropTargetVisuals();
    const target = this.resolveDropTarget(clientX, clientY);
    if (!target) return;

    const columnEl = this.columnElements.get(target.columnId);
    const column = this.columns.find((c) => c.id === target.columnId);
    if (!columnEl || !column) return;

    const full = target.columnId !== fromColumnId && this.isColumnFull(column);
    columnEl.classList.toggle('vol-kanban__column--drag-over', !full);
    columnEl.classList.toggle('vol-kanban__column--drag-rejected', full);

    if (full) return;
    this.placeDropIndicator(target.columnId, target.visibleIndex);
  }

  /** dropIndicator'ı hedef sütunda `visibleIndex`'teki karttan hemen önceye yerleştirir. */
  private placeDropIndicator(columnId: string, visibleIndex: number): void {
    const viewport = this.columnViewports.get(columnId);
    if (!viewport) return;

    const cardEls = Array.from(
      viewport.querySelectorAll<HTMLDivElement>(':scope > .vol-kanban__card'),
    );
    if (this.virtualizeCards) {
      // Viewport'taki ilk kart visibleIndex=0 değil, kaydırma konumuna göre kaymış bir "start" index'idir.
      const { cardHeight } = this.virtualizeCards;
      const body = this.columnBodies.get(columnId);
      const start = body
        ? Math.max(
            0,
            Math.floor(body.scrollTop / cardHeight) - (this.virtualizeCards.overscan ?? 3),
          )
        : 0;
      const localIndex = visibleIndex - start;
      if (localIndex <= 0) {
        viewport.insertBefore(this.dropIndicator, viewport.firstChild);
      } else if (localIndex >= cardEls.length) {
        viewport.appendChild(this.dropIndicator);
      } else {
        viewport.insertBefore(this.dropIndicator, cardEls[localIndex]);
      }
      return;
    }

    if (visibleIndex >= cardEls.length) {
      viewport.appendChild(this.dropIndicator);
    } else {
      viewport.insertBefore(this.dropIndicator, cardEls[visibleIndex]);
    }
  }

  private clearDropTargetVisuals(): void {
    for (const columnEl of this.columnElements.values()) {
      columnEl.classList.remove(
        'vol-kanban__column--drag-over',
        'vol-kanban__column--drag-rejected',
      );
    }
    this.dropIndicator.remove();
  }

  /** İmlecin altındaki sütun ve bırakma index'ini bulur. `visibleIndex` DOM sırası, `index` model sırasıdır (arama etkinken ayrışabilir). */
  private resolveDropTarget(
    clientX: number,
    clientY: number,
  ): { columnId: string; index: number; visibleIndex: number } | null {
    const elementUnderPoint = document.elementFromPoint(clientX, clientY);
    const columnEl = elementUnderPoint?.closest<HTMLDivElement>('.vol-kanban__column');
    const columnId = columnEl?.dataset.columnId;
    if (!columnEl || !columnId) return null;

    const body = this.columnBodies.get(columnId);
    const column = this.columns.find((c) => c.id === columnId);
    if (!body || !column) return null;

    const visibleIndex = this.indexFromDropPosition(body, clientY, column);
    return { columnId, index: this.modelIndexFromVisibleIndex(column, visibleIndex), visibleIndex };
  }

  private commitMove(
    cardId: string,
    fromColumnId: string,
    toColumnId: string,
    toIndex: number,
  ): void {
    const located = this.locateCard(cardId);
    if (!located) return;

    // `toIndex`, sürüklenen kart hâlâ dizide dururken hesaplandı. Aynı sütun
    // içinde kartı eski yerinden çıkarmak sonraki index'leri bir kaydırır,
    // bu yüzden hedef eski konumdan sonraysa index bir azaltılır.
    const sameColumn = toColumnId === fromColumnId;
    const targetIndex = sameColumn && toIndex > located.index ? toIndex - 1 : toIndex;

    this.applyMove(cardId, fromColumnId, toColumnId, targetIndex);
  }

  /** Modeli günceller, etkilenen sütunları yeniden çizer ve `onCardMove`'u bildirir. `targetIndex` karttan sonraki hedef index'tir. Taşıma gerçekleştiyse true döner. */
  private applyMove(
    cardId: string,
    fromColumnId: string,
    toColumnId: string,
    targetIndex: number,
  ): boolean {
    const fromColumn = this.columns.find((c) => c.id === fromColumnId);
    const toColumn = this.columns.find((c) => c.id === toColumnId);
    if (!fromColumn || !toColumn) return false;

    // Aynı sütun içinde yeniden sıralama WIP limitini artırmaz; yalnızca farklı sütuna taşınırken limit kontrol edilir.
    if (toColumnId !== fromColumnId && this.isColumnFull(toColumn)) {
      this.onWipLimitExceededHandler?.(toColumnId, cardId);
      return false;
    }

    const cardIndex = fromColumn.cards.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return false;

    const [card] = fromColumn.cards.splice(cardIndex, 1);

    const clampedIndex = Math.max(0, Math.min(targetIndex, toColumn.cards.length));
    toColumn.cards.splice(clampedIndex, 0, card);

    this.rerenderColumn(fromColumnId);
    if (toColumnId !== fromColumnId) this.rerenderColumn(toColumnId);
    this.flashCard(cardId);

    this.onCardMoveHandler?.(cardId, fromColumnId, toColumnId, clampedIndex);
    return true;
  }

  /** Taşınan kartın yeni konumuna kısa görsel vurgu koyar (element rerenderColumn'da yeniden oluşturulduğu için yeniden bulunur). */
  private flashCard(cardId: string): void {
    if (this.highlightTimeout !== null) {
      window.clearTimeout(this.highlightTimeout);
      this.highlightTimeout = null;
    }
    const cardEl = this.element.querySelector<HTMLDivElement>(
      `.vol-kanban__card[data-card-id="${cardId}"]`,
    );
    if (!cardEl) return;

    cardEl.classList.add('vol-kanban__card--just-moved');
    this.highlightTimeout = window.setTimeout(() => {
      cardEl.classList.remove('vol-kanban__card--just-moved');
      this.highlightTimeout = null;
    }, 1600);
  }

  private locateCard(cardId: string): { column: KanbanColumn; index: number } | null {
    for (const column of this.columns) {
      const index = column.cards.findIndex((c) => c.id === cardId);
      if (index !== -1) return { column, index };
    }
    return null;
  }

  private cardAriaLabel(card: KanbanCard, columnId: string): string {
    const column = this.columns.find((c) => c.id === columnId);
    const index = column ? column.cards.findIndex((c) => c.id === card.id) + 1 : 0;
    const total = column?.cards.length ?? 0;
    const position = column ? `, ${column.title}, ${index}/${total}` : '';
    const hint = this.keyboardMove?.cardId === card.id ? ', ' + i18next.t('core:kanban.moving') : '';
    return `${card.title}${position}${hint}`;
  }

  private announce(message: string): void {
    this.announcer.textContent = message;
  }

  /** Klavye ile taşıma: Enter/Space kartı "kavrar", ok tuşları taşır, ikinci Enter/Space bırakır, Escape geri koyar. */
  private handleCardKeydown(event: KeyboardEvent, cardId: string): void {
    const isActivate = event.key === 'Enter' || event.key === ' ';

    if (!this.keyboardMove) {
      if (!isActivate) return;
      const located = this.locateCard(cardId);
      if (!located) return;
      event.preventDefault();
      this.keyboardMove = { cardId, originColumnId: located.column.id, originIndex: located.index };
      this.rerenderColumn(located.column.id);
      this.focusCard(cardId);
      this.announce(
        i18next.t('core:kanban.grabbed', { card: this.cardTitle(cardId) }),
      );
      return;
    }

    if (this.keyboardMove.cardId !== cardId) return;

    if (isActivate) {
      event.preventDefault();
      this.endKeyboardMove();
      this.announce(i18next.t('core:kanban.released', { card: this.cardTitle(cardId) }));
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      const { originColumnId, originIndex } = this.keyboardMove;
      const located = this.locateCard(cardId);
      if (located && (located.column.id !== originColumnId || located.index !== originIndex)) {
        this.applyMove(cardId, located.column.id, originColumnId, originIndex);
      }
      this.endKeyboardMove();
      this.announce(i18next.t('core:kanban.cancelled', { card: this.cardTitle(cardId) }));
      return;
    }

    const located = this.locateCard(cardId);
    if (!located) return;

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const delta = event.key === 'ArrowUp' ? -1 : 1;
      const nextIndex = located.index + delta;
      if (nextIndex < 0 || nextIndex >= located.column.cards.length) return;
      event.preventDefault();
      this.applyMove(cardId, located.column.id, located.column.id, nextIndex);
      this.focusCard(cardId);
      this.announce(this.moveAnnouncement(cardId));
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const columnIndex = this.columns.indexOf(located.column);
      const nextColumn = this.columns[columnIndex + (event.key === 'ArrowLeft' ? -1 : 1)];
      if (!nextColumn) return;
      event.preventDefault();
      // Sütun değişiminde kart, geldiği sıradaki konuma en yakın yere yerleştirilir.
      const moved = this.applyMove(cardId, located.column.id, nextColumn.id, located.index);
      if (!moved) {
        this.announce(i18next.t('core:kanban.columnFull', { column: nextColumn.title }));
        return;
      }
      this.focusCard(cardId);
      this.announce(this.moveAnnouncement(cardId));
    }
  }

  private moveAnnouncement(cardId: string): string {
    const located = this.locateCard(cardId);
    if (!located) return '';
    return i18next.t('core:kanban.moved', {
      card: this.cardTitle(cardId),
      column: located.column.title,
      index: located.index + 1,
      total: located.column.cards.length,
    });
  }

  private cardTitle(cardId: string): string {
    return this.locateCard(cardId)?.column.cards.find((c) => c.id === cardId)?.title ?? '';
  }

  private endKeyboardMove(): void {
    const columnId = this.keyboardMove
      ? this.locateCard(this.keyboardMove.cardId)?.column.id
      : undefined;
    const cardId = this.keyboardMove?.cardId;
    this.keyboardMove = null;
    if (columnId) this.rerenderColumn(columnId);
    if (cardId) this.focusCard(cardId);
  }

  /** rerenderColumn kart elementlerini baştan oluşturduğu için taşımadan sonra odak kaybolur; yeni element bulunup odak geri verilir. */
  private focusCard(cardId: string): void {
    const cardEl = this.element.querySelector<HTMLDivElement>(
      `.vol-kanban__card[data-card-id="${cardId}"]`,
    );
    cardEl?.focus();
  }

  /** Bırakılan y konumuna göre görünür kartlar arasındaki hedef sırayı bulur. Pencereleme açıkken DOM'da yalnızca bir dilim bulunduğu için hesap sabit `cardHeight` ve kaydırma konumundan yapılır. */
  private indexFromDropPosition(
    body: HTMLDivElement,
    clientY: number,
    column: KanbanColumn,
  ): number {
    const visibleCount = this.visibleCards(column).length;

    if (this.virtualizeCards) {
      const { cardHeight } = this.virtualizeCards;
      const offsetY = clientY - body.getBoundingClientRect().top + body.scrollTop;
      const index = Math.round(offsetY / cardHeight);
      return Math.max(0, Math.min(index, visibleCount));
    }

    const cardEls = Array.from(
      body.querySelectorAll<HTMLDivElement>('.vol-kanban__card:not(.vol-kanban__card--ghost)'),
    );
    for (let i = 0; i < cardEls.length; i++) {
      const rect = cardEls[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return cardEls.length;
  }

  private visibleCards(column: KanbanColumn): KanbanCard[] {
    if (!this.searchQuery) return column.cards;
    return column.cards.filter((card) => this.cardMatchesSearch(card));
  }

  /** Görünür kartlar arasındaki sırayı gerçek model index'ine çevirir — arama filtresi etkinken ikisi ayrışır. */
  private modelIndexFromVisibleIndex(column: KanbanColumn, visibleIndex: number): number {
    if (!this.searchQuery) return visibleIndex;
    const visible = this.visibleCards(column);
    if (visibleIndex >= visible.length) return column.cards.length;
    return column.cards.indexOf(visible[visibleIndex]);
  }

  private rerenderColumn(columnId: string): void {
    const column = this.columns.find((c) => c.id === columnId);
    const viewport = this.columnViewports.get(columnId);
    if (!column || !viewport) return;

    this.clearCardCleanups(columnId);
    viewport.replaceChildren();

    const visible = this.visibleCards(column);

    if (!this.virtualizeCards) {
      for (const card of visible) {
        viewport.appendChild(this.buildCard(card, columnId));
      }
      this.updateColumnMeta(columnId);
      return;
    }

    const body = this.columnBodies.get(columnId);
    const spacer = this.columnSpacers.get(columnId);
    if (!body || !spacer) return;

    const { cardHeight, bodyHeight } = this.virtualizeCards;
    const overscan = this.virtualizeCards.overscan ?? 3;
    spacer.style.height = `${visible.length * cardHeight}px`;

    const viewportHeight = body.clientHeight || bodyHeight;
    const first = Math.floor(body.scrollTop / cardHeight);
    const last = Math.ceil((body.scrollTop + viewportHeight) / cardHeight);
    const start = Math.max(0, first - overscan);
    const end = Math.min(visible.length, last + overscan);

    viewport.style.transform = `translateY(${start * cardHeight}px)`;
    for (let i = start; i < end; i++) {
      const cardEl = this.buildCard(visible[i], columnId);
      cardEl.style.height = `${cardHeight}px`;
      viewport.appendChild(cardEl);
    }

    this.updateColumnMeta(columnId);
  }

  private scheduleColumnWindowRender(columnId: string): void {
    if (this.columnScrollRaf.has(columnId)) return;
    const rafId = requestAnimationFrame(() => {
      this.columnScrollRaf.delete(columnId);
      this.rerenderColumn(columnId);
    });
    this.columnScrollRaf.set(columnId, rafId);
  }

  private updateColumnMeta(columnId: string): void {
    const column = this.columns.find((c) => c.id === columnId);
    const columnEl = this.columnElements.get(columnId);
    if (!column || !columnEl) return;

    const count = columnEl.querySelector('.vol-kanban__column-count');
    if (count) {
      count.textContent =
        column.wipLimit !== undefined
          ? `${column.cards.length} / ${column.wipLimit}`
          : String(column.cards.length);
    }
    columnEl.classList.toggle('vol-kanban__column--full', this.isColumnFull(column));
  }
}
