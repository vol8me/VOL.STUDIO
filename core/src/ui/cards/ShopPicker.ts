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
   * çağırandan yaşar; bu alan yalnızca o kararın görsel yansımasıdır.
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
  /**
   * Bu render'ın NİYETİ. Panel bunu tahmin ETMEZ, çağıran söyler.
   *
   * - `'reroll'`: teklifler yeniden çekildi; kilitli olmayanlar yenilenir.
   * - `'refresh'` (varsayılan): bakiye/satın alma durumu değişti, kartlar yerinde güncellenir.
   */
  transition?: 'reroll' | 'refresh';
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

interface LeavingTile {
  tile: CardTile;
  timeout: ReturnType<typeof setTimeout>;
}

/** Bir teklif kartının panel tarafındaki tüm durumu. */
interface OfferEntry {
  tile: CardTile;
  /** Son render'da satın alınmış mıydı — "yeni alındı" vurgusunu tetiklemek için. */
  purchased: boolean;
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
 * `.vol-card-picker--rerolling .vol-card-picker__grid` animasyon süresiyle
 * (`vol-card-grid-reroll`, 0.24s) eşleşir.
 */
export const REROLL_FLASH_MS = 240;

/**
 * `.vol-card--just-purchased` (`vol-card-purchase-flash`,
 * `--vol-transition-medium`) süresiyle eşleşir. `LEAVE_ANIMATION_MS`'den
 * ayrı tutulur; iki animasyonun süresi ayrışırsa vurgu erken silinebilir.
 */
export const PURCHASE_FLASH_MS = 240;

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
 * **Render stratejisi DIFF'lidir:** yalnızca yeni kartlar oluşturulur,
 * listeden çıkanlar çıkış animasyonuyla kaldırılır, var olanlar yerinde
 * güncellenir ve konumları korunur.
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

  /**
   * Teklif kartları — kart ID'sine göre TEK kayıt.
   *
   * Tek kayıtta hem düğüm hem satın alma durumu tutulur; ayrı senkronizasyon
   * hatası riski olmaz.
   */
  private readonly offers = new Map<string, OfferEntry>();
  /** Çıkış animasyonu bekleyen teklifler — geri gelirse geri alınır. */
  private readonly leavingOffers = new Map<string, LeavingTile>();
  /** Envanter kartları — instanceId'ye göre (iki liste ayrı Map'te). */
  private readonly abilityTiles = new Map<string, CardTile>();
  private readonly passiveTiles = new Map<string, CardTile>();
  /** Çıkış animasyonu bekleyen envanter kartları. */
  private readonly leavingInventory = new Map<string, LeavingTile>();
  /** Çıkış/vurgu zamanlayıcılar — destroy()'da iptal edilir. */
  private readonly pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
  /**
   * Henüz giriş animasyonu almamış yeni kartlar. Kartlar `show()` veya
   * görünür haldeki `render()` sonunda toplu olarak animate edilir; gizli
   * katmanda oluşturulurken erken class atanması opacity:0 takılmasına yol açar.
   */
  private readonly pendingEnter = new Set<CardTile>();
  /** Izgara reroll vurgusu — üst üste gelen reroll'larda yenilenir. */
  private rerollTimeout: ReturnType<typeof setTimeout> | undefined;

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

  override show(): void {
    super.show();
    this.flushEnterAnimations();
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

    const isReroll = state.transition === 'reroll';

    this.syncOffers(state.offers, isReroll);
    this.syncInventory(this.abilitySection, this.abilityTiles, state.abilities, true);
    this.syncInventory(this.passiveSection, this.passiveTiles, state.passives, false);

    if (this.isVisible()) {
      // Açık panelde teklifler yenilendiğinde ızgara kısa bir 'kapanıp açılma'
      // vurgusu alır; bu, tek kart girişinin gözden kaçtığı durumlarda
      // reroll'un hissedilmesini sağlar.
      if (isReroll) this.playRerollFlash();

      // Reroll/satın alma gibi görünür panel güncellemelerinde yeni kartları
      // hemen animasyonla belirt; ilk açılış `show()`'da flush edilir.
      this.flushEnterAnimations();
    }
  }

  override destroy(): void {
    for (const timeout of this.pendingTimeouts) clearTimeout(timeout);
    this.pendingTimeouts.clear();

    this.rerollButton?.removeEventListener('click', this.handleReroll);
    this.closeButton.removeEventListener('click', this.handleClose);

    for (const { tile } of this.leavingOffers.values()) tile.destroy();
    this.leavingOffers.clear();
    for (const { tile } of this.leavingInventory.values()) tile.destroy();
    this.leavingInventory.clear();

    for (const { tile } of this.offers.values()) tile.destroy();
    this.offers.clear();
    this.pendingEnter.clear();

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

  /**
   * Oluşturulmuş ama henüz animasyon almamış kartlara `vol-card--entering`
   * class'ını uygular. `requestAnimationFrame` çiftiyle DOM layout'unun
   * bittiğinden emin olunur; aksi halde gizli katmandan açılan panelde
   * opacity:0 karesi takılı kalabilir.
   */
  private flushEnterAnimations(): void {
    if (this.pendingEnter.size === 0) return;
    const tiles = [...this.pendingEnter];
    this.pendingEnter.clear();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const tile of tiles) tile.startEnterAnimation();
      });
    });
  }

  /** Izgaraya kısa 'yenilendi' vurgusu uygular. */
  private playRerollFlash(): void {
    this.element.classList.add('vol-card-picker--rerolling');
    if (this.rerollTimeout !== undefined) {
      this.pendingTimeouts.delete(this.rerollTimeout);
      clearTimeout(this.rerollTimeout);
    }
    const timeout = setTimeout(() => {
      this.pendingTimeouts.delete(timeout);
      this.rerollTimeout = undefined;
      this.element.classList.remove('vol-card-picker--rerolling');
    }, REROLL_FLASH_MS);
    this.rerollTimeout = timeout;
    this.pendingTimeouts.add(timeout);
  }

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

  private syncOffers(offers: readonly ShopOffer[], isReroll: boolean): void {
    const seen = new Set<string>();

    for (const [index, offer] of offers.entries()) {
      const id = offer.card.id;
      seen.add(id);

      const locked = offer.locked ?? false;
      // Kilit yalnızca satın alınmamış tekliflerde anlamlıdır — bir kart
      // alındıktan sonra artık reroll'da "korunacak" bir şey kalmaz.
      const lockable = Boolean(this.lock) && !offer.purchased;
      const status = offer.purchased
        ? this.labels.owned
        : offer.affordable
        ? ''
        : this.labels.tooExpensive;
      const disabled = offer.purchased || !offer.affordable;

      const existing = this.offers.get(id);
      // Reroll'da kilitli OLMAYAN teklifler yeni düğüm olarak kurulur ki
      // giriş animasyonunu alsınlar. Kilitli kartlar ve reroll dışı her
      // güncelleme YERİNDE yapılır — konum, odak ve animasyon korunur.
      const rebuild = isReroll && !locked;

      if (existing && !rebuild) {
        this.applyOfferState(existing.tile, offer, { status, disabled, locked, lockable });
        this.insertAtIndex(this.grid, existing.tile, index);
        this.flashIfJustPurchased(existing, offer.purchased);
        continue;
      }

      if (existing) {
        this.offers.delete(id);
        // Eski kart anında yok edilir: 240 ms çıkış animasyonu tutsaydı yeni
        // kart aynı ızgara hücresine giremez, geçiş kayardı.
        this.removeWithAnimation(id, existing.tile, this.leavingOffers, true);
      }

      // Çıkış animasyonu bekleyen bir kart geri geldiyse yeni düğüm kurma.
      const returning = this.cancelLeaving(id, this.leavingOffers);
      const tile =
        returning ??
        new CardTile({
          data: { ...offer.card, statusLabel: status },
          actionLabel: this.labels.buy,
          disabled,
          onAction: (cardId) => this.onBuy(cardId),
          className: locked ? 'vol-card--locked' : undefined,
        });
      if (!returning) this.pendingEnter.add(tile);

      this.applyOfferState(tile, offer, { status, disabled, locked, lockable });
      this.insertAtIndex(this.grid, tile, index);

      const entry: OfferEntry = { tile, purchased: false };
      this.offers.set(id, entry);
      this.flashIfJustPurchased(entry, offer.purchased);
    }

    for (const [id, entry] of [...this.offers]) {
      if (seen.has(id)) continue;
      this.offers.delete(id);
      this.removeWithAnimation(id, entry.tile, this.leavingOffers, true);
    }
  }

  /**
   * Bir teklif kartının tüm görsel durumunu TEK yerden uygular.
   *
   * Yeni ve var olan kartlar aynı yolla güncellenir; farklı kollar arasında
   * davranış ayrışması riski oluşmaz.
   */
  private applyOfferState(
    tile: CardTile,
    offer: ShopOffer,
    view: { status: string; disabled: boolean; locked: boolean; lockable: boolean },
  ): void {
    tile.update({ ...offer.card, statusLabel: view.status });
    tile.setDisabled(view.disabled, view.status);
    tile.setLocked(view.locked);
    tile.setSecondaryAction(
      view.lockable ? (view.locked ? this.lock?.unlockLabel : this.lock?.lockLabel) : undefined,
      view.lockable ? (cardId) => this.lock?.onToggle(cardId) : undefined,
    );
  }

  /** Bir teklif İLK KEZ satın alınmış duruma geçtiğinde kısa bir "başarı" vurgusu oynatır. */
  private flashIfJustPurchased(entry: OfferEntry, purchased: boolean): void {
    const wasPurchased = entry.purchased;
    entry.purchased = purchased;
    if (!purchased || wasPurchased) return;

    const tile = entry.tile;
    // Yeni satın alınan bir kart giriş animasyonu bitmeden vurgulanıyorsa
    // çakışmasın; giriş class'ını kaldır.
    tile.element.classList.remove('vol-card--entering');
    this.pendingEnter.delete(tile);
    tile.element.classList.add(PURCHASE_FLASH_CLASS);
    const clear = (): void => tile.element.classList.remove(PURCHASE_FLASH_CLASS);
    // `animationend` `prefers-reduced-motion: reduce` altında HİÇ ateşlenmez
    // (animasyon zaten `none`) — class sonsuza dek takılı kalırdı. Zamanlayıcı
    // ikisinden hangisi önce gelirse class'ı kaldırır (ikinci çağrı no-op).
    tile.element.addEventListener('animationend', clear, { once: true });
    const timeout = setTimeout(() => {
      this.pendingTimeouts.delete(timeout);
      clear();
    }, PURCHASE_FLASH_MS);
    this.pendingTimeouts.add(timeout);
  }

  private syncInventory(
    target: ShopSection,
    tiles: Map<string, CardTile>,
    entries: readonly ShopInventoryEntry[],
    draggable: boolean,
  ): void {
    const seen = new Set<string>();

    for (const [index, entry] of entries.entries()) {
      seen.add(entry.instanceId);
      const existing = tiles.get(entry.instanceId);

      if (existing) {
        existing.update(entry.card);
        existing.setActionLabel(entry.sellLabel);
        existing.setSecondaryAction(
          entry.equipLabel,
          entry.equipLabel ? () => this.onEquip?.(entry.instanceId) : undefined,
        );
        existing.setDraggable(draggable ? entry.dragData : undefined);
        this.insertAtIndex(target.list, existing, index);
        continue;
      }

      const tile =
        this.cancelLeaving(entry.instanceId, this.leavingInventory) ??
        new CardTile({
          data: entry.card,
          compact: true,
          actionLabel: entry.sellLabel,
          onAction: () => this.onSell(entry.instanceId),
          secondaryActionLabel: entry.equipLabel,
          onSecondaryAction: entry.equipLabel ? () => this.onEquip?.(entry.instanceId) : undefined,
          dragData: draggable ? entry.dragData : undefined,
        });

      // `cancelLeaving` döndürdüyse butonlar/eski durumlar kalmış olabilir;
      // güncel envanter durumuna göre yeniden ayarla.
      tile.update(entry.card);
      tile.setActionLabel(entry.sellLabel);
      tile.setSecondaryAction(
        entry.equipLabel,
        entry.equipLabel ? () => this.onEquip?.(entry.instanceId) : undefined,
      );
      tile.setDraggable(draggable ? entry.dragData : undefined);

      tiles.set(entry.instanceId, tile);
      this.insertAtIndex(target.list, tile, index);
    }

    for (const [instanceId, tile] of [...tiles]) {
      if (seen.has(instanceId)) continue;
      tiles.delete(instanceId);
      this.removeWithAnimation(instanceId, tile, this.leavingInventory);
    }

    target.empty.hidden = entries.length > 0;
  }

  /**
   * Kartı hemen DOM'dan silmek yerine kısa bir çıkış animasyonuyla kaldırır.
   * `immediate` true verilirse animasyon beklemeden anında yok edilir — teklif
   * ızgarasındaki reroll gibi eski kartla yeni kartın aynı hücreye girmediği
   * durumlarda düzgün geçiş sağlar.
   */
  private removeWithAnimation(
    id: string,
    tile: CardTile,
    leavingMap: Map<string, LeavingTile>,
    immediate = false,
  ): void {
    // Giriş animasyonu ile çıkış animasyonu çakışmasın; giriş class'ını sil.
    tile.element.classList.remove('vol-card--entering');
    this.pendingEnter.delete(tile);

    if (immediate) {
      leavingMap.delete(id);
      tile.destroy();
      return;
    }

    tile.element.classList.add(LEAVING_CLASS);
    const timeout = setTimeout(() => {
      this.pendingTimeouts.delete(timeout);
      leavingMap.delete(id);
      tile.destroy();
    }, LEAVE_ANIMATION_MS);
    this.pendingTimeouts.add(timeout);
    leavingMap.set(id, { tile, timeout });
  }

  /** Çıkış animasyonu bekleyen bir kartı, animasyon bitmeden geri getirir. */
  private cancelLeaving(id: string, leavingMap: Map<string, LeavingTile>): CardTile | undefined {
    const leaving = leavingMap.get(id);
    if (!leaving) return undefined;

    clearTimeout(leaving.timeout);
    this.pendingTimeouts.delete(leaving.timeout);
    leaving.tile.element.classList.remove(LEAVING_CLASS);
    leavingMap.delete(id);
    return leaving.tile;
  }

  /** Kartı ızgaradaki hedef indekse yerleştirir; zaten doğru yerdeyse dokunmaz. */
  private insertAtIndex(container: HTMLDivElement, tile: CardTile, index: number): void {
    if (container.children[index] === tile.element) return;
    const ref = container.children[index] ?? null;
    container.insertBefore(tile.element, ref);
  }

  private readonly handleClose = (): void => {
    this.hide();
    this.onCloseCallback();
  };
}
