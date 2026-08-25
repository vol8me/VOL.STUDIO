import type { Random, StatModifier } from '@volstudio/core';
import type { HellStat, HellStatBlock } from '@/config/stats';
import { drawCards, getCardSellValue } from '@/config/cards';
import type { DrawCardsOptions } from '@/config/cards';
import type { CardConditionId, CardDefinition } from '@/config/cards/types';
import type { AbilityRuntime } from '@/runtime/ability/AbilityRuntime';
import { createAbility } from '@/runtime/ability/AbilityRuntime';
import type { AbilityUpgradeKey } from '@/runtime/ability/AbilityUpgrades';
import type { AbilitySlot } from '@/runtime/ability/types';
import type { RunEconomy } from './RunEconomy';
import { diagnostics } from '@/app/services';

/** Sahip olunan bir kart örneği — aynı kart birden fazla kez alınabilir. */
export interface OwnedCard {
  /**
   * Bu ALIMA özel kimlik (`camKanat#3`). Stat modifier'ları bu kimlikle
   * eklenir; aynı kartın kopyaları bağımsız yığılır ve satışta yalnızca
   * ilgili kopya geri alınır.
   */
  instanceId: string;
  definition: CardDefinition;
}

/**
 * Bir kartın uygulanmaya HAZIR etkisi — henüz uygulanmamış hâli.
 *
 * "Doğrula → kur → uygula" ayrımının orta adımı: hesaplama sırasında bir hata
 * çıkarsa hiçbir durum değişmemiş olur.
 */
interface PlannedCardEffect {
  modifiers: StatModifier<HellStat>[];
  upgrades: { key: AbilityUpgradeKey; amount: number }[];
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
  playerStats: HellStatBlock;
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
   *
   * Ek `exclude` verilirse bu kimlikler de havuz dışında bırakılır
   * (örn. dükkan reroll'da kilitli/purchased teklifler).
   */
  drawOffer(count = 2, options: DrawCardsOptions = {}): CardDefinition[] {
    const exclude = new Set([...this.getOwnedAbilityIds(), ...(options.exclude ?? [])]);
    return drawCards(this.deps.random, count, { ...options, exclude });
  }

  /**
   * Ücretsiz edinme (level-up seçimi) — kart hemen uygulanır.
   *
   * **İşlem sınırı:** etkiler önce planlanır, sonra tek noktada uygulanır ve
   * kart ancak uygulama başarılıysa envantere girer.
   */
  acquire(card: CardDefinition): OwnedCard {
    const instanceId = `${card.id}#${this.instanceCounter + 1}`;
    const owned: OwnedCard = { instanceId, definition: card };

    // Plan aşaması: hiçbir durum değişmez, yalnızca ne yapılacağı hesaplanır.
    const effect = this.planCardEffect(owned);

    // Commit aşaması: buradan sonrası tümü-ya-hiç.
    this.commitCardEffect(effect);
    this.owned.push(owned);
    this.instanceCounter++;

    diagnostics?.recordEvent('cardAcquired', { id: card.id, instanceId });
    return owned;
  }

  /**
   * Dükkandan satın alma — Flux yetmezse hiçbir şey değişmez.
   *
   * Harcama ile uygulama arasında bir hata olursa Flux GERİ VERİLİR: oyuncunun
   * parası gidip kartı gelmeme durumu, bir hata mesajından çok daha kötü bir
   * kayıptır.
   *
   * @returns Alınan kart örneği, yetersiz bakiyede null.
   */
  purchase(card: CardDefinition): OwnedCard | null {
    if (!this.deps.economy.spendFlux(card.price)) return null;

    try {
      return this.acquire(card);
    } catch (error) {
      this.deps.economy.addFlux(card.price);
      diagnostics?.recordEvent('cardPurchaseRolledBack', {
        id: card.id,
        price: card.price,
      });
      throw error;
    }
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

    diagnostics?.recordEvent('cardSold', { id: owned.definition.id, refund });
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
    return this.owned.slice();
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

  /**
   * Kartın etkisini HESAPLAR — hiçbir şeyi değiştirmez.
   *
   * Koşul closure'ları burada doğar; katalog saf veri olduğu için
   * `resolveCondition` bilinmeyen bir kimlikte fırlatırsa hata henüz hiçbir
   * durum değişmeden yakalanır.
   */
  private planCardEffect(owned: OwnedCard): PlannedCardEffect {
    const { definition, instanceId } = owned;

    const modifiers = (definition.modifiers ?? []).map((modifier) => ({
      id: instanceId,
      stat: modifier.stat,
      type: modifier.type,
      value: modifier.value,
      condition: modifier.conditionId ? this.resolveCondition(modifier.conditionId) : undefined,
    }));

    const upgrades = (definition.abilityUpgrades ?? []).map((upgrade) => ({
      key: upgrade.key,
      amount: upgrade.amount,
    }));

    return { modifiers, upgrades };
  }

  /** Planlanmış etkiyi uygular. Bu noktadan sonra doğrulama yapılmaz. */
  private commitCardEffect(effect: PlannedCardEffect): void {
    const appliedModifiers: StatModifier<HellStat>[] = [];
    const previousUpgrades = new Map<AbilityUpgradeKey, number>();
    for (const upgrade of effect.upgrades) {
      if (!previousUpgrades.has(upgrade.key)) {
        previousUpgrades.set(upgrade.key, this.deps.abilities.upgrades.get(upgrade.key));
      }
    }

    try {
      for (const modifier of effect.modifiers) {
        this.deps.playerStats.addModifier(modifier);
        appliedModifiers.push(modifier);
      }
      for (const upgrade of effect.upgrades) {
        this.deps.abilities.upgrades.add(upgrade.key, upgrade.amount);
      }
    } catch (error) {
      // Stat/ability katmanı kısmi uygulamadan sonra fırlatabilir. Kartın
      // envantere girmemesi tek başına yetmez; daha önce uygulanan parçalar da
      // geri alınmazsa görünmez bir buff kalır.
      for (const modifier of appliedModifiers) {
        this.deps.playerStats.removeModifier(modifier.id);
      }
      for (const [key, value] of previousUpgrades) {
        this.deps.abilities.upgrades.restore(key, value);
      }
      throw error;
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
