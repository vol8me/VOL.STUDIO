import type { Random } from '@volstudio/core';
import type { CardDefinition, CardRarity, FindCardsQuery } from '../types';
import { ABILITY_CARDS } from './ability';
import { BUFF_CARDS } from './buff';
import { TRADEOFF_CARDS } from './tradeoff';

/**
 * Tüm kartların kataloğu — tip başına ayrı dosya (ses preset kataloğuyla
 * aynı desen), böylece yeni kartın nereye yazılacağı aranmaz.
 */
export const CARD_CATALOG: Record<string, CardDefinition> = {
  ...ABILITY_CARDS,
  ...BUFF_CARDS,
  ...TRADEOFF_CARDS,
};

/**
 * Nadirliğin ÇEKİLME olasılığı. Kartın rarity alanından bağımsızdır: rarity
 * kartın tasarımına gömülüdür, bu tablo yalnızca havuzdan hangi kademenin ne
 * sıklıkla çıkacağını belirler.
 */
export const DEFAULT_RARITY_WEIGHTS: Record<CardRarity, number> = {
  rare: 62,
  epic: 28,
  legendary: 10,
};

export interface DrawCardsOptions {
  /** Bu kimlikler çekilmez (zaten sahip olunan kartlar). */
  exclude?: ReadonlySet<string>;
  /** Nadirlik çekilme ağırlıkları — verilmezse varsayılan tablo. */
  rarityWeights?: Record<CardRarity, number>;
}

/** Katalogda kart arar; sorgu alanları AND ile birleşir. */
export function findCards(query: FindCardsQuery = {}): string[] {
  return Object.entries(CARD_CATALOG)
    .filter(([id, card]) => {
      if (query.type && card.type !== query.type) return false;
      if (query.rarity && card.rarity !== query.rarity) return false;
      if (query.exclude?.has(id)) return false;
      return true;
    })
    .map(([id]) => id);
}

/** Tanımı kimliğe göre getirir; bilinmeyen kimlikte hata fırlatır. */
export function getCardDefinition(id: string): CardDefinition {
  const card = CARD_CATALOG[id];
  if (!card) {
    throw new Error(`[CARD_CATALOG] Bilinmeyen kart kimliği: ${id}`);
  }
  return card;
}

/**
 * Havuzdan `count` adet FARKLI kart çeker.
 *
 * Önce nadirlik kademesi ağırlıklı seçilir, sonra o kademeden eşit olasılıkla
 * bir kart alınır. Seçilen kademede uygun kart kalmadıysa kademe listeden
 * düşer ve çekim kalanlarla sürer — havuz tükenirse istenenden az kart döner.
 *
 * Seçim tamamen verilen seed'li PRNG üzerinden yapılır.
 */
export function drawCards(
  random: Random,
  count: number,
  options: DrawCardsOptions = {},
): CardDefinition[] {
  const weights = options.rarityWeights ?? DEFAULT_RARITY_WEIGHTS;
  const taken = new Set<string>(options.exclude ?? []);
  const result: CardDefinition[] = [];

  for (let i = 0; i < count; i++) {
    const pools = buildRarityPools(taken, weights);
    if (pools.length === 0) break;

    const picked = pickFromPools(random, pools);
    if (!picked) break;

    taken.add(picked.id);
    result.push(picked);
  }

  return result;
}

interface RarityPool {
  rarity: CardRarity;
  weight: number;
  ids: string[];
}

/** Elenmemiş kartları nadirliğe göre gruplar; boş kademeler dışarıda kalır. */
function buildRarityPools(
  exclude: ReadonlySet<string>,
  weights: Record<CardRarity, number>,
): RarityPool[] {
  const pools: RarityPool[] = [];

  for (const rarity of Object.keys(weights) as CardRarity[]) {
    const weight = weights[rarity];
    if (weight <= 0) continue;

    const ids = findCards({ rarity, exclude });
    if (ids.length === 0) continue;

    pools.push({ rarity, weight, ids });
  }

  return pools;
}

function pickFromPools(random: Random, pools: RarityPool[]): CardDefinition | null {
  const totalWeight = pools.reduce((sum, pool) => sum + pool.weight, 0);
  if (totalWeight <= 0) return null;

  let roll = random.next() * totalWeight;
  let chosen = pools[pools.length - 1];
  for (const pool of pools) {
    roll -= pool.weight;
    if (roll <= 0) {
      chosen = pool;
      break;
    }
  }

  const index = Math.min(chosen.ids.length - 1, Math.floor(random.next() * chosen.ids.length));
  return CARD_CATALOG[chosen.ids[index]] ?? null;
}
