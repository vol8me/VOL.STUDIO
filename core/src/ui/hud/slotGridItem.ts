import { i18next } from '../../i18n/I18n';

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

export interface Geometry {
  size: number;
  gap: number;
  columns: number;
  slotCount: number;
}

export function normalizeSpan(span: SlotSpan | undefined): { cols: number; rows: number } {
  return { cols: Math.max(1, span?.cols ?? 1), rows: Math.max(1, span?.rows ?? 1) };
}

/**
 * Her item için tek DOM node. Node taşındığında fiziksel element aynı kalır,
 * yalnızca pozisyon/görsel güncellenir. Büyük item'lar için kök hücreden
 * itibaren `left/top/width/height` ile mutlak konumlanır.
 */
export class ItemView {
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
    // Öğeler etkinleştirilebilir/taşınabilir denetimdir (Enter/A etkinleştirir, Space tutar): düğme rolü.
    this.element.setAttribute('role', 'button');
    // Klavye/kol erişimi: dolaşma (roving tabindex) SlotGrid tarafından ayarlanır.
    this.element.tabIndex = -1;
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
    // Etiket sabit hücrede üç nokta ile kısalır; tam ad (ve adet) yine okunabilir kalır.
    this.element.title = this.ariaLabel();
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
