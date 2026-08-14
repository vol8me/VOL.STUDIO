import type { CardRarity } from './types';

/**
 * Nadirliğe göre dükkan fiyatları (Flux).
 *
 * Ölçek düşman ödülleriyle hizalıdır: grunt 1, lancer 1, brooder 2 Flux
 * düşürür; 40 saniyelik bir dalgada toplanabilen Flux kabaca 15-25 arası.
 * Yani rare kart ~yarım dalga, legendary kart ~iki dalga birikim ister.
 */
export const CARD_PRICES: Record<CardRarity, number> = {
  rare: 10,
  epic: 18,
  legendary: 32,
};

/**
 * Kart geri satıldığında iade edilen oran. Yarısı geri döner: yanlış kart
 * almak cezasız olmasın ama kartla oynayıp fikir değiştirmek de mümkün olsun.
 */
export const CARD_SELL_REFUND_RATIO = 0.5;

/** Bir kartın geri satış değeri (aşağı yuvarlanır, en az 1 Flux). */
export function getCardSellValue(price: number): number {
  return Math.max(1, Math.floor(price * CARD_SELL_REFUND_RATIO));
}
