import { CARD_PRICES } from '../prices';
import type { CardDefinition } from '../types';

/**
 * Ability kartları — her biri `ABILITY_CATALOG`'taki bir yeteneği verir.
 * Alındığında hemen aktif OLMAZ: envantere düşer, oyuncu Q ya da E slotuna atar.
 *
 * Aynı mekaniğin farklı kademeleri (Kule / Seri Kule / Kuşatma Kulesi) ayrı
 * kartlardır; rarity her kartın kendi tasarımına gömülüdür.
 */
export const ABILITY_CARDS: Record<string, CardDefinition> = {
  cardTurret: {
    id: 'cardTurret',
    type: 'ability',
    rarity: 'rare',
    titleKey: 'cards.cardTurret.title',
    descriptionKey: 'cards.cardTurret.desc',
    price: CARD_PRICES.rare,
    abilityId: 'turret',
  },
  cardChainLightning: {
    id: 'cardChainLightning',
    type: 'ability',
    rarity: 'rare',
    titleKey: 'cards.cardChainLightning.title',
    descriptionKey: 'cards.cardChainLightning.desc',
    price: CARD_PRICES.rare,
    abilityId: 'chainLightning',
  },
  cardFireZone: {
    id: 'cardFireZone',
    type: 'ability',
    rarity: 'rare',
    titleKey: 'cards.cardFireZone.title',
    descriptionKey: 'cards.cardFireZone.desc',
    price: CARD_PRICES.rare,
    abilityId: 'fireZone',
  },
  cardMultiShot: {
    id: 'cardMultiShot',
    type: 'ability',
    rarity: 'rare',
    titleKey: 'cards.cardMultiShot.title',
    descriptionKey: 'cards.cardMultiShot.desc',
    price: CARD_PRICES.rare,
    abilityId: 'multiShot',
  },

  cardTurretRapid: {
    id: 'cardTurretRapid',
    type: 'ability',
    rarity: 'epic',
    titleKey: 'cards.cardTurretRapid.title',
    descriptionKey: 'cards.cardTurretRapid.desc',
    price: CARD_PRICES.epic,
    abilityId: 'turretRapid',
  },
  cardChainSurge: {
    id: 'cardChainSurge',
    type: 'ability',
    rarity: 'epic',
    titleKey: 'cards.cardChainSurge.title',
    descriptionKey: 'cards.cardChainSurge.desc',
    price: CARD_PRICES.epic,
    abilityId: 'chainSurge',
  },
  cardEmberField: {
    id: 'cardEmberField',
    type: 'ability',
    rarity: 'epic',
    titleKey: 'cards.cardEmberField.title',
    descriptionKey: 'cards.cardEmberField.desc',
    price: CARD_PRICES.epic,
    abilityId: 'emberField',
  },
  cardScatterShot: {
    id: 'cardScatterShot',
    type: 'ability',
    rarity: 'epic',
    titleKey: 'cards.cardScatterShot.title',
    descriptionKey: 'cards.cardScatterShot.desc',
    price: CARD_PRICES.epic,
    abilityId: 'scatterShot',
  },

  cardTurretSiege: {
    id: 'cardTurretSiege',
    type: 'ability',
    rarity: 'legendary',
    titleKey: 'cards.cardTurretSiege.title',
    descriptionKey: 'cards.cardTurretSiege.desc',
    price: CARD_PRICES.legendary,
    abilityId: 'turretSiege',
  },
  cardChainStorm: {
    id: 'cardChainStorm',
    type: 'ability',
    rarity: 'legendary',
    titleKey: 'cards.cardChainStorm.title',
    descriptionKey: 'cards.cardChainStorm.desc',
    price: CARD_PRICES.legendary,
    abilityId: 'chainStorm',
  },
  cardInferno: {
    id: 'cardInferno',
    type: 'ability',
    rarity: 'legendary',
    titleKey: 'cards.cardInferno.title',
    descriptionKey: 'cards.cardInferno.desc',
    price: CARD_PRICES.legendary,
    abilityId: 'inferno',
  },
  cardBulletStorm: {
    id: 'cardBulletStorm',
    type: 'ability',
    rarity: 'legendary',
    titleKey: 'cards.cardBulletStorm.title',
    descriptionKey: 'cards.cardBulletStorm.desc',
    price: CARD_PRICES.legendary,
    abilityId: 'bulletStorm',
  },
};
