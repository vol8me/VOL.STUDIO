import { CardPicker, type CardPickerOptions } from './CardPicker';
import { CardTile, type CardTileData } from './CardTile';

/** Dükkanda satılan bir kart ve o anki alım durumu. */
export interface ShopOffer {
  card: CardTileData;
  /** Bu dükkan ziyaretinde satın alındı mı? */
  purchased: boolean;
  /** Bakiye yetiyor mu? */
  affordable: boolean;
  /**
   * Kilitli mi — yalnızca `ShopPickerOptions.lock` verildiyse anlamlı.
   * Kilit MANTIĞI (hangi tekliflerin reroll'da korunacağı) burada değil,
   * çağıranda yaşar; bu alan yalnızca o kararın görsel yansımasıdır.
   */
  locked?: boolean;
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

/** Reroll butonunun o anki durumu — yalnızca `ShopPickerOptions.reroll` verildiyse anlamlı. */
export interface ShopPickerRerollState {
  /** Maliyet satırı (örn. "5 Flux"). `priceLabel` ile aynı biçimde. */
  costLabel: string;
  /** Bakiye reroll'u karşılıyor mu? */
  affordable: boolean;
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
  /** Verilirse (ve `reroll` option'ı açıksa) reroll butonu bu bilgiyle güncellenir. */
  reroll?: ShopPickerRerollState;
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

/**
 * Reroll — teklifi yeniler. OPSİYONELDİR: verilmezse buton hiç render
 * edilmez (geriye uyumlu — mevcut tüketiciler değişiklik yapmadan çalışmaya
 * devam eder). Maliyet/uygunluk hesabı, HANGİ kartların yeniden çekileceği
 * ve kilitli tekliflerin korunması ÇAĞIRANIN sorumluluğudur — `ShopPicker`
 * bir kart havuzu ya da RNG bilmez, yalnızca butonu çizer ve tıklamayı
 * `onReroll` ile bildirir (bkz. `onBuy`/`onSell` ile aynı desen).
 */
export interface ShopPickerRerollOptions {
  /** Buton metni (örn. "YENİDEN ÇEVİR"). Maliyet `render()`'da eklenir. */
  label: string;
  onReroll: () => void;
}

/**
 * Kilit — bir teklifin reroll'da korunmasını işaretlemek için. OPSİYONELDİR:
 * verilmezse kartlarda kilit butonu hiç çıkmaz. Kilitli tekliflerin reroll
 * sırasında gerçekten korunması ÇAĞIRANIN sorumluluğudur (bkz. yukarıdaki
 * `ShopPickerRerollOptions` notu) — `ShopPicker` yalnızca durumu görsel
 * olarak yansıtır (`ShopOffer.locked`) ve tıklamayı `onToggle` ile bildirir.
 */
export interface ShopPickerLockOptions {
  /** Kilitli değilken gösterilen buton metni (örn. "KİLİTLE"). */
  lockLabel: string;
  /** Kilitliyken gösterilen buton metni (örn. "KİLİDİ AÇ"). */
  unlockLabel: string;
  onToggle: (cardId: string) => void;
}

export interface ShopPickerOptions extends CardPickerOptions {
  labels: ShopPickerLabels;
  onBuy: (cardId: string) => void;
  onSell: (instanceId: string) => void;
  /** Kartın ikinci butonu (örn. "TAK") tıklandığında. */
  onEquip?: (instanceId: string) => void;
  onClose: () => void;
  reroll?: ShopPickerRerollOptions;
  lock?: ShopPickerLockOptions;
}

/** Bir liste bölümünün (envanter) kalıcı DOM iskeleti — başlık + kart listesi + boş-durum metni. */
interface ShopSection {
  section: HTMLDivElement;
  list: HTMLDivElement;
  empty: HTMLDivElement;
}

const PURCHASE_FLASH_CLASS = 'vol-card--just-purchased';
const LEAVING_CLASS = 'vol-card--leaving';
/**
 * `.vol-card--leaving`'in CSS süresiyle (`--vol-transition-medium`, 240ms)
 * eşleşir — `animationend` bazı durumlarda (ör. `prefers-reduced-motion`
 * animasyonu tamamen kapattığında) hiç ateşlenmeyebilir, bu yüzden gerçek
 * temizlik bu zamanlayıcıya bağlı. Süre CSS'ten KISA OLAMAZ (bkz.
 * `core/tests/ui/cssConstantSync.test.ts` deseni) — kısa olsaydı kart,
 * çıkış animasyonu bitmeden DOM'dan koparılıp geçiş görsel olarak kesilirdi.
 */
export const LEAVE_ANIMATION_MS = 240;

/**
 * Dalga arası dükkan — teklif edilen kartlar fiyatlarıyla, sahip olunan
 * kartlar satış butonuyla listelenir.
 *
 * Level-up seçiminden farkı: oyuncu SIFIR, BİR ya da İKİ kartı da alabilir,
 * panel kendiliğinden kapanmaz ve envanterdeki kartlar geri satılabilir.
 * Envanter iki bölüme ayrılır — pasifler (ne yaptıkları yazar) ve yetenekler
 * (slota sürüklenebilirler); "elimde ne var, ne işe yarıyor" sorusu panelden
 * çıkmadan yanıtlanır.
 *
 * **Render stratejisi bilinçli olarak DIFF'lidir, "hepsini yık yeniden kur"
 * DEĞİLDİR.** İlk tasarım her `render()` çağrısında (satın alma, satış, kilit
 * değişimi, reroll — HANGİSİ olursa olsun) tüm teklif ve envanter kartlarını
 * `destroy()` edip yeniden `CardTile` olarak kuruyordu. Bunun iki gerçek
 * sonucu vardı: (1) CSS giriş animasyonu (`vol-card-in`) YENİ eklenen bir DOM
 * düğümünde tetiklenir — ilgisiz bir kilitleme tıklaması bile TÜM envanteri
 * yeniden animasyonla titretiyordu, envanter büyüdükçe bu daha görünür/rahatsız
 * edici hale geliyordu; (2) tek bir kartın satın alınması diğer tekliflerin de
 * DOM'unu (ve olay dinleyicilerini) gereksiz yere yeniden kuruyordu. Şimdi:
 * yalnızca gerçekten YENİ olan kartlar oluşturuluyor, yalnızca artık listede
 * OLMAYAN kartlar (çıkış animasyonuyla) kaldırılıyor, VAR OLAN kartlar
 * `CardTile.setDisabled()` ile YERİNDE güncelleniyor.
 */
export class ShopPicker extends CardPicker {
  /** Çağıranın kendi içeriğini koyabileceği alan (ör. yetenek slotları). */
  readonly slotArea: HTMLDivElement;

  private readonly labels: ShopPickerLabels;
  private readonly onBuy: (cardId: string) => void;
  private readonly onSell: (instanceId: string) => void;
  private readonly onEquip?: (instanceId: string) => void;
  private readonly onCloseCallback: () => void;
  private readonly reroll?: ShopPickerRerollOptions;
  private readonly lock?: ShopPickerLockOptions;
  private readonly rerollRow: HTMLDivElement | null = null;
  private readonly rerollButton: HTMLButtonElement | null = null;
  private readonly balanceElement: HTMLDivElement;
  private readonly abilitySection: ShopSection;
  private readonly passiveSection: ShopSection;
  private readonly closeButton: HTMLButtonElement;

  /** Teklif kartları — kart ID'sine göre. `offerSignatures` yapısal (kilit vb.) değişimi izler. */
  private readonly offerTiles = new Map<string, CardTile>();
  private readonly offerSignatures = new Map<string, string>();
  private readonly offerPurchased = new Map<string, boolean>();
  /** Envanter kartları — instanceId'ye göre (iki liste ayrı Map'te). */
  private readonly abilityTiles = new Map<string, CardTile>();
  private readonly passiveTiles = new Map<string, CardTile>();
  /** Çıkış animasyonu bekleyen zamanlayıcılar — destroy()'da iptal edilir. */
  private readonly pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();

  constructor(options: ShopPickerOptions) {
    super({ className: 'vol-card-picker--shop', ...options });
    this.labels = options.labels;
    this.onBuy = options.onBuy;
    this.onSell = options.onSell;
    this.onEquip = options.onEquip;
    this.onCloseCallback = options.onClose;
    this.reroll = options.reroll;
    this.lock = options.lock;

    if (this.reroll) {
      this.rerollRow = document.createElement('div');
      this.rerollRow.className = 'vol-card-shop__reroll-row';

      this.rerollButton = document.createElement('button');
      this.rerollButton.type = 'button';
      this.rerollButton.className = 'vol-card-shop__reroll';
      this.rerollButton.textContent = this.reroll.label;
      this.rerollButton.addEventListener('click', this.handleReroll);
      this.rerollRow.appendChild(this.rerollButton);

      this.element.insertBefore(this.rerollRow, this.grid);
    }

    this.slotArea = document.createElement('div');
    this.slotArea.className = 'vol-card-shop__slots';
    this.element.insertBefore(this.slotArea, this.footer);

    this.abilitySection = this.buildSection(this.labels.abilitiesTitle, 'vol-card-shop__abilities');
    this.element.insertBefore(this.abilitySection.section, this.footer);

    this.passiveSection = this.buildSection(this.labels.passivesTitle, 'vol-card-shop__passives');
    this.element.insertBefore(this.passiveSection.section, this.footer);

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
   * kart durumları değiştiğinde çağrılır. Yalnızca gerçekten DEĞİŞEN kartları
   * dokunur (bkz. sınıf dokümantasyonu) — DOM'u ilgisiz kartlar için yeniden
   * kurmaz, animasyonlarını yeniden tetiklemez.
   */
  render(state: ShopPickerState): void {
    if (state.title !== undefined) this.setTitle(state.title);
    if (state.hint !== undefined) this.setHint(state.hint);
    this.balanceElement.textContent = state.balanceLabel;

    if (this.rerollButton && this.reroll) {
      this.rerollButton.textContent = state.reroll
        ? `${this.reroll.label} — ${state.reroll.costLabel}`
        : this.reroll.label;
      this.rerollButton.disabled = state.reroll ? !state.reroll.affordable : false;
    }

    this.syncOffers(state.offers);
    this.syncInventory(this.abilitySection, this.abilityTiles, state.abilities, true);
    this.syncInventory(this.passiveSection, this.passiveTiles, state.passives, false);
  }

  override destroy(): void {
    for (const timeout of this.pendingTimeouts) clearTimeout(timeout);
    this.pendingTimeouts.clear();

    this.rerollButton?.removeEventListener('click', this.handleReroll);
    this.closeButton.removeEventListener('click', this.handleClose);

    for (const tile of this.offerTiles.values()) tile.destroy();
    this.offerTiles.clear();
    this.offerSignatures.clear();
    this.offerPurchased.clear();

    for (const tile of this.abilityTiles.values()) tile.destroy();
    this.abilityTiles.clear();
    for (const tile of this.passiveTiles.values()) tile.destroy();
    this.passiveTiles.clear();

    super.destroy();
  }

  private readonly handleReroll = (): void => {
    if (this.rerollButton?.disabled) return;
    this.reroll?.onReroll();
  };

  private buildSection(titleText: string, className: string): ShopSection {
    const section = document.createElement('div');
    section.className = `vol-card-shop__section ${className}`;

    const title = document.createElement('div');
    title.className = 'vol-card-shop__section-title';
    title.textContent = titleText;
    section.appendChild(title);

    const list = document.createElement('div');
    list.className = 'vol-card-shop__list';
    section.appendChild(list);

    const empty = document.createElement('div');
    empty.className = 'vol-card-shop__empty';
    empty.textContent = this.labels.empty;
    list.appendChild(empty);

    return { section, list, empty };
  }

  /**
   * Yapısal olarak neyin değiştiğini tespit etmek için imza. `locked`/`lockable`
   * değişirse kartın DOM'u (ikincil buton var/yok) yeniden kurulmak ZORUNDA —
   * `CardTile` var olan bir butonu sonradan ekleyip çıkaramıyor. Yalnızca
   * `purchased`/`affordable` değişimi `setDisabled()` ile yerinde çözülür.
   */
  private offerSignature(offer: ShopOffer, lockable: boolean): string {
    return `${lockable}:${offer.locked ?? false}`;
  }

  private syncOffers(offers: readonly ShopOffer[]): void {
    const seen = new Set<string>();

    for (const offer of offers) {
      const id = offer.card.id;
      seen.add(id);

      const status = offer.purchased
        ? this.labels.owned
        : offer.affordable
        ? ''
        : this.labels.tooExpensive;
      // Kilit yalnızca satın alınmamış tekliflerde anlamlıdır — bir kart
      // alındıktan sonra artık reroll'da "korunacak" bir şey kalmaz.
      const lockable = Boolean(this.lock) && !offer.purchased;
      const signature = this.offerSignature(offer, lockable);
      const disabled = offer.purchased || !offer.affordable;

      const existing = this.offerTiles.get(id);
      if (existing && this.offerSignatures.get(id) === signature) {
        existing.setDisabled(disabled, status);
        this.flashIfJustPurchased(existing, id, offer.purchased);
        continue;
      }

      existing?.destroy();
      const tile = new CardTile({
        data: { ...offer.card, statusLabel: status },
        actionLabel: this.labels.buy,
        disabled,
        onAction: (cardId) => this.onBuy(cardId),
        className: offer.locked ? 'vol-card--locked' : undefined,
        secondaryActionLabel: lockable
          ? offer.locked
            ? this.lock?.unlockLabel
            : this.lock?.lockLabel
          : undefined,
        onSecondaryAction: lockable ? (cardId) => this.lock?.onToggle(cardId) : undefined,
      });
      this.grid.appendChild(tile.element);
      this.offerTiles.set(id, tile);
      this.offerSignatures.set(id, signature);
      // `flashIfJustPurchased` kendi offerPurchased.set()'ini yapar — burada
      // elle set edilmez, aksi halde "önceki durum" her zaman "şimdiki durum"
      // ile aynı okunur ve flash asla tetiklenmez.
      this.flashIfJustPurchased(tile, id, offer.purchased);
    }

    for (const [id, tile] of [...this.offerTiles]) {
      if (seen.has(id)) continue;
      this.offerTiles.delete(id);
      this.offerSignatures.delete(id);
      this.offerPurchased.delete(id);
      this.removeWithAnimation(tile);
    }
  }

  /** Bir teklif İLK KEZ satın alınmış duruma geçtiğinde kısa bir "başarı" vurgusu oynatır. */
  private flashIfJustPurchased(tile: CardTile, id: string, purchased: boolean): void {
    const wasPurchased = this.offerPurchased.get(id) ?? false;
    this.offerPurchased.set(id, purchased);
    if (!purchased || wasPurchased) return;

    tile.element.classList.add(PURCHASE_FLASH_CLASS);
    const clear = (): void => tile.element.classList.remove(PURCHASE_FLASH_CLASS);
    // `animationend` `prefers-reduced-motion: reduce` altında HİÇ ateşlenmez
    // (animasyon zaten `none`) — class sonsuza dek takılı kalırdı. Zamanlayıcı
    // ikisinden hangisi önce gelirse class'ı kaldırır (ikinci çağrı no-op).
    tile.element.addEventListener('animationend', clear, { once: true });
    const timeout = setTimeout(() => {
      this.pendingTimeouts.delete(timeout);
      clear();
    }, LEAVE_ANIMATION_MS);
    this.pendingTimeouts.add(timeout);
  }

  private syncInventory(
    target: ShopSection,
    tiles: Map<string, CardTile>,
    entries: readonly ShopInventoryEntry[],
    draggable: boolean,
  ): void {
    const seen = new Set<string>();

    for (const entry of entries) {
      seen.add(entry.instanceId);
      if (tiles.has(entry.instanceId)) continue;

      const tile = new CardTile({
        data: entry.card,
        compact: true,
        actionLabel: entry.sellLabel,
        onAction: () => this.onSell(entry.instanceId),
        secondaryActionLabel: entry.equipLabel,
        onSecondaryAction: () => this.onEquip?.(entry.instanceId),
        dragData: draggable ? entry.dragData : undefined,
      });
      tiles.set(entry.instanceId, tile);
      target.list.insertBefore(tile.element, target.empty);
    }

    for (const [instanceId, tile] of [...tiles]) {
      if (seen.has(instanceId)) continue;
      tiles.delete(instanceId);
      this.removeWithAnimation(tile);
    }

    target.empty.hidden = entries.length > 0;
  }

  /** Kartı hemen DOM'dan silmek yerine kısa bir çıkış animasyonuyla kaldırır. */
  private removeWithAnimation(tile: CardTile): void {
    tile.element.classList.add(LEAVING_CLASS);
    const timeout = setTimeout(() => {
      this.pendingTimeouts.delete(timeout);
      tile.destroy();
    }, LEAVE_ANIMATION_MS);
    this.pendingTimeouts.add(timeout);
  }

  private readonly handleClose = (): void => {
    this.hide();
    this.onCloseCallback();
  };
}
