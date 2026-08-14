import {
  LevelUpPicker,
  ShopPicker,
  i18next,
  type ShopInventoryEntry,
  type ShopPickerState,
} from '@volstudio/core';
import type { CardDefinition } from '@/config/cards/types';
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
  /** Kart edinildi — efekt/ses için. */
  onCardTaken?: (card: CardDefinition) => void;
}

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

  /** Bekleyen seviye atlamaları — dalga sonunda sırayla sunulur. */
  private readonly pendingLevels: number[] = [];
  private levelUpOffer: CardDefinition[] = [];
  private shopOffer: CardDefinition[] = [];
  private purchased = new Set<string>();
  private shopWave = 0;
  private intermissionActive = false;

  constructor(
    parent: HTMLElement,
    private readonly cards: CardInventoryManager,
    private readonly economy: RunEconomy,
    private readonly callbacks: CardScreensCallbacks,
  ) {
    this.container = document.createElement('div');
    this.container.className = 'vol-card-layer';
    this.container.hidden = true;

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
    this.levelUp.destroy();
    this.shop.destroy();
    this.loadout.destroy();
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

    this.shop.hide();
    this.levelUp.present(
      this.levelUpOffer.map((card) => toCardTileData(card, { showType: true })),
      {
        title: i18next.t('volhell:cards.ui.levelUpTitle', { level }),
        hint: i18next.t('volhell:cards.ui.levelUpHint', { remaining: this.pendingLevels.length }),
      },
    );
  }

  private openShop(): void {
    // Teklif dükkan AÇILIRKEN çekilir: seviye ekranında alınan yetenek
    // kartının aynısı vitrinde tekrar görünmesin.
    this.shopOffer = this.cards.drawOffer(2);
    this.levelUp.hide();
    this.shop.present(this.buildShopState());
    this.refreshLoadout();
  }

  private closeIntermission(): void {
    this.levelUp.hide();
    this.shop.hide();
    this.container.hidden = true;
    this.intermissionActive = false;
    this.callbacks.onClose();
  }

  private handleLevelUpSelect(cardId: string): void {
    const card = this.levelUpOffer.find((offer) => offer.id === cardId);
    if (!card) return;

    const owned = this.cards.acquire(card);
    this.autoEquip(owned.instanceId, card);
    this.callbacks.onCardTaken?.(card);
    // Sıradaki seviye ya da dükkan — ekran kapanmaz, akış devam eder.
    this.advanceIntermission();
  }

  private handleBuy(cardId: string): void {
    const card = this.shopOffer.find((offer) => offer.id === cardId);
    if (!card || this.purchased.has(cardId)) return;

    const owned = this.cards.purchase(card);
    if (!owned) return;

    this.purchased.add(cardId);
    this.autoEquip(owned.instanceId, card);
    this.callbacks.onCardTaken?.(card);
    this.shop.render(this.buildShopState());
    this.refreshLoadout();
  }

  private handleSell(instanceId: string): void {
    if (this.cards.sell(instanceId) <= 0) return;
    this.shop.render(this.buildShopState());
    this.refreshLoadout();
  }

  private handleAssign(instanceId: string, slot: AbilitySlot): void {
    this.cards.equip(instanceId, slot);
    this.refreshLoadout();
    this.shop.render(this.buildShopState());
  }

  /** "TAK" butonu — boş slot varsa oraya, yoksa ilk slota yerleştirir. */
  private handleEquipToFreeSlot(instanceId: string): void {
    const slots: AbilitySlot[] = ['primary', 'secondary'];
    const free = slots.find((slot) => this.cards.getEquipped(slot) === null);
    this.handleAssign(instanceId, free ?? 'primary');
  }

  private handleClear(slot: AbilitySlot): void {
    this.cards.unequip(slot);
    this.refreshLoadout();
    this.shop.render(this.buildShopState());
  }

  /** Boş slot varsa yeni alınan yetenek doğrudan oraya girer. */
  private autoEquip(instanceId: string, card: CardDefinition): void {
    if (card.type !== 'ability') return;

    for (const slot of ['primary', 'secondary'] as AbilitySlot[]) {
      if (this.cards.getEquipped(slot)) continue;
      this.cards.equip(instanceId, slot);
      return;
    }
  }

  private refreshLoadout(): void {
    this.loadout.render({
      equipped: {
        primary: this.cards.getEquipped('primary'),
        secondary: this.cards.getEquipped('secondary'),
      },
    });
  }

  private buildShopState(): ShopPickerState {
    const flux = this.economy.getFlux();
    const owned = this.cards.getOwned();

    return {
      offers: this.shopOffer.map((card) => ({
        card: toCardTileData(card, { showPrice: true, showType: true }),
        purchased: this.purchased.has(card.id),
        affordable: flux >= card.price,
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
    };
  }

  private toInventoryEntry(owned: OwnedCard, draggable: boolean): ShopInventoryEntry {
    const equippedSlot = (['primary', 'secondary'] as AbilitySlot[]).find(
      (slot) => this.cards.getEquipped(slot)?.instanceId === owned.instanceId,
    );

    return {
      instanceId: owned.instanceId,
      card: toCardTileData(owned.definition, {
        showType: true,
        statusLabel: equippedSlot ? i18next.t('volhell:ability.equipped') : undefined,
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
