import { CARD_PRICES } from '../prices';
import type { CardDefinition } from '../types';

/**
 * Takas kartları — bir şeyi güçlendirip başkasını zayıflatır.
 *
 * İki tür vardır: KALICI takaslar (koşulsuz modifier) ve KOŞULLU takaslar
 * (`conditionId` doluysa yalnızca o durum doğruyken geçerli). Koşul, kart
 * uygulanırken predicate tablosundan çözülür.
 */
export const TRADEOFF_CARDS: Record<string, CardDefinition> = {
  // --- rare ---------------------------------------------------------------
  camKanat: {
    id: 'camKanat',
    type: 'tradeoff',
    rarity: 'rare',
    titleKey: 'cards.camKanat.title',
    descriptionKey: 'cards.camKanat.desc',
    price: CARD_PRICES.rare,
    modifiers: [
      { stat: 'damage', type: 'multiply', value: 1.35 },
      { stat: 'health', type: 'multiply', value: 0.75 },
    ],
  },
  agirZirh: {
    id: 'agirZirh',
    type: 'tradeoff',
    rarity: 'rare',
    titleKey: 'cards.agirZirh.title',
    descriptionKey: 'cards.agirZirh.desc',
    price: CARD_PRICES.rare,
    modifiers: [
      { stat: 'health', type: 'add', value: 70 },
      { stat: 'speed', type: 'multiply', value: 0.85 },
    ],
  },

  // --- epic ---------------------------------------------------------------
  riskliTeknik: {
    id: 'riskliTeknik',
    type: 'tradeoff',
    rarity: 'epic',
    titleKey: 'cards.riskliTeknik.title',
    descriptionKey: 'cards.riskliTeknik.desc',
    price: CARD_PRICES.epic,
    modifiers: [
      { stat: 'damage', type: 'multiply', value: 1.5 },
      // fireRate = bekleme; 1.2 çarpanı ateşi YAVAŞLATIR.
      { stat: 'fireRate', type: 'multiply', value: 1.2 },
    ],
  },
  kuleBagi: {
    id: 'kuleBagi',
    type: 'tradeoff',
    rarity: 'epic',
    titleKey: 'cards.kuleBagi.title',
    descriptionKey: 'cards.kuleBagi.desc',
    price: CARD_PRICES.epic,
    modifiers: [
      { stat: 'damage', type: 'multiply', value: 1.35, conditionId: 'turretActive' },
      { stat: 'speed', type: 'multiply', value: 0.9, conditionId: 'turretActive' },
    ],
  },

  // --- legendary ----------------------------------------------------------
  olumeYakin: {
    id: 'olumeYakin',
    type: 'tradeoff',
    rarity: 'legendary',
    titleKey: 'cards.olumeYakin.title',
    descriptionKey: 'cards.olumeYakin.desc',
    price: CARD_PRICES.legendary,
    modifiers: [
      // Bedel KALICI, kazanç KOŞULLU: kart oyuncuyu bilerek riskli bir can
      // aralığında oynamaya iter. Koşulsuz bir kaybı olmasaydı bu bir takas
      // değil, saf buff olurdu.
      { stat: 'health', type: 'multiply', value: 0.85 },
      { stat: 'damage', type: 'multiply', value: 2, conditionId: 'lowHealth' },
      { stat: 'speed', type: 'multiply', value: 1.25, conditionId: 'lowHealth' },
    ],
  },
  sonSilah: {
    id: 'sonSilah',
    type: 'tradeoff',
    rarity: 'legendary',
    titleKey: 'cards.sonSilah.title',
    descriptionKey: 'cards.sonSilah.desc',
    price: CARD_PRICES.legendary,
    modifiers: [
      { stat: 'damage', type: 'multiply', value: 1.8 },
      { stat: 'health', type: 'multiply', value: 0.6 },
    ],
  },
};
