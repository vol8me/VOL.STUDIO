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
 * `.vol-card-picker--leaving` CSS süresiyle (`--vol-transition-medium`,
 * 240ms) eşleşir. `hide()` `element.hidden = true`'yu bu kadar ERTELER —
 * aksi halde `display: none` anında uygulanır ve panel "birden kapanıyor"
 * gibi görünürdü (opacity/transform geçişine hiç zaman kalmazdı).
 */
export const HIDE_ANIMATION_MS = 240;

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
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;

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

  /**
   * Mantıksal görünürlük — `hide()` çağrıldığı ANDA `false` olur (çıkış
   * animasyonunun bitmesini BEKLEMEZ). Çağıranların "şu an açık mı" sorusu
   * her zaman senkron ve öngörülebilir kalsın diye — yalnızca DOM'un
   * `hidden` niteliği (görsel geçiş için) gecikmeli uygulanır.
   */
  isVisible(): boolean {
    return this.visible;
  }

  show(): void {
    this.cancelPendingHide();
    this.element.classList.remove('vol-card-picker--leaving');
    this.visible = true;
    this.element.hidden = false;
    this.startTileEnterAnimations();
    // İlk kartın aksiyon butonu odaklanır: seçim klavyeyle de yapılabilsin.
    this.element.querySelector<HTMLButtonElement>('.vol-card__action')?.focus();
  }

  protected startTileEnterAnimations(): void {
    if (this.tiles.length === 0) return;
    // Bir sonraki karede layout gerçekleştikten sonra class ekle ki
    // `hidden` katmandan yeni açılan panellerde animasyon 0. kareden başlasın.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const tile of this.tiles) tile.startEnterAnimation();
      });
    });
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.element.classList.add('vol-card-picker--leaving');
    this.hideTimeout = setTimeout(() => {
      this.hideTimeout = null;
      this.element.hidden = true;
      this.element.classList.remove('vol-card-picker--leaving');
    }, HIDE_ANIMATION_MS);
  }

  /**
   * `hide()`'ın ANİMASYONSUZ hali — `hidden` hemen uygulanır. Aynı paylaşılan
   * katmanda (ör. `games/vol-hell`'in tek `.vol-card-layer`'ı) BAŞKA bir
   * CardPicker hemen `show()` edilecekse bunu kullan: gecikmeli `hide()`
   * iki panelin flex konteynerde bir an üst üste binmesine/kaymasına yol
   * açar — katman zaten açık kalıyorsa (yalnızca İÇERİĞİ değişiyorsa) ayrı
   * bir çıkış animasyonuna gerek yoktur, yeni panelin giriş animasyonu
   * (`vol-card-picker-in`) geçişi zaten taşır.
   */
  hideImmediately(): void {
    this.cancelPendingHide();
    this.visible = false;
    this.element.hidden = true;
    this.element.classList.remove('vol-card-picker--leaving');
  }

  destroy(): void {
    this.cancelPendingHide();
    this.clearTiles();
    this.element.remove();
  }

  private cancelPendingHide(): void {
    if (this.hideTimeout === null) return;
    clearTimeout(this.hideTimeout);
    this.hideTimeout = null;
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
