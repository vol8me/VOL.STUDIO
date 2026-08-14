import { CardPicker, type CardPickerOptions } from './CardPicker';
import { CardTile, type CardTileData } from './CardTile';

/** Dükkanda satılan bir kart ve o anki alım durumu. */
export interface ShopOffer {
  card: CardTileData;
  /** Bu dükkan ziyaretinde satın alındı mı? */
  purchased: boolean;
  /** Bakiye yetiyor mu? */
  affordable: boolean;
}

/** Oyuncunun geri satabileceği kart. */
export interface ShopInventoryEntry {
  /** Kart ÖRNEĞİNİN kimliği — aynı karttan birden fazla olabilir. */
  instanceId: string;
  card: CardTileData;
  /** Satış butonunun metni (örn. "SAT +5"). */
  sellLabel: string;
  /**
   * Verilirse kartta ikinci bir buton çıkar (örn. "TAK"). Sürükle-bırak her
   * girdi yönteminde çalışmaz; aynı işi yapan açık bir buton şart.
   */
  equipLabel?: string;
  /**
   * Verilirse kart sürüklenebilir olur ve bırakma hedefine bu değer taşınır
   * (yetenek kartlarını slota atamak için).
   */
  dragData?: string;
}

export interface ShopPickerState {
  offers: readonly ShopOffer[];
  /** Pasif etkiler — slot gerektirmeyen buff/takas kartları. */
  passives: readonly ShopInventoryEntry[];
  /** Yetenek kartları — slota atanabilirler. */
  abilities: readonly ShopInventoryEntry[];
  /** Bakiye satırı (örn. "Flux: 42"). */
  balanceLabel: string;
  title?: string;
  hint?: string;
}

export interface ShopPickerLabels {
  /** Satın alma butonunun metni. */
  buy: string;
  /** Satın alınmış kartın durum metni. */
  owned: string;
  /** Bakiye yetmediğinde gösterilen durum metni. */
  tooExpensive: string;
  /** Yetenek kartları bölümünün başlığı. */
  abilitiesTitle: string;
  /** Pasif kartlar bölümünün başlığı. */
  passivesTitle: string;
  /** Bölüm boşken gösterilen metin. */
  empty: string;
  /** Kapatma butonunun metni. */
  close: string;
}

export interface ShopPickerOptions extends CardPickerOptions {
  labels: ShopPickerLabels;
  onBuy: (cardId: string) => void;
  onSell: (instanceId: string) => void;
  /** Kartın ikinci butonu (örn. "TAK") tıklandığında. */
  onEquip?: (instanceId: string) => void;
  onClose: () => void;
}

/**
 * Dalga arası dükkan — teklif edilen kartlar fiyatlarıyla, sahip olunan
 * kartlar satış butonuyla listelenir.
 *
 * Level-up seçiminden farkı: oyuncu SIFIR, BİR ya da İKİ kartı da alabilir,
 * panel kendiliğinden kapanmaz ve envanterdeki kartlar geri satılabilir.
 * Envanter iki bölüme ayrılır — pasifler (ne yaptıkları yazar) ve yetenekler
 * (slota sürüklenebilirler); "elimde ne var, ne işe yarıyor" sorusu panelden
 * çıkmadan yanıtlanır.
 */
export class ShopPicker extends CardPicker {
  /** Çağıranın kendi içeriğini koyabileceği alan (ör. yetenek slotları). */
  readonly slotArea: HTMLDivElement;

  private readonly labels: ShopPickerLabels;
  private readonly onBuy: (cardId: string) => void;
  private readonly onSell: (instanceId: string) => void;
  private readonly onEquip?: (instanceId: string) => void;
  private readonly onCloseCallback: () => void;
  private readonly balanceElement: HTMLDivElement;
  private readonly abilitySection: HTMLDivElement;
  private readonly abilityList: HTMLDivElement;
  private readonly passiveSection: HTMLDivElement;
  private readonly passiveList: HTMLDivElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly inventoryTiles: CardTile[] = [];

  constructor(options: ShopPickerOptions) {
    super({ className: 'vol-card-picker--shop', ...options });
    this.labels = options.labels;
    this.onBuy = options.onBuy;
    this.onSell = options.onSell;
    this.onEquip = options.onEquip;
    this.onCloseCallback = options.onClose;

    this.slotArea = document.createElement('div');
    this.slotArea.className = 'vol-card-shop__slots';
    this.element.insertBefore(this.slotArea, this.footer);

    const { section: abilitySection, list: abilityList } = this.buildSection(
      this.labels.abilitiesTitle,
      'vol-card-shop__abilities',
    );
    this.abilitySection = abilitySection;
    this.abilityList = abilityList;
    this.element.insertBefore(this.abilitySection, this.footer);

    const { section: passiveSection, list: passiveList } = this.buildSection(
      this.labels.passivesTitle,
      'vol-card-shop__passives',
    );
    this.passiveSection = passiveSection;
    this.passiveList = passiveList;
    this.element.insertBefore(this.passiveSection, this.footer);

    this.balanceElement = document.createElement('div');
    this.balanceElement.className = 'vol-card-shop__balance';
    this.footer.appendChild(this.balanceElement);

    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'vol-card-shop__close';
    this.closeButton.textContent = this.labels.close;
    this.closeButton.addEventListener('click', this.handleClose);
    this.footer.appendChild(this.closeButton);
  }

  /** Dükkanı verilen durumla çizer ve açar. */
  present(state: ShopPickerState): void {
    this.render(state);
    this.show();
  }

  /**
   * Paneli açık tutarak içeriği tazeler — satın alma/satış sonrası bakiye ve
   * kart durumları değiştiğinde çağrılır.
   */
  render(state: ShopPickerState): void {
    if (state.title !== undefined) this.setTitle(state.title);
    if (state.hint !== undefined) this.setHint(state.hint);
    this.balanceElement.textContent = state.balanceLabel;

    this.clearTiles();
    for (const offer of state.offers) {
      const status = offer.purchased
        ? this.labels.owned
        : offer.affordable
        ? ''
        : this.labels.tooExpensive;

      this.addTile(
        { ...offer.card, statusLabel: status },
        {
          actionLabel: this.labels.buy,
          disabled: offer.purchased || !offer.affordable,
          onAction: (id) => this.onBuy(id),
        },
      );
    }

    this.clearInventory();
    this.renderInventory(this.abilityList, state.abilities, true);
    this.renderInventory(this.passiveList, state.passives, false);
  }

  override destroy(): void {
    this.closeButton.removeEventListener('click', this.handleClose);
    this.clearInventory();
    super.destroy();
  }

  private buildSection(
    titleText: string,
    className: string,
  ): { section: HTMLDivElement; list: HTMLDivElement } {
    const section = document.createElement('div');
    section.className = `vol-card-shop__section ${className}`;

    const title = document.createElement('div');
    title.className = 'vol-card-shop__section-title';
    title.textContent = titleText;
    section.appendChild(title);

    const list = document.createElement('div');
    list.className = 'vol-card-shop__list';
    section.appendChild(list);

    return { section, list };
  }

  private renderInventory(
    list: HTMLDivElement,
    entries: readonly ShopInventoryEntry[],
    draggable: boolean,
  ): void {
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'vol-card-shop__empty';
      empty.textContent = this.labels.empty;
      list.appendChild(empty);
      return;
    }

    for (const entry of entries) {
      const tile = new CardTile({
        data: entry.card,
        compact: true,
        actionLabel: entry.sellLabel,
        onAction: () => this.onSell(entry.instanceId),
        secondaryActionLabel: entry.equipLabel,
        onSecondaryAction: () => this.onEquip?.(entry.instanceId),
        dragData: draggable ? entry.dragData : undefined,
      });
      this.inventoryTiles.push(tile);
      list.appendChild(tile.element);
    }
  }

  private clearInventory(): void {
    for (const tile of this.inventoryTiles) {
      tile.destroy();
    }
    this.inventoryTiles.length = 0;
    this.abilityList.replaceChildren();
    this.passiveList.replaceChildren();
  }

  private readonly handleClose = (): void => {
    this.hide();
    this.onCloseCallback();
  };
}
