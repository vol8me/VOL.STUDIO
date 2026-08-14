import { CardTile, type CardTileData, type CardTileOptions } from './CardTile';

export interface CardPickerOptions {
  /** Panel başlığı. */
  title?: string;
  /** Başlığın altındaki kısa yönlendirme. */
  hint?: string;
  /** Ek CSS class'ı. */
  className?: string;
}

/**
 * Kart seçim panellerinin ortak tabanı — başlık, ipucu ve kart ızgarası.
 *
 * Kasıtlı olarak `Modal`'a BAĞLI DEĞİLDİR: yalnızca kendi panelini çizer.
 * Karartma/odak tuzağı isteyen çağıran, bu paneli kendi Modal'ının içine
 * yerleştirebilir; istemeyen doğrudan mount eder.
 */
export abstract class CardPicker {
  readonly element: HTMLDivElement;
  protected readonly grid: HTMLDivElement;
  protected readonly footer: HTMLDivElement;
  private readonly titleElement: HTMLDivElement;
  private readonly hintElement: HTMLDivElement;
  private readonly tiles: CardTile[] = [];
  private visible = false;

  constructor(options: CardPickerOptions = {}) {
    this.element = document.createElement('div');
    this.element.className = ['vol-card-picker', options.className].filter(Boolean).join(' ');
    this.element.setAttribute('role', 'dialog');
    this.element.hidden = true;

    const header = document.createElement('div');
    header.className = 'vol-card-picker__header';

    this.titleElement = document.createElement('div');
    this.titleElement.className = 'vol-card-picker__title';
    this.titleElement.textContent = options.title ?? '';
    header.appendChild(this.titleElement);

    this.hintElement = document.createElement('div');
    this.hintElement.className = 'vol-card-picker__hint';
    this.hintElement.textContent = options.hint ?? '';
    header.appendChild(this.hintElement);

    this.element.appendChild(header);

    this.grid = document.createElement('div');
    this.grid.className = 'vol-card-picker__grid';
    this.element.appendChild(this.grid);

    this.footer = document.createElement('div');
    this.footer.className = 'vol-card-picker__footer';
    this.element.appendChild(this.footer);
  }

  isVisible(): boolean {
    return this.visible;
  }

  show(): void {
    this.visible = true;
    this.element.hidden = false;
    // İlk kartın aksiyon butonu odaklanır: seçim klavyeyle de yapılabilsin.
    this.element.querySelector<HTMLButtonElement>('.vol-card__action')?.focus();
  }

  hide(): void {
    this.visible = false;
    this.element.hidden = true;
  }

  destroy(): void {
    this.clearTiles();
    this.element.remove();
  }

  protected setTitle(title: string): void {
    this.titleElement.textContent = title;
  }

  protected setHint(hint: string): void {
    this.hintElement.textContent = hint;
  }

  /** Izgaradaki kartları temizler (yeni teklif gösterilmeden önce). */
  protected clearTiles(): void {
    for (const tile of this.tiles) {
      tile.destroy();
    }
    this.tiles.length = 0;
  }

  /** Izgaraya kart ekler ve referansını temizlik için saklar. */
  protected addTile(data: CardTileData, options: Omit<CardTileOptions, 'data'> = {}): CardTile {
    const tile = new CardTile({ data, ...options });
    this.tiles.push(tile);
    this.grid.appendChild(tile.element);
    return tile;
  }
}
