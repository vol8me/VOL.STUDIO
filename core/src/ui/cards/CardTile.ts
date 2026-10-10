import { emitUiIntent } from '../feedback/uiIntent';

/** Kart nadirlik kademesi — renk ve baklava sayısıyla görsel farklılaşma sağlar. */
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
 * CSS `vol-card-in` süresi + en uzun stagger gecikmesi.
 * `vol-card-in` 360 ms'dir; level-up 4. kartı 3 × `--vol-motion-preset-card-stagger`
 * (40 ms) = 120 ms gecikmeli başlar.
 * `animationend` `prefers-reduced-motion` altında ateşlenmeyebileceği için
 * zamanlayıcı yedeği de bu değerle çalışır.
 */
export const CARD_ENTER_ANIMATION_MS = 480;

/**
 * Nadirliğin renk dışı işareti: kademe sayısı kadar baklava çizgisi (rare 1, epic 2, legendary 3).
 * Renk tek taşıyıcı olmaz (WCAG 1.4.1); `rarityLabel` verilmese de kart kademesini gösterir.
 */
const RARITY_PIPS: Readonly<Record<CardRarity, number>> = { rare: 1, epic: 2, legendary: 3 };

/** `markPicked` vurgusunun süresi: seçicinin çıkış animasyonuyla (240 ms) birlikte görünür kalır. */
const PICKED_MS = 360;

let cardSerial = 0;

/** Tek baklava: metin karakteri değil çizgi (SVG), `currentColor` ile nadirlik rengini alır. */
function createPip(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 8 8');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M4 0 8 4 4 8 0 4Z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

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
  private readonly titleElement: HTMLSpanElement;
  private readonly descriptionElement: HTMLSpanElement;
  private rarityElement: HTMLSpanElement | null;
  private typeElement: HTMLSpanElement | null;
  private priceElement: HTMLSpanElement | null;
  private readonly statusElement: HTMLSpanElement;
  private readonly pipsElement: HTMLSpanElement;
  private readonly uid = ++cardSerial;
  private pickedTimeout: number | null = null;
  private readonly footer: HTMLDivElement;
  private readonly badges: HTMLDivElement;
  private actionButton: HTMLButtonElement | null;
  private secondaryButton: HTMLButtonElement | null;
  private readonly cardId: string;
  private readonly onAction?: (id: string) => void;
  private onSecondaryAction?: (id: string) => void;
  private readonly compact: boolean;
  private readonly baseClassName: string | undefined;
  private currentRarity: CardRarity;
  private currentDragData: string | undefined;
  private boundDragStart: (event: DragEvent) => void;
  private boundDragEnd: () => void;
  private isDragListenerAttached = false;
  private enterTimeout: number | null = null;
  private readonly onEnterEnd = () => this.element.classList.remove('vol-card--entering');

  constructor(options: CardTileOptions) {
    const { data, disabled = false, onAction, className, compact = false } = options;
    this.cardId = data.id;
    this.currentRarity = data.rarity;
    this.onAction = onAction;
    this.compact = compact;
    this.baseClassName = className;

    this.element = document.createElement('div');
    this.applyBaseClassName();
    // Kartın adı başlığıdır: ekran okuyucu "Seç" düğmesini hangi karta ait olduğuyla okur.
    this.element.setAttribute('role', 'group');

    this.badges = document.createElement('div');
    this.badges.className = 'vol-card__badges';

    this.pipsElement = document.createElement('span');
    this.pipsElement.className = 'vol-card__pips';
    this.pipsElement.setAttribute('aria-hidden', 'true');
    this.syncPips();
    this.badges.appendChild(this.pipsElement);

    this.rarityElement = data.rarityLabel
      ? this.createBadge(data.rarityLabel, 'vol-card__rarity')
      : null;
    this.typeElement = data.typeLabel ? this.createBadge(data.typeLabel, 'vol-card__type') : null;
    if (this.rarityElement) this.badges.appendChild(this.rarityElement);
    if (this.typeElement) this.badges.appendChild(this.typeElement);
    // Nadirlik işareti satırda daima durur; satır etiketlerden bağımsız olarak karta bağlıdır.
    this.element.appendChild(this.badges);

    this.titleElement = document.createElement('span');
    this.titleElement.className = 'vol-card__title';
    this.titleElement.id = `vol-card-title-${this.uid}`;
    this.element.setAttribute('aria-labelledby', this.titleElement.id);
    this.titleElement.textContent = data.title;
    this.element.appendChild(this.titleElement);

    this.descriptionElement = document.createElement('span');
    this.descriptionElement.className = 'vol-card__description';
    this.descriptionElement.textContent = data.description;
    this.element.appendChild(this.descriptionElement);

    this.footer = document.createElement('div');
    this.footer.className = 'vol-card__footer';

    this.priceElement = data.priceLabel
      ? this.createTextElement(data.priceLabel, 'vol-card__price')
      : null;
    if (this.priceElement) this.footer.appendChild(this.priceElement);

    this.statusElement = document.createElement('span');
    this.statusElement.className = 'vol-card__status';
    this.statusElement.textContent = data.statusLabel ?? '';
    this.footer.appendChild(this.statusElement);

    this.actionButton = null;
    if (options.actionLabel !== undefined) {
      this.setActionLabel(options.actionLabel);
      this.setDisabled(disabled);
    }

    // İkincil buton PRİMARY'den SONRA eklensin; querySelector('.vol-card__action')
    // her zaman ana aksiyonu döndürsün (kilit/tak ikincil değil).
    this.secondaryButton = null;
    if (options.secondaryActionLabel !== undefined) {
      this.setSecondaryAction(options.secondaryActionLabel, options.onSecondaryAction);
    }

    this.element.appendChild(this.footer);

    this.boundDragStart = (event: DragEvent) => {
      event.dataTransfer?.setData(CARD_DRAG_MIME, this.currentDragData ?? '');
      // Bazı tarayıcılar yalnızca `text/plain` taşır; ikisini de yaz.
      event.dataTransfer?.setData('text/plain', this.currentDragData ?? '');
      this.element.classList.add('vol-card--dragging');
      emitUiIntent({
        kind: 'pick',
        origin: 'CardTile',
        target: this.element,
        event,
        source: 'pointer',
      });
    };
    this.boundDragEnd = () => {
      this.element.classList.remove('vol-card--dragging');
    };

    if (options.dragData !== undefined) {
      this.setDraggable(options.dragData);
    }
  }

  /**
   * Kartı ızgarada yeni belirmiş gibi animasyonla gösterir.
   * Parent (`CardPicker`/`ShopPicker`) kart görünür olduktan SONRA çağırır;
   * bu sayede gizli katmandayken animasyon boşta opacity:0'da takılı kalmaz.
   */
  startEnterAnimation(): void {
    if (!this.element.isConnected) return;

    if (this.enterTimeout !== null) {
      window.clearTimeout(this.enterTimeout);
      this.enterTimeout = null;
    }
    this.element.removeEventListener('animationend', this.onEnterEnd);

    this.element.classList.add('vol-card--entering');
    this.element.addEventListener('animationend', this.onEnterEnd, { once: true });
    this.enterTimeout = window.setTimeout(() => {
      this.enterTimeout = null;
      this.onEnterEnd();
    }, CARD_ENTER_ANIMATION_MS);
  }

  /** Kart metin içeriğini ve nadirlik/tip/rozetlerini yerinde günceller. */
  update(data: Partial<CardTileData>): void {
    if (data.title !== undefined) this.titleElement.textContent = data.title;
    if (data.description !== undefined) this.descriptionElement.textContent = data.description;

    if (data.rarity !== undefined && data.rarity !== this.currentRarity) {
      this.element.classList.remove(`vol-card--${this.currentRarity}`);
      this.currentRarity = data.rarity;
      this.element.classList.add(`vol-card--${this.currentRarity}`);
      this.syncPips();
    }

    if (data.rarityLabel !== undefined) {
      if (data.rarityLabel && this.rarityElement) {
        this.rarityElement.textContent = data.rarityLabel;
      } else if (data.rarityLabel && !this.rarityElement) {
        this.rarityElement = this.createBadge(data.rarityLabel, 'vol-card__rarity');
        this.badges.insertBefore(this.rarityElement, this.typeElement);
      } else if (!data.rarityLabel && this.rarityElement) {
        this.rarityElement.remove();
        this.rarityElement = null;
      }
    }

    if (data.typeLabel !== undefined) {
      if (data.typeLabel && this.typeElement) {
        this.typeElement.textContent = data.typeLabel;
      } else if (data.typeLabel && !this.typeElement) {
        this.typeElement = this.createBadge(data.typeLabel, 'vol-card__type');
        this.badges.appendChild(this.typeElement);
      } else if (!data.typeLabel && this.typeElement) {
        this.typeElement.remove();
        this.typeElement = null;
      }
    }

    if (data.priceLabel !== undefined) {
      if (data.priceLabel && this.priceElement) {
        this.priceElement.textContent = data.priceLabel;
      } else if (data.priceLabel && !this.priceElement) {
        this.priceElement = this.createTextElement(data.priceLabel, 'vol-card__price');
        this.footer.insertBefore(this.priceElement, this.statusElement);
      } else if (!data.priceLabel && this.priceElement) {
        this.priceElement.remove();
        this.priceElement = null;
      }
    }

    if (data.statusLabel !== undefined) {
      this.statusElement.textContent = data.statusLabel;
    }
  }

  /** Alt eylem butonunun metnini günceller; verilmezse butonu kaldırır. */
  setActionLabel(label?: string): void {
    if (label === undefined) {
      this.removeActionButton();
      return;
    }

    if (this.actionButton) {
      this.actionButton.textContent = label;
      return;
    }

    this.actionButton = document.createElement('button');
    this.actionButton.type = 'button';
    this.actionButton.className = 'vol-card__action';
    this.actionButton.id = `vol-card-action-${this.uid}`;
    this.actionButton.setAttribute(
      'aria-labelledby',
      `${this.actionButton.id} ${this.titleElement.id}`,
    );
    this.actionButton.textContent = label;
    this.actionButton.addEventListener('click', this.handleAction);
    // İkincil buton (varsa) önce gelmemeli; aksiyon butonu önce DOM'da
    // dursun ki querySelector('.vol-card__action') güvenli olsun.
    if (this.secondaryButton) {
      this.footer.insertBefore(this.actionButton, this.secondaryButton);
    } else {
      this.footer.appendChild(this.actionButton);
    }
  }

  /** İkincil eylem butonunu ekle/kaldır/değiştir. */
  setSecondaryAction(label?: string, onSecondaryAction?: (id: string) => void): void {
    this.onSecondaryAction = onSecondaryAction;

    if (label === undefined) {
      this.removeSecondaryButton();
      return;
    }

    if (this.secondaryButton) {
      this.secondaryButton.textContent = label;
      this.secondaryButton.disabled = false;
      return;
    }

    this.secondaryButton = document.createElement('button');
    this.secondaryButton.type = 'button';
    this.secondaryButton.className = 'vol-card__action vol-card__action--secondary';
    this.secondaryButton.id = `vol-card-secondary-${this.uid}`;
    this.secondaryButton.setAttribute(
      'aria-labelledby',
      `${this.secondaryButton.id} ${this.titleElement.id}`,
    );
    this.secondaryButton.textContent = label;
    this.secondaryButton.addEventListener('click', this.handleSecondaryAction);
    if (this.actionButton) {
      this.footer.insertBefore(this.secondaryButton, this.actionButton.nextSibling);
    } else {
      this.footer.appendChild(this.secondaryButton);
    }
  }

  /**
   * Seçim vurgusu: kart kısa süre `--vol-motion-card-select-scale` (1,04) büyür ve çerçevesi
   * parlar; azaltılmış harekette ölçek yoktur, çerçeve vurgusu kalır. Kapanan seçicide
   * hangi kartın seçildiğini belli eder.
   */
  markPicked(): void {
    if (this.pickedTimeout !== null) window.clearTimeout(this.pickedTimeout);
    this.element.classList.add('vol-card--picked');
    this.pickedTimeout = window.setTimeout(() => {
      this.pickedTimeout = null;
      this.element.classList.remove('vol-card--picked');
    }, PICKED_MS);
  }

  /** Kartın kimliği (seçici, olayı bildiren kartı bununla bulur). */
  get id(): string {
    return this.cardId;
  }

  /** Kilit görselini açar/kapatır. */
  setLocked(locked: boolean): void {
    this.element.classList.toggle('vol-card--locked', locked);
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

  /** Sürükleme durumunu değiştirir; aynı kartın farklı listeler arasında
   *  taşınmasını (örn. envanterden slota) destekler. */
  setDraggable(dragData?: string): void {
    this.currentDragData = dragData;

    if (dragData !== undefined) {
      if (!this.isDragListenerAttached) {
        this.element.draggable = true;
        this.element.classList.add('vol-card--draggable');
        this.element.addEventListener('dragstart', this.boundDragStart);
        this.element.addEventListener('dragend', this.boundDragEnd);
        this.isDragListenerAttached = true;
      }
      return;
    }

    if (this.isDragListenerAttached) {
      this.element.draggable = false;
      this.element.classList.remove('vol-card--draggable', 'vol-card--dragging');
      this.element.removeEventListener('dragstart', this.boundDragStart);
      this.element.removeEventListener('dragend', this.boundDragEnd);
      this.isDragListenerAttached = false;
    }
  }

  destroy(): void {
    this.removeActionButton();
    this.removeSecondaryButton();
    this.setDraggable(undefined);
    this.element.removeEventListener('animationend', this.onEnterEnd);
    if (this.enterTimeout !== null) {
      window.clearTimeout(this.enterTimeout);
      this.enterTimeout = null;
    }
    if (this.pickedTimeout !== null) {
      window.clearTimeout(this.pickedTimeout);
      this.pickedTimeout = null;
    }
    this.element.classList.remove('vol-card--entering', 'vol-card--picked');
    this.element.remove();
  }

  private createBadge(text: string, className: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  }

  private createTextElement(text: string, className: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  }

  private applyBaseClassName(): void {
    this.element.className = [
      'vol-card',
      `vol-card--${this.currentRarity}`,
      this.compact ? 'vol-card--compact' : '',
      this.baseClassName,
    ]
      .filter(Boolean)
      .join(' ');
  }

  private syncPips(): void {
    this.pipsElement.replaceChildren(
      ...Array.from({ length: RARITY_PIPS[this.currentRarity] }, createPip),
    );
  }

  private removeActionButton(): void {
    if (!this.actionButton) return;
    this.actionButton.removeEventListener('click', this.handleAction);
    this.actionButton.remove();
    this.actionButton = null;
  }

  private removeSecondaryButton(): void {
    if (!this.secondaryButton) return;
    this.secondaryButton.removeEventListener('click', this.handleSecondaryAction);
    this.secondaryButton.remove();
    this.secondaryButton = null;
  }

  private readonly handleAction = (event: Event): void => {
    if (!this.actionButton || this.actionButton.disabled) return;
    emitUiIntent({
      kind: 'select',
      origin: 'CardTile',
      target: this.actionButton,
      event,
      defaultHaptic: 'select',
    });
    this.onAction?.(this.cardId);
  };

  private readonly handleSecondaryAction = (): void => {
    if (this.secondaryButton?.disabled) return;
    this.onSecondaryAction?.(this.cardId);
  };
}
