import {
  HIDE_ANIMATION_MS,
  LevelUpPicker,
  ShopPicker,
  ToastManager,
  i18next,
  type ShopInventoryEntry,
  type ShopPickerState,
} from '@volstudio/core';
import type { CardDefinition } from '@/config/cards/types';
import { economyConfig } from '@/config/economy';
import { getCardSellValue } from '@/config/cards';
import type { AbilitySlot } from '@/runtime/ability/types';
import type { CardInventoryManager, OwnedCard } from '@/runtime/systems/CardInventoryManager';
import type { RunEconomy } from '@/runtime/systems/RunEconomy';
import { AbilityLoadout } from './AbilityLoadout';
import { toCardTileData } from './cardText';

export interface CardScreensCallbacks {
  /** Bir ekran açıldı — sahne oyunu duraklatır. */
  onOpen: () => void;
  /** Tüm ekranlar kapandı — sahne devam eder. */
  onClose: () => void;
  /** Kart edinildi — efekt/ses için. `source` level-up mu dükkandan mı alındığını belirtir. */
  onCardTaken?: (source: 'levelUp' | 'shop') => void;
  /** Dükkanda teklifleri yenileme — ses için. */
  onReroll?: () => void;
  /** Dükkanda bir teklifi kilitleme/kilidini açma — ses için. */
  onLockToggle?: () => void;
  /** Satın alma / ekipman takma reddedildiğinde — ses için. */
  onDeny?: () => void;
}

/** Dükkan teklif sayısı. */
const SHOP_SIZE = 2;
const ABILITY_SLOTS: AbilitySlot[] = ['primary', 'secondary'];

/**
 * Dalga arası akışın oyun tarafı orkestrasyonu.
 *
 * Seviye atlamaları dalganın ORTASINDA ekran açmaz: biriktirilir ve dalga
 * bitince sırayla sunulur, ardından dükkan gelir. Böylece dövüş kesintiye
 * uğramaz ve iki seviye atlandığı bir dalgada oyuncu iki kart seçer.
 */
export class CardScreens {
  private readonly container: HTMLDivElement;
  private readonly levelUp: LevelUpPicker;
  private readonly shop: ShopPicker;
  private readonly loadout: AbilityLoadout;
  private readonly toasts: ToastManager;

  /** Bekleyen seviye atlamaları — dalga sonunda sırayla sunulur. */
  private readonly pendingLevels: number[] = [];
  private levelUpOffer: CardDefinition[] = [];
  private shopOffer: CardDefinition[] = [];
  /** Bu dükkan ziyaretinde satın alınan kart kimlikleri (UI'da ALINDI). */
  private purchased = new Set<string>();
  /** Aynı kartın farklı örneklerini ayırt etmek için satın alınan instance'lar. */
  private purchasedInstanceIds = new Set<string>();
  /** Reroll'da korunacak teklifler. */
  private lockedOfferIds = new Set<string>();
  private rerollCost = economyConfig.reroll.baseCost;
  private shopWave = 0;
  private intermissionActive = false;
  private closeTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    parent: HTMLElement,
    private readonly cards: CardInventoryManager,
    private readonly economy: RunEconomy,
    private readonly callbacks: CardScreensCallbacks,
  ) {
    this.container = document.createElement('div');
    this.container.className = 'vol-card-layer';
    this.container.hidden = true;

    this.toasts = new ToastManager(parent.ownerDocument?.body ?? parent);

    this.levelUp = new LevelUpPicker({
      selectLabel: i18next.t('volhell:cards.ui.select'),
      onSelect: (cardId) => this.handleLevelUpSelect(cardId),
    });
    this.container.appendChild(this.levelUp.element);

    this.shop = new ShopPicker({
      labels: {
        buy: i18next.t('volhell:cards.ui.buy'),
        owned: i18next.t('volhell:cards.ui.owned'),
        tooExpensive: i18next.t('volhell:cards.ui.tooExpensive'),
        abilitiesTitle: i18next.t('volhell:cards.ui.abilitiesTitle'),
        passivesTitle: i18next.t('volhell:cards.ui.passivesTitle'),
        empty: i18next.t('volhell:cards.ui.inventoryEmpty'),
        close: i18next.t('volhell:cards.ui.continue'),
      },
      reroll: {
        label: i18next.t('volhell:cards.ui.reroll'),
        onReroll: () => this.handleReroll(),
      },
      lock: {
        lockLabel: i18next.t('volhell:cards.ui.lock'),
        unlockLabel: i18next.t('volhell:cards.ui.unlock'),
        onToggle: (cardId) => this.handleToggleLock(cardId),
      },
      onBuy: (cardId) => this.handleBuy(cardId),
      onSell: (instanceId) => this.handleSell(instanceId),
      onEquip: (instanceId) => this.handleEquipToFreeSlot(instanceId),
      onClose: () => this.closeIntermission(),
    });
    this.container.appendChild(this.shop.element);

    // Slotlar dükkan panelinin İÇİNDE: "elimde ne var, nereye takıyorum"
    // sorusu tek ekranda yanıtlanır.
    this.loadout = new AbilityLoadout(this.shop.slotArea, {
      onAssign: (instanceId, slot) => this.handleAssign(instanceId, slot),
      onClear: (slot) => this.handleClear(slot),
    });

    parent.appendChild(this.container);
  }

  isOpen(): boolean {
    return this.intermissionActive;
  }

  /** Bekleyen seviye atlaması sayısı — HUD göstergesi için. */
  getPendingLevelUpCount(): number {
    return this.pendingLevels.length;
  }

  /**
   * Seviye atlandı — kart seçimi HEMEN açılmaz, dalga sonuna kuyruğa alınır.
   */
  queueLevelUp(level: number): void {
    this.pendingLevels.push(level);
  }

  /**
   * Dalga bitti — önce bekleyen kart seçimleri sırayla, sonra dükkan.
   */
  openIntermission(wave: number): void {
    this.shopWave = wave;
    this.purchased = new Set();
    this.purchasedInstanceIds = new Set();
    // Kilitli teklifler wave'ler arasında korunur; burada SIFIRLANMAZ.
    this.rerollCost = economyConfig.reroll.baseCost;
    this.intermissionActive = true;
    this.container.hidden = false;
    this.callbacks.onOpen();
    this.advanceIntermission();
  }

  /** Dil değişiminde metinleri tazeler (ekran kapalıyken de güvenli). */
  refreshLabels(): void {
    if (this.shop.isVisible()) {
      this.shop.render(this.buildShopState());
      this.refreshLoadout();
    }
  }

  destroy(): void {
    if (this.closeTimeout !== null) {
      clearTimeout(this.closeTimeout);
      this.closeTimeout = null;
    }
    this.levelUp.destroy();
    this.shop.destroy();
    this.loadout.destroy();
    this.toasts.destroy();
    this.container.remove();
    this.pendingLevels.length = 0;
    this.intermissionActive = false;
  }

  /** Kuyrukta seviye varsa sıradakini, yoksa dükkanı açar. */
  private advanceIntermission(): void {
    const level = this.pendingLevels.shift();
    if (level === undefined) {
      this.openShop();
      return;
    }

    this.levelUpOffer = this.cards.drawOffer(2);
    // Havuz tükendiyse seçim ekranını boş açmak yerine atla.
    if (this.levelUpOffer.length === 0) {
      this.advanceIntermission();
      return;
    }

    // hideImmediately() (animasyonsuz) BİLEREK kullanılır: level-up ve dükkan
    // AYNI paylaşılan `.vol-card-layer` içinde yaşıyor (bkz. constructor).
    // Animasyonlu hide() `hidden`'ı erteler (bkz. CardPicker.ts); bu iki panel
    // aynı flex konteynerde bir an üst üste biner/kayardı. Katman zaten açık
    // kalıyor, yalnızca İÇERİK değişiyor — levelUp'ın kendi giriş animasyonu
    // (`vol-card-picker-in`) geçişi zaten taşıyor.
    this.shop.hideImmediately();
    this.levelUp.present(
      this.levelUpOffer.map((card) => toCardTileData(card, { showType: true })),
      {
        title: i18next.t('volhell:cards.ui.levelUpTitle', { level }),
        hint: i18next.t('volhell:cards.ui.levelUpHint', { remaining: this.pendingLevels.length }),
      },
    );
  }

  private openShop(): void {
    // Teklifler wave'ler arasında kilitli kartları koruyarak tazelenir.
    // İlk açılışta shopOffer boş olduğu için SHOP_SIZE kadar yeni kart çekilir.
    this.refreshShopOffers();
    // hideImmediately() — bkz. advanceIntermission()'daki gerekçe, aynı katman içi takas.
    this.levelUp.hideImmediately();
    this.shop.present(this.buildShopState());
    this.refreshLoadout();
  }

  private closeIntermission(): void {
    // Panel kapanış animasyonu tamamlansın, ardından katman yok olsun.
    if (this.closeTimeout !== null) {
      clearTimeout(this.closeTimeout);
      this.closeTimeout = null;
    }
    this.levelUp.hide();
    this.shop.hide();
    this.closeTimeout = setTimeout(() => {
      this.closeTimeout = null;
      this.container.hidden = true;
      this.intermissionActive = false;
      this.callbacks.onClose();
    }, HIDE_ANIMATION_MS);
  }

  private handleLevelUpSelect(cardId: string): void {
    const card = this.levelUpOffer.find((offer) => offer.id === cardId);
    if (!card) return;

    const owned = this.cards.acquire(card);
    this.autoEquip(owned.instanceId, card);
    this.callbacks.onCardTaken?.('levelUp');
    // Sıradaki seviye ya da dükkan — ekran kapanmaz, akış devam eder.
    this.advanceIntermission();
  }

  private handleBuy(cardId: string): void {
    const card = this.shopOffer.find((offer) => offer.id === cardId);
    if (!card || this.purchased.has(cardId)) return;

    const owned = this.cards.purchase(card);
    if (!owned) {
      this.callbacks.onDeny?.();
      return;
    }

    this.purchased.add(cardId);
    this.purchasedInstanceIds.add(owned.instanceId);
    // Satın alınan kart artık reroll'da korunacak bir şey değil.
    this.lockedOfferIds.delete(cardId);
    this.autoEquip(owned.instanceId, card);
    this.callbacks.onCardTaken?.('shop');
    this.shop.render(this.buildShopState());
    this.refreshLoadout();
  }

  private handleSell(instanceId: string): void {
    const owned = this.cards.getOwned().find((card) => card.instanceId === instanceId);
    if (!owned) return;

    if (this.cards.sell(instanceId) <= 0) return;
    // Bu dükkan ziyaretinde satın alınıp aynı turda satılırsa teklif yeniden
    // seçilebilir olsun; aksi halde ALINDI ibaresi yanıltıcı kalır.
    if (this.purchasedInstanceIds.delete(instanceId)) {
      this.purchased.delete(owned.definition.id);
    }

    this.shop.render(this.buildShopState());
    this.refreshLoadout();
  }

  private handleReroll(): void {
    if (!this.economy.spendFlux(this.rerollCost)) {
      this.toasts.show(i18next.t('volhell:cards.ui.rerollTooExpensive'), { variant: 'warning' });
      this.callbacks.onDeny?.();
      return;
    }

    this.rerollCost += economyConfig.reroll.costStep;
    this.refreshShopOffers();
    this.callbacks.onReroll?.();
    // Panel reroll'u tahmin etmez; niyet açıkça bildirilir.
    this.shop.render(this.buildShopState('reroll'));
  }

  private handleToggleLock(cardId: string): void {
    if (this.lockedOfferIds.has(cardId)) {
      this.lockedOfferIds.delete(cardId);
    } else {
      this.lockedOfferIds.add(cardId);
    }
    this.callbacks.onLockToggle?.();
    this.shop.render(this.buildShopState());
  }

  private handleAssign(instanceId: string, slot: AbilitySlot): void {
    this.cards.equip(instanceId, slot);
    this.refreshLoadout();
    this.shop.render(this.buildShopState());
  }

  /** "TAK" butonu — boş slot varsa oraya, yoksa uyarı verir. */
  private handleEquipToFreeSlot(instanceId: string): void {
    const free = ABILITY_SLOTS.find((slot) => this.cards.getEquipped(slot) === null);
    if (!free) {
      this.toasts.show(i18next.t('volhell:cards.ui.noEmptySlot'), { variant: 'warning' });
      this.callbacks.onDeny?.();
      return;
    }

    this.handleAssign(instanceId, free);
  }

  private handleClear(slot: AbilitySlot): void {
    this.cards.unequip(slot);
    this.refreshLoadout();
    this.shop.render(this.buildShopState());
  }

  /** Boş slot varsa yeni alınan yetenek doğrudan oraya girer. */
  private autoEquip(instanceId: string, card: CardDefinition): void {
    if (card.type !== 'ability') return;

    for (const slot of ABILITY_SLOTS) {
      if (this.cards.getEquipped(slot)) continue;
      this.cards.equip(instanceId, slot);
      this.toasts.show(
        i18next.t('volhell:cards.ui.abilityAutoEquipped', {
          name: i18next.t(`volhell:${card.titleKey}` as 'volhell:cards.cardTurret.title'),
        }),
        { variant: 'success' },
      );
      return;
    }

    this.toasts.show(i18next.t('volhell:cards.ui.noEmptySlot'), { variant: 'warning' });
    this.callbacks.onDeny?.();
  }

  private refreshShopOffers(): void {
    // Kilitli tekliflerin hâlâ geçerli olup olmadığını kontrol et: aradan
    // geçen wave/level-up sonrası sahip olunan yetenek tekrar vitrinde
    // kalmamalı (drawOffer zaten ability çiftlemesini engeller).
    const ownedAbilityIds = this.getOwnedAbilityIds();
    const keep = this.shopOffer.filter(
      (card) =>
        this.lockedOfferIds.has(card.id) &&
        !this.purchased.has(card.id) &&
        !ownedAbilityIds.has(card.id),
    );

    // Artık geçersiz kilitleri temizle (sonraki render'da yanlış görünmesin).
    for (const card of this.shopOffer) {
      if (this.lockedOfferIds.has(card.id) && !keep.includes(card)) {
        this.lockedOfferIds.delete(card.id);
      }
    }

    const needed = Math.max(0, SHOP_SIZE - keep.length);
    const fresh = this.drawShopOffers(needed, new Set(keep.map((card) => card.id)));
    const freshQueue = [...fresh];

    // Kilitli teklifler aynı slotta kalmalı; yalnızca açık slotlara yeni kart
    // çekilir. Böylece ikinci slot kilitliyken birinci slot değişmez.
    //
    // Havuz istenen sayıyı karşılayamazsa slot BOŞ bırakılır. Önceki hâl o
    // durumda "o slottaki eski kartı" geri koyuyordu; eski kart aynı turda
    // başka bir slota çekilmişse teklif listesinde AYNI kart iki kez yer
    // alıyordu (ör. havuz 3 kart verebilirken 4 istenince `B, C, D, D`).
    // `ShopPicker` teklifleri id'ye göre Map'te tuttuğu için iki slot tek
    // karta çöküyor, kart sayısı sessizce azalıyordu. Az sayıda teklif
    // göstermek, aynı kartı iki kez göstermekten doğrudur.
    const used = new Set<string>();
    const nextOffers: CardDefinition[] = [];

    for (let i = 0; i < SHOP_SIZE; i++) {
      const current = this.shopOffer[i];
      const currentUsable =
        current !== undefined &&
        !this.purchased.has(current.id) &&
        !ownedAbilityIds.has(current.id) &&
        !used.has(current.id);

      if (currentUsable && this.lockedOfferIds.has(current.id)) {
        used.add(current.id);
        nextOffers.push(current);
        continue;
      }

      const drawn = freshQueue.shift();
      if (drawn !== undefined && !used.has(drawn.id)) {
        used.add(drawn.id);
        nextOffers.push(drawn);
      }
    }

    this.shopOffer = nextOffers;
  }

  /** Sahip olunan yetenek kartlarının id'leri — drawOffer ile aynı kuralla. */
  private getOwnedAbilityIds(): Set<string> {
    return new Set(
      this.cards
        .getOwned()
        .filter((entry) => entry.definition.type === 'ability')
        .map((entry) => entry.definition.id),
    );
  }

  private drawShopOffers(count: number, extraExclude?: ReadonlySet<string>): CardDefinition[] {
    if (count <= 0) return [];

    // Dükkan havuzu: sadece satın alınmış ve kilitli/korunacak teklifler
    // dışarıda bırakılır. Sahip olunan ability'ler zaten CardInventoryManager
    // drawOffer içinde; sahip olunan buff/takas kartları tekrar çıkabilir
    // (üst üste biner).
    const exclude = new Set<string>([...this.purchased, ...(extraExclude ?? [])]);
    return this.cards.drawOffer(count, { exclude });
  }

  private refreshLoadout(): void {
    this.loadout.render({
      equipped: {
        primary: this.cards.getEquipped('primary'),
        secondary: this.cards.getEquipped('secondary'),
      },
    });
  }

  private buildShopState(transition?: ShopPickerState['transition']): ShopPickerState {
    const flux = this.economy.getFlux();
    const owned = this.cards.getOwned();

    return {
      transition,
      offers: this.shopOffer.map((card) => ({
        card: toCardTileData(card, { showPrice: true, showType: true }),
        purchased: this.purchased.has(card.id),
        affordable: flux >= card.price,
        locked: this.lockedOfferIds.has(card.id),
      })),
      abilities: owned
        .filter((entry) => entry.definition.type === 'ability')
        .map((entry) => this.toInventoryEntry(entry, true)),
      passives: owned
        .filter((entry) => entry.definition.type !== 'ability')
        .map((entry) => this.toInventoryEntry(entry, false)),
      balanceLabel: i18next.t('volhell:cards.ui.balance', { amount: flux }),
      title: i18next.t('volhell:cards.ui.shopTitle', { wave: this.shopWave }),
      hint: i18next.t('volhell:cards.ui.shopHint'),
      reroll: {
        costLabel: i18next.t('volhell:cards.ui.price', { price: this.rerollCost }),
        affordable: flux >= this.rerollCost,
      },
    };
  }

  private toInventoryEntry(owned: OwnedCard, draggable: boolean): ShopInventoryEntry {
    const equippedSlot = ABILITY_SLOTS.find(
      (slot) => this.cards.getEquipped(slot)?.instanceId === owned.instanceId,
    );

    return {
      instanceId: owned.instanceId,
      card: toCardTileData(owned.definition, {
        showType: true,
        statusLabel: equippedSlot ? i18next.t('volhell:ability.equipped') : '',
      }),
      sellLabel: i18next.t('volhell:cards.ui.sell', {
        value: getCardSellValue(owned.definition.price),
      }),
      // Yetenek kartında ikinci buton: sürüklemeyi keşfetmeyen oyuncu da takabilsin.
      equipLabel: draggable && !equippedSlot ? i18next.t('volhell:ability.equip') : undefined,
      dragData: draggable ? owned.instanceId : undefined,
    };
  }
}
