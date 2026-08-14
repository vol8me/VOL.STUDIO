import { CARD_PRICES } from '../prices';
import type { CardDefinition } from '../types';

/**
 * Buff kartları — slot gerektirmez, alındığı an devreye girer.
 *
 * `fireRate` bir BEKLEME süresidir: değeri DÜŞÜREN modifier ateşi hızlandırır.
 * Kart metinleri her zaman etkiyi anlatır ("%10 daha hızlı"), ham çarpanı değil.
 */
export const BUFF_CARDS: Record<string, CardDefinition> = {
  // --- rare ---------------------------------------------------------------
  keskinUc: {
    id: 'keskinUc',
    type: 'buff',
    rarity: 'rare',
    titleKey: 'cards.keskinUc.title',
    descriptionKey: 'cards.keskinUc.desc',
    price: CARD_PRICES.rare,
    modifiers: [{ stat: 'damage', type: 'multiply', value: 1.15 }],
  },
  hafifBotlar: {
    id: 'hafifBotlar',
    type: 'buff',
    rarity: 'rare',
    titleKey: 'cards.hafifBotlar.title',
    descriptionKey: 'cards.hafifBotlar.desc',
    price: CARD_PRICES.rare,
    modifiers: [{ stat: 'speed', type: 'multiply', value: 1.12 }],
  },
  takviyeliGovde: {
    id: 'takviyeliGovde',
    type: 'buff',
    rarity: 'rare',
    titleKey: 'cards.takviyeliGovde.title',
    descriptionKey: 'cards.takviyeliGovde.desc',
    price: CARD_PRICES.rare,
    modifiers: [{ stat: 'health', type: 'add', value: 25 }],
  },
  yagliTetik: {
    id: 'yagliTetik',
    type: 'buff',
    rarity: 'rare',
    titleKey: 'cards.yagliTetik.title',
    descriptionKey: 'cards.yagliTetik.desc',
    price: CARD_PRICES.rare,
    // fireRate = bekleme süresi; 0.9 çarpanı %10 daha hızlı ateş demek.
    modifiers: [{ stat: 'fireRate', type: 'multiply', value: 0.9 }],
  },
  catalDil: {
    id: 'catalDil',
    type: 'buff',
    rarity: 'rare',
    titleKey: 'cards.catalDil.title',
    descriptionKey: 'cards.catalDil.desc',
    price: CARD_PRICES.rare,
    abilityUpgrades: [{ key: 'chainBounces', amount: 1 }],
  },

  // --- epic ---------------------------------------------------------------
  agirNamlu: {
    id: 'agirNamlu',
    type: 'buff',
    rarity: 'epic',
    titleKey: 'cards.agirNamlu.title',
    descriptionKey: 'cards.agirNamlu.desc',
    price: CARD_PRICES.epic,
    modifiers: [{ stat: 'damage', type: 'multiply', value: 1.3 }],
  },
  tepkiKontrol: {
    id: 'tepkiKontrol',
    type: 'buff',
    rarity: 'epic',
    titleKey: 'cards.tepkiKontrol.title',
    descriptionKey: 'cards.tepkiKontrol.desc',
    price: CARD_PRICES.epic,
    modifiers: [{ stat: 'fireRate', type: 'multiply', value: 0.78 }],
  },
  zirhKaplama: {
    id: 'zirhKaplama',
    type: 'buff',
    rarity: 'epic',
    titleKey: 'cards.zirhKaplama.title',
    descriptionKey: 'cards.zirhKaplama.desc',
    price: CARD_PRICES.epic,
    modifiers: [{ stat: 'health', type: 'add', value: 60 }],
  },
  bakirNamlu: {
    id: 'bakirNamlu',
    type: 'buff',
    rarity: 'epic',
    titleKey: 'cards.bakirNamlu.title',
    descriptionKey: 'cards.bakirNamlu.desc',
    price: CARD_PRICES.epic,
    abilityUpgrades: [{ key: 'turretDamage', amount: 8 }],
  },

  // --- legendary ----------------------------------------------------------
  yikimProtokolu: {
    id: 'yikimProtokolu',
    type: 'buff',
    rarity: 'legendary',
    titleKey: 'cards.yikimProtokolu.title',
    descriptionKey: 'cards.yikimProtokolu.desc',
    price: CARD_PRICES.legendary,
    modifiers: [{ stat: 'damage', type: 'multiply', value: 1.6 }],
  },
  sonsuzTetik: {
    id: 'sonsuzTetik',
    type: 'buff',
    rarity: 'legendary',
    titleKey: 'cards.sonsuzTetik.title',
    descriptionKey: 'cards.sonsuzTetik.desc',
    price: CARD_PRICES.legendary,
    modifiers: [{ stat: 'fireRate', type: 'multiply', value: 0.6 }],
  },
  ekNamlu: {
    id: 'ekNamlu',
    type: 'buff',
    rarity: 'legendary',
    titleKey: 'cards.ekNamlu.title',
    descriptionKey: 'cards.ekNamlu.desc',
    price: CARD_PRICES.legendary,
    abilityUpgrades: [{ key: 'multiShotProjectiles', amount: 2 }],
  },
  korYakit: {
    id: 'korYakit',
    type: 'buff',
    rarity: 'legendary',
    titleKey: 'cards.korYakit.title',
    descriptionKey: 'cards.korYakit.desc',
    price: CARD_PRICES.legendary,
    abilityUpgrades: [{ key: 'fireZoneDurationMs', amount: 2500 }],
  },
};
