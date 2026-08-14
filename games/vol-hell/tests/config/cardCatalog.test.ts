import { describe, it, expect } from 'vitest';
import { createRandom, STAT_KEYS } from '@volstudio/core';
import {
  CARD_CATALOG,
  CARD_PRICES,
  DEFAULT_RARITY_WEIGHTS,
  drawCards,
  findCards,
  getCardDefinition,
  getCardSellValue,
} from '@/config/cards';
import type { CardRarity } from '@/config/cards/types';
import { ABILITY_CATALOG } from '@/config/abilities';

const RARITIES: CardRarity[] = ['rare', 'epic', 'legendary'];

describe('CARD_CATALOG bütünlüğü', () => {
  it('her tanımın anahtarı kendi id’si ile aynı', () => {
    for (const [key, card] of Object.entries(CARD_CATALOG)) {
      expect(card.id, key).toBe(key);
    }
  });

  it('her kartın i18n anahtarları ve fiyatı var', () => {
    for (const [key, card] of Object.entries(CARD_CATALOG)) {
      expect(card.titleKey, key).toContain(key);
      expect(card.descriptionKey, key).toContain(key);
      expect(card.price, key).toBeGreaterThan(0);
    }
  });

  it('fiyat nadirlikle birlikte artar', () => {
    expect(CARD_PRICES.epic).toBeGreaterThan(CARD_PRICES.rare);
    expect(CARD_PRICES.legendary).toBeGreaterThan(CARD_PRICES.epic);

    for (const [key, card] of Object.entries(CARD_CATALOG)) {
      expect(card.price, key).toBe(CARD_PRICES[card.rarity]);
    }
  });

  it('ability kartları geçerli bir ability’ye referans verir', () => {
    for (const card of Object.values(CARD_CATALOG)) {
      if (card.type !== 'ability') continue;
      expect(card.abilityId, card.id).toBeDefined();
      expect(ABILITY_CATALOG[card.abilityId!], card.id).toBeDefined();
    }
  });

  it('buff ve takas kartlarının etkisi vardır', () => {
    for (const card of Object.values(CARD_CATALOG)) {
      if (card.type === 'ability') continue;
      const effects = (card.modifiers?.length ?? 0) + (card.abilityUpgrades?.length ?? 0);
      expect(effects, card.id).toBeGreaterThan(0);
    }
  });

  it('modifier’lar geçerli stat ve çarpan taşır', () => {
    for (const card of Object.values(CARD_CATALOG)) {
      for (const modifier of card.modifiers ?? []) {
        expect(STAT_KEYS, card.id).toContain(modifier.stat);
        expect(Number.isFinite(modifier.value), card.id).toBe(true);
        if (modifier.type === 'multiply') {
          // Sıfır/negatif çarpan stat'ı anlamsız hale getirir.
          expect(modifier.value, card.id).toBeGreaterThan(0);
        }
      }
    }
  });

  it('bir kart aynı stat’a iki modifier koymaz', () => {
    // StatBlock aynı (id, stat) ikilisinde ÜZERİNE YAZAR; ikisi de uygulanmazdı.
    for (const card of Object.values(CARD_CATALOG)) {
      const stats = (card.modifiers ?? []).map((modifier) => modifier.stat);
      expect(new Set(stats).size, card.id).toBe(stats.length);
    }
  });

  it('takas kartları hem kazanç hem kayıp taşır', () => {
    for (const card of Object.values(CARD_CATALOG)) {
      if (card.type !== 'tradeoff') continue;

      const modifiers = card.modifiers ?? [];
      // fireRate ters yönlüdür: değerin BÜYÜMESİ ateşi yavaşlatır (kayıp).
      const isGain = (m: (typeof modifiers)[number]): boolean =>
        m.stat === 'fireRate'
          ? m.type === 'multiply'
            ? m.value < 1
            : m.value < 0
          : m.type === 'multiply'
          ? m.value > 1
          : m.value > 0;

      expect(modifiers.some(isGain), card.id).toBe(true);
      expect(
        modifiers.some((m) => !isGain(m)),
        card.id,
      ).toBe(true);
    }
  });

  it('koşullu takas kartları geçerli bir koşul kimliği kullanır', () => {
    const known = new Set(['turretActive', 'lowHealth', 'bothSlotsFilled']);
    for (const card of Object.values(CARD_CATALOG)) {
      for (const modifier of card.modifiers ?? []) {
        if (!modifier.conditionId) continue;
        expect(known.has(modifier.conditionId), card.id).toBe(true);
      }
    }
  });

  it('üç tipin de kartı var ve havuz yaklaşık 30 karttan oluşur', () => {
    expect(findCards({ type: 'ability' }).length).toBeGreaterThan(0);
    expect(findCards({ type: 'buff' }).length).toBeGreaterThan(0);
    expect(findCards({ type: 'tradeoff' }).length).toBeGreaterThan(0);
    expect(Object.keys(CARD_CATALOG).length).toBeGreaterThanOrEqual(28);
  });

  it('her nadirlik kademesinde yaklaşık eşit sayıda kart var', () => {
    for (const rarity of RARITIES) {
      expect(findCards({ rarity }).length, rarity).toBeGreaterThanOrEqual(8);
    }
  });

  it('geri satış değeri fiyatın altında ama en az 1 Flux', () => {
    for (const card of Object.values(CARD_CATALOG)) {
      const value = getCardSellValue(card.price);
      expect(value, card.id).toBeGreaterThanOrEqual(1);
      expect(value, card.id).toBeLessThan(card.price);
    }
  });
});

describe('findCards', () => {
  it('tip filtresi yalnızca o tipi döner', () => {
    for (const id of findCards({ type: 'tradeoff' })) {
      expect(CARD_CATALOG[id].type).toBe('tradeoff');
    }
  });

  it('exclude verilen kartları eler', () => {
    const all = findCards();
    const excluded = new Set([all[0]]);
    expect(findCards({ exclude: excluded })).not.toContain(all[0]);
  });

  it('getCardDefinition bilinmeyen kimlikte hata fırlatır', () => {
    expect(getCardDefinition('keskinUc').id).toBe('keskinUc');
    expect(() => getCardDefinition('yok-boyle-kart')).toThrow();
  });
});

describe('drawCards', () => {
  it('istenen sayıda FARKLI kart çeker', () => {
    const cards = drawCards(createRandom(11), 3);
    expect(cards).toHaveLength(3);
    expect(new Set(cards.map((card) => card.id)).size).toBe(3);
  });

  it('aynı seed aynı teklifi verir — determinizm korunur', () => {
    const a = drawCards(createRandom(2024), 2).map((card) => card.id);
    const b = drawCards(createRandom(2024), 2).map((card) => card.id);
    expect(a).toEqual(b);
  });

  it('exclude edilen kartlar çekilmez', () => {
    const exclude = new Set(findCards({ rarity: 'rare' }));
    const cards = drawCards(createRandom(5), 4, { exclude });
    for (const card of cards) {
      expect(card.rarity).not.toBe('rare');
    }
  });

  it('ağırlıklar dağılıma yansır — rare en sık, legendary en seyrek çıkar', () => {
    const random = createRandom(99);
    const counts: Record<CardRarity, number> = { rare: 0, epic: 0, legendary: 0 };
    for (let i = 0; i < 400; i++) {
      counts[drawCards(random, 1)[0].rarity] += 1;
    }

    expect(DEFAULT_RARITY_WEIGHTS.rare).toBeGreaterThan(DEFAULT_RARITY_WEIGHTS.legendary);
    expect(counts.rare).toBeGreaterThan(counts.epic);
    expect(counts.epic).toBeGreaterThan(counts.legendary);
  });

  it('tek kademeye ağırlık verilirse yalnızca o kademe çıkar', () => {
    const cards = drawCards(createRandom(3), 3, {
      rarityWeights: { rare: 0, epic: 0, legendary: 1 },
    });
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.rarity).toBe('legendary');
    }
  });

  it('havuz tükenirse istenenden az kart döner, tekrar etmez', () => {
    const legendaryCount = findCards({ rarity: 'legendary' }).length;
    const cards = drawCards(createRandom(7), legendaryCount + 5, {
      rarityWeights: { rare: 0, epic: 0, legendary: 1 },
    });

    expect(cards).toHaveLength(legendaryCount);
    expect(new Set(cards.map((card) => card.id)).size).toBe(legendaryCount);
  });
});
