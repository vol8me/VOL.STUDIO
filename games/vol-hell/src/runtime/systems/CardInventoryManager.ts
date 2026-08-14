import type { Random, StatBlock } from '@volstudio/core';
import { Diagnostics } from '@volstudio/core';
import { drawCards, getCardSellValue } from '@/config/cards';
import type { CardConditionId, CardDefinition } from '@/config/cards/types';
import type { AbilityRuntime } from '@/runtime/ability/AbilityRuntime';
import { createAbility } from '@/runtime/ability/AbilityRuntime';
import type { AbilitySlot } from '@/runtime/ability/types';
import type { RunEconomy } from './RunEconomy';

/** Sahip olunan bir kart örneği — aynı kart birden fazla kez alınabilir. */
export interface OwnedCard {
  /**
   * Bu ALIMA özel kimlik (`camKanat#3`). Stat modifier'ları bu kimlikle
   * eklenir: aynı kartın ikinci kopyası öncekinin üstüne yazmak yerine
   * gerçekten üst üste biner, satışta da yalnızca o kopya geri alınır.
   */
  instanceId: string;
  definition: CardDefinition;
}

/** Koşullu takas kartlarının okuduğu canlı oyun durumu. */
export interface CardConditionSources {
  /** Sahnede ayakta bir kule var mı? */
  hasActiveTurret(): boolean;
  /** Oyuncunun canı kritik eşiğin altında mı? */
  isLowHealth(): boolean;
  /** Her iki ability slotu da dolu mu? */
  areBothSlotsFilled(): boolean;
}

export interface CardInventoryDeps {
  random: Random;
  playerStats: StatBlock;
  abilities: AbilityRuntime;
  economy: RunEconomy;
  conditions: CardConditionSources;
}

/**
 * Kart yönetimi — çekme, edinme, satın alma, satma ve etkileri uygulama.
 *
 * UI'DAN TAMAMEN BAĞIMSIZDIR: level-up ekranı da dükkan ekranı da yalnızca bu
 * katmanı çağırır. Böylece kart mantığı DOM'suz test edilebilir ve ileride
 * farklı bir arayüz (dokunmatik, gamepad) aynı mantığı kullanabilir.
 */
export class CardInventoryManager {
  private readonly owned: OwnedCard[] = [];
  private instanceCounter = 0;

  constructor(private readonly deps: CardInventoryDeps) {}

  /**
   * Level-up teklifi — ücretsiz seçim için kart çeker.
   * Sahip olunan ABILITY kartları tekrar çıkmaz (aynı yeteneğin ikinci kopyası
   * işe yaramaz); buff/takas kartları tekrar çıkabilir ve üst üste biner.
   */
  drawOffer(count = 2): CardDefinition[] {
    return drawCards(this.deps.random, count, { exclude: this.getOwnedAbilityIds() });
  }

  /** Ücretsiz edinme (level-up seçimi) — kart hemen uygulanır. */
  acquire(card: CardDefinition): OwnedCard {
    const instanceId = `${card.id}#${++this.instanceCounter}`;
    const owned: OwnedCard = { instanceId, definition: card };
    this.owned.push(owned);
    this.applyCard(owned);

    Diagnostics.getInstance()?.recordEvent('cardAcquired', { id: card.id, instanceId });
    return owned;
  }

  /**
   * Dükkandan satın alma — Flux yetmezse hiçbir şey değişmez.
   * @returns Alınan kart örneği, yetersiz bakiyede null.
   */
  purchase(card: CardDefinition): OwnedCard | null {
    if (!this.deps.economy.spendFlux(card.price)) return null;
    return this.acquire(card);
  }

  /**
   * Kartı geri satar: etkileri geri alınır, fiyatın bir kısmı Flux olarak döner.
   * @returns İade edilen Flux; kart bulunamazsa 0.
   */
  sell(instanceId: string): number {
    const index = this.owned.findIndex((card) => card.instanceId === instanceId);
    if (index < 0) return 0;

    const owned = this.owned[index];
    this.revertCard(owned);
    this.owned.splice(index, 1);

    const refund = getCardSellValue(owned.definition.price);
    this.deps.economy.addFlux(refund);

    Diagnostics.getInstance()?.recordEvent('cardSold', { id: owned.definition.id, refund });
    return refund;
  }

  /** Kartı bir ability slotuna atar. Ability kartı değilse false döner. */
  equip(instanceId: string, slot: AbilitySlot): boolean {
    const owned = this.owned.find((card) => card.instanceId === instanceId);
    const abilityId = owned?.definition.abilityId;
    if (!owned || !abilityId) return false;

    // Aynı kart diğer slottaysa taşınır; iki slotta aynı yetenek durmasın.
    for (const other of ['primary', 'secondary'] as AbilitySlot[]) {
      if (other !== slot && this.equipped.get(other) === instanceId) {
        this.unequip(other);
      }
    }

    this.deps.abilities.assign(slot, createAbility(abilityId));
    this.equipped.set(slot, instanceId);
    return true;
  }

  /** Slotu boşaltır. */
  unequip(slot: AbilitySlot): void {
    this.deps.abilities.assign(slot, null);
    this.equipped.delete(slot);
  }

  /** Verilen slotta duran kart örneği (yoksa null). */
  getEquipped(slot: AbilitySlot): OwnedCard | null {
    const instanceId = this.equipped.get(slot);
    if (!instanceId) return null;
    return this.owned.find((card) => card.instanceId === instanceId) ?? null;
  }

  /** Sahip olunan tüm kartlar. */
  getOwned(): readonly OwnedCard[] {
    return this.owned;
  }

  /** Sahip olunan ability kartları — slot atama UI'ı bunları listeler. */
  getOwnedAbilityCards(): OwnedCard[] {
    return this.owned.filter((card) => card.definition.type === 'ability');
  }

  private readonly equipped = new Map<AbilitySlot, string>();

  private getOwnedAbilityIds(): Set<string> {
    return new Set(
      this.owned
        .filter((card) => card.definition.type === 'ability')
        .map((card) => card.definition.id),
    );
  }

  /** Kartın stat ve ability etkilerini devreye alır. */
  private applyCard(owned: OwnedCard): void {
    const { definition, instanceId } = owned;

    for (const modifier of definition.modifiers ?? []) {
      this.deps.playerStats.addModifier({
        id: instanceId,
        stat: modifier.stat,
        type: modifier.type,
        value: modifier.value,
        condition: modifier.conditionId ? this.resolveCondition(modifier.conditionId) : undefined,
      });
    }

    for (const upgrade of definition.abilityUpgrades ?? []) {
      this.deps.abilities.upgrades.add(upgrade.key, upgrade.amount);
    }
  }

  /** Kartın etkilerini geri alır (satış). */
  private revertCard(owned: OwnedCard): void {
    this.deps.playerStats.removeModifier(owned.instanceId);

    for (const upgrade of owned.definition.abilityUpgrades ?? []) {
      this.deps.abilities.upgrades.add(upgrade.key, -upgrade.amount);
    }

    // Satılan ability kartı slotta duruyorsa slot boşalır.
    for (const slot of ['primary', 'secondary'] as AbilitySlot[]) {
      if (this.equipped.get(slot) === owned.instanceId) {
        this.unequip(slot);
      }
    }
  }

  /**
   * Koşul kimliğini canlı bir predicate'e çevirir.
   * Katalog saf veridir; closure'lar yalnızca burada doğar.
   */
  private resolveCondition(conditionId: CardConditionId): () => boolean {
    const { conditions } = this.deps;
    switch (conditionId) {
      case 'turretActive':
        return () => conditions.hasActiveTurret();
      case 'lowHealth':
        return () => conditions.isLowHealth();
      case 'bothSlotsFilled':
        return () => conditions.areBothSlotsFilled();
    }
  }
}
