import type { HellStat } from '@/config/stats';
import type { AbilityUpgradeKey } from '@/runtime/ability/AbilityUpgrades';

/**
 * Kart tipi.
 * - `ability`: Q/E slotuna atanabilen aktif yetenek verir.
 * - `buff`: alındığı an devreye giren kalıcı iyileştirme (slot gerektirmez).
 * - `tradeoff`: bir şeyi güçlendirip başka bir şeyi zayıflatan takas.
 */
export type CardType = 'ability' | 'buff' | 'tradeoff';

/**
 * Nadirlik. KARTIN KENDİ TASARIMINA GÖMÜLÜ sabit bir niteliktir — çekildikten
 * sonra rastgele atanan bir güç seviyesi DEĞİLDİR. "Kule" doğası gereği rare,
 * "Kuşatma Kulesi" doğası gereği legendary'dir; bunlar aynı kartın iki
 * versiyonu değil, bağımsız tasarlanmış iki karttır. RNG yalnızca HANGİ kartın
 * havuzdan çekileceğini belirler (bkz. `drawCards` ağırlıkları).
 */
export type CardRarity = 'rare' | 'epic' | 'legendary';

/**
 * Koşullu takas kartlarının bağlandığı durum kimlikleri.
 *
 * Katalog SAF VERİDİR; closure taşımaz. Koşul, kart uygulanırken
 * `CardInventoryManager`'daki predicate tablosundan çözülür — böylece katalog
 * test edilebilir/serileştirilebilir kalır.
 */
export type CardConditionId =
  /** Sahnede ayakta bir kule varken. */
  | 'turretActive'
  /** Oyuncunun canı kritik eşiğin altındayken. */
  | 'lowHealth'
  /** Her iki ability slotu da doluyken. */
  | 'bothSlotsFilled';

/** Karttan gelen stat modifier'ı — `StatBlock` modifier'ının veri hali. */
export interface CardStatModifier {
  stat: HellStat;
  type: 'add' | 'multiply';
  value: number;
  /** Verilirse modifier yalnızca bu koşul doğruyken uygulanır. */
  conditionId?: CardConditionId;
}

/** Karttan gelen ability parametresi artışı (sıçrama sayısı, kule hasarı…). */
export interface CardAbilityUpgrade {
  key: AbilityUpgradeKey;
  amount: number;
}

export interface CardDefinition {
  /** Katalog anahtarı ile aynı olmalıdır. */
  id: string;
  type: CardType;
  rarity: CardRarity;
  /** i18n anahtarı (`volhell:` namespace) — UI metni buradan çözülür. */
  titleKey: string;
  descriptionKey: string;
  /** Dükkanda satılma fiyatı (Flux). */
  price: number;
  /** `type === 'ability'` ise zorunlu — `ABILITY_CATALOG` kimliği. */
  abilityId?: string;
  /** `type === 'buff' | 'tradeoff'` ise stat etkileri. */
  modifiers?: CardStatModifier[];
  /** Ability'e özel parametre artışları (her tipte kullanılabilir). */
  abilityUpgrades?: CardAbilityUpgrade[];
}

/** `findCards` sorgu alanları. */
export interface FindCardsQuery {
  type?: CardType;
  rarity?: CardRarity;
  /** Bu kimlikler sonuç dışında bırakılır (zaten sahip olunan kartlar). */
  exclude?: ReadonlySet<string>;
}
