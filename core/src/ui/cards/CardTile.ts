/** Kart nadirlik kademesi — yalnızca görsel farklılaşma sağlar. */
export type CardRarity = 'rare' | 'epic' | 'legendary';

/** Bir kartın gösterilecek içeriği. Metin dışı varlık (ikon/görsel) taşımaz. */
export interface CardTileData {
  /** Seçim geri bildiriminde döndürülen kimlik. */
  id: string;
  title: string;
  description: string;
  rarity: CardRarity;
  /** Nadirlik rozeti metni (örn. "NADİR"). Verilmezse rozet çizilmez. */
  rarityLabel?: string;
  /** Tip rozeti (örn. "PASİF", "YETENEK") — kartın ne yaptığı bir bakışta okunur. */
  typeLabel?: string;
  /** Fiyat satırı (örn. "18 Flux"). Verilmezse fiyat çizilmez — level-up ücretsizdir. */
  priceLabel?: string;
  /** Alt durum metni (örn. "ALINDI", "YETERSİZ FLUX"). */
  statusLabel?: string;
}

export interface CardTileOptions {
  data: CardTileData;
  /**
   * Alt buton metni (örn. "SEÇ", "SATIN AL", "SAT +5").
   * Verilmezse kart salt gösterimdir — yanlışlıkla tıklanıp harcanamaz.
   */
  actionLabel?: string;
  /** Buton devre dışı mı? */
  disabled?: boolean;
  onAction?: (id: string) => void;
  /**
   * İkinci bir eylem (örn. "TAK"). Sürükle-bırak keşfedilebilir olmadığı için
   * aynı işi yapan açık bir buton da bulunmalıdır.
   */
  secondaryActionLabel?: string;
  onSecondaryAction?: (id: string) => void;
  /**
   * Verilirse kart sürüklenebilir olur ve bırakma hedefine bu değer taşınır
   * (yetenek kartını slota sürüklemek için).
   */
  dragData?: string;
  /** Dar liste görünümü — açıklama yerine tek satırlık etki metni. */
  compact?: boolean;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

/** Sürüklenen kart verisinin taşındığı MIME tipi. */
export const CARD_DRAG_MIME = 'application/x-vol-card';

/**
 * Tek bir kartın görsel karşılığı — başlık, açıklama, nadirlik ve isteğe bağlı
 * fiyat/aksiyon.
 *
 * Eylem HER ZAMAN açık bir butondadır; kartın gövdesine tıklamak hiçbir şey
 * satın almaz/satmaz. Kart gövdesinin kendisi tıklanabilir olsaydı envanterde
 * bir karta bakmak isterken onu satmak işten bile olmazdı.
 */
export class CardTile {
  readonly element: HTMLDivElement;
  private readonly statusElement: HTMLSpanElement;
  private readonly actionButton: HTMLButtonElement | null;
  private readonly secondaryButton: HTMLButtonElement | null;
  private readonly onAction?: (id: string) => void;
  private readonly onSecondaryAction?: (id: string) => void;
  private readonly cardId: string;

  constructor(options: CardTileOptions) {
    const { data, disabled = false, onAction, className, compact = false } = options;
    this.cardId = data.id;
    this.onAction = onAction;

    this.element = document.createElement('div');
    this.element.className = [
      `vol-card vol-card--${data.rarity}`,
      compact ? 'vol-card--compact' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const badges = document.createElement('div');
    badges.className = 'vol-card__badges';
    if (data.rarityLabel) {
      const rarity = document.createElement('span');
      rarity.className = 'vol-card__rarity';
      rarity.textContent = data.rarityLabel;
      badges.appendChild(rarity);
    }
    if (data.typeLabel) {
      const type = document.createElement('span');
      type.className = 'vol-card__type';
      type.textContent = data.typeLabel;
      badges.appendChild(type);
    }
    if (badges.childElementCount > 0) {
      this.element.appendChild(badges);
    }

    const title = document.createElement('span');
    title.className = 'vol-card__title';
    title.textContent = data.title;
    this.element.appendChild(title);

    const description = document.createElement('span');
    description.className = 'vol-card__description';
    description.textContent = data.description;
    this.element.appendChild(description);

    const footer = document.createElement('div');
    footer.className = 'vol-card__footer';

    if (data.priceLabel) {
      const price = document.createElement('span');
      price.className = 'vol-card__price';
      price.textContent = data.priceLabel;
      footer.appendChild(price);
    }

    this.statusElement = document.createElement('span');
    this.statusElement.className = 'vol-card__status';
    this.statusElement.textContent = data.statusLabel ?? '';
    footer.appendChild(this.statusElement);

    if (options.secondaryActionLabel !== undefined) {
      this.secondaryButton = document.createElement('button');
      this.secondaryButton.type = 'button';
      this.secondaryButton.className = 'vol-card__action vol-card__action--secondary';
      this.secondaryButton.textContent = options.secondaryActionLabel;
      this.onSecondaryAction = options.onSecondaryAction;
      this.secondaryButton.addEventListener('click', this.handleSecondaryAction);
      footer.appendChild(this.secondaryButton);
    } else {
      this.secondaryButton = null;
    }

    if (options.actionLabel !== undefined) {
      this.actionButton = document.createElement('button');
      this.actionButton.type = 'button';
      this.actionButton.className = 'vol-card__action';
      this.actionButton.textContent = options.actionLabel;
      this.actionButton.disabled = disabled;
      this.actionButton.addEventListener('click', this.handleAction);
      footer.appendChild(this.actionButton);
    } else {
      this.actionButton = null;
    }

    this.element.appendChild(footer);

    if (options.dragData !== undefined) {
      this.makeDraggable(options.dragData);
    }
  }

  /** Aksiyon butonunu kilitler/açar; isteğe bağlı olarak durum metnini günceller. */
  setDisabled(disabled: boolean, statusLabel?: string): void {
    if (this.actionButton) {
      this.actionButton.disabled = disabled;
    }
    this.element.classList.toggle('vol-card--disabled', disabled);
    if (statusLabel !== undefined) {
      this.statusElement.textContent = statusLabel;
    }
  }

  destroy(): void {
    this.actionButton?.removeEventListener('click', this.handleAction);
    this.secondaryButton?.removeEventListener('click', this.handleSecondaryAction);
    this.element.remove();
  }

  private makeDraggable(dragData: string): void {
    this.element.draggable = true;
    this.element.classList.add('vol-card--draggable');
    this.element.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData(CARD_DRAG_MIME, dragData);
      // Bazı tarayıcılar yalnızca `text/plain` taşır; ikisini de yaz.
      event.dataTransfer?.setData('text/plain', dragData);
      this.element.classList.add('vol-card--dragging');
    });
    this.element.addEventListener('dragend', () => {
      this.element.classList.remove('vol-card--dragging');
    });
  }

  private readonly handleAction = (): void => {
    if (this.actionButton?.disabled) return;
    this.onAction?.(this.cardId);
  };

  private readonly handleSecondaryAction = (): void => {
    if (this.secondaryButton?.disabled) return;
    this.onSecondaryAction?.(this.cardId);
  };
}
