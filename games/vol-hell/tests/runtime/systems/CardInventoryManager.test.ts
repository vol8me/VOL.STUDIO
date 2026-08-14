import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatBlock, Vector2, createRandom } from '@volstudio/core';
import { CARD_CATALOG, getCardSellValue } from '@/config/cards';
import { bulletConfig } from '@/config/bullet';
import { AbilityRuntime } from '@/runtime/ability/AbilityRuntime';
import {
  CardInventoryManager,
  type CardConditionSources,
} from '@/runtime/systems/CardInventoryManager';
import { RunEconomy } from '@/runtime/systems/RunEconomy';
import type { BulletManager } from '@/runtime/entity/BulletManager';
import type { Border } from '@/runtime/entity/Border';
import type { EffectManager } from '@/runtime/systems/EffectManager';

function makeScene(): never {
  const makeShape = (x: number, y: number) => {
    const shape = {
      x,
      y,
      setStrokeStyle: () => shape,
      setOrigin: () => shape,
      setSize: () => shape,
      setVisible: () => shape,
      setScale: () => shape,
      setDepth: () => shape,
      setAlpha: () => shape,
      setRotation: () => shape,
      clear: () => shape,
      lineStyle: () => shape,
      lineBetween: () => shape,
      beginPath: () => shape,
      moveTo: () => shape,
      lineTo: () => shape,
      strokePath: () => shape,
      destroy: () => {},
    };
    return shape;
  };
  return {
    add: { circle: makeShape, rectangle: makeShape, graphics: () => makeShape(0, 0) },
  } as never;
}

function makeEffects(): EffectManager {
  return {
    play: vi.fn(),
    getActiveParticleCount: () => 0,
    destroy: vi.fn(),
  } as unknown as EffectManager;
}

describe('CardInventoryManager', () => {
  let stats: StatBlock;
  let economy: RunEconomy;
  let abilities: AbilityRuntime;
  let cards: CardInventoryManager;
  let turretActive: boolean;
  let lowHealth: boolean;

  beforeEach(() => {
    turretActive = false;
    lowHealth = false;
    stats = new StatBlock({
      damage: bulletConfig.damage,
      speed: 220,
      health: 100,
      fireRate: bulletConfig.fireCooldownMs,
    });
    economy = new RunEconomy();
    abilities = new AbilityRuntime({
      scene: makeScene(),
      effects: makeEffects(),
      border: { clampX: (x: number) => x, clampY: (y: number) => y } as unknown as Border,
      random: createRandom(1),
      bullets: { spawnBullet: vi.fn() } as unknown as BulletManager,
      playerStats: stats,
    });

    const conditions: CardConditionSources = {
      hasActiveTurret: () => turretActive,
      isLowHealth: () => lowHealth,
      areBothSlotsFilled: () => false,
    };

    cards = new CardInventoryManager({
      random: createRandom(42),
      playerStats: stats,
      abilities,
      economy,
      conditions,
    });
  });

  describe('teklif çekme', () => {
    it('level-up teklifi istenen sayıda kart verir', () => {
      expect(cards.drawOffer(2)).toHaveLength(2);
    });

    it('sahip olunan ability kartı tekrar teklif edilmez', () => {
      cards.acquire(CARD_CATALOG.cardTurret);

      for (let i = 0; i < 30; i++) {
        for (const card of cards.drawOffer(2)) {
          expect(card.id).not.toBe('cardTurret');
        }
      }
    });

    it('buff kartları tekrar teklif edilebilir — üst üste binerler', () => {
      cards.acquire(CARD_CATALOG.keskinUc);
      cards.acquire(CARD_CATALOG.keskinUc);

      // Aynı kartın iki kopyası AYRI modifier olarak yaşar (id'ler farklı).
      expect(stats.getModifiers()).toHaveLength(2);
      expect(stats.getValue('damage')).toBeCloseTo(bulletConfig.damage * 1.15 * 1.15, 6);
    });
  });

  describe('buff ve takas kartları', () => {
    it('buff kartı alındığı an stat’a uygulanır', () => {
      cards.acquire(CARD_CATALOG.keskinUc);
      expect(stats.getValue('damage')).toBeCloseTo(bulletConfig.damage * 1.15, 6);
    });

    it('takas kartı hem kazancı hem kaybı uygular', () => {
      cards.acquire(CARD_CATALOG.camKanat);
      expect(stats.getValue('damage')).toBeCloseTo(bulletConfig.damage * 1.35, 6);
      expect(stats.getValue('health')).toBeCloseTo(100 * 0.75, 6);
    });

    it('koşullu takas yalnızca koşul doğruyken etki eder', () => {
      cards.acquire(CARD_CATALOG.kuleBagi);
      expect(stats.getValue('damage')).toBe(bulletConfig.damage);

      turretActive = true;
      expect(stats.getValue('damage')).toBeCloseTo(bulletConfig.damage * 1.35, 6);
      expect(stats.getValue('speed')).toBeCloseTo(220 * 0.9, 6);
    });

    it('ateş hızı kartı bekleme süresini DÜŞÜRÜR', () => {
      cards.acquire(CARD_CATALOG.yagliTetik);
      expect(stats.getValue('fireRate')).toBeLessThan(bulletConfig.fireCooldownMs);
    });

    it('ability yükseltme kartı ability parametresini artırır', () => {
      cards.acquire(CARD_CATALOG.catalDil);
      expect(abilities.upgrades.get('chainBounces')).toBe(1);
    });
  });

  describe('dükkan alım/satım', () => {
    it('yetersiz Flux ile satın alma reddedilir ve hiçbir şey değişmez', () => {
      const card = CARD_CATALOG.yikimProtokolu;
      economy.addFlux(card.price - 1);

      expect(cards.purchase(card)).toBeNull();
      expect(economy.getFlux()).toBe(card.price - 1);
      expect(cards.getOwned()).toHaveLength(0);
      expect(stats.getValue('damage')).toBe(bulletConfig.damage);
    });

    it('yeterli Flux ile satın alma bakiyeyi düşürür ve kartı uygular', () => {
      const card = CARD_CATALOG.keskinUc;
      economy.addFlux(50);

      expect(cards.purchase(card)).not.toBeNull();
      expect(economy.getFlux()).toBe(50 - card.price);
      expect(stats.getValue('damage')).toBeGreaterThan(bulletConfig.damage);
    });

    it('satış kartın etkisini geri alır ve Flux iade eder', () => {
      const card = CARD_CATALOG.keskinUc;
      economy.addFlux(card.price);
      const owned = cards.purchase(card)!;

      const refund = cards.sell(owned.instanceId);

      expect(refund).toBe(getCardSellValue(card.price));
      expect(economy.getFlux()).toBe(refund);
      expect(stats.getValue('damage')).toBe(bulletConfig.damage);
      expect(cards.getOwned()).toHaveLength(0);
    });

    it('satış ability yükseltmesini de geri alır', () => {
      const owned = cards.acquire(CARD_CATALOG.catalDil);
      cards.sell(owned.instanceId);
      expect(abilities.upgrades.get('chainBounces')).toBe(0);
    });

    it('aynı karttan iki kopya varken biri satılınca diğeri kalır', () => {
      const first = cards.acquire(CARD_CATALOG.keskinUc);
      cards.acquire(CARD_CATALOG.keskinUc);

      cards.sell(first.instanceId);

      expect(cards.getOwned()).toHaveLength(1);
      expect(stats.getValue('damage')).toBeCloseTo(bulletConfig.damage * 1.15, 6);
    });

    it('bilinmeyen kart satışı 0 döner', () => {
      expect(cards.sell('yok#1')).toBe(0);
    });
  });

  describe('ability slotları', () => {
    it('ability kartı slota atanır', () => {
      const owned = cards.acquire(CARD_CATALOG.cardTurret);

      expect(cards.equip(owned.instanceId, 'primary')).toBe(true);
      expect(abilities.getAbility('primary')?.id).toBe('turret');
      expect(cards.getEquipped('primary')?.instanceId).toBe(owned.instanceId);
    });

    it('ability olmayan kart slota atanamaz', () => {
      const owned = cards.acquire(CARD_CATALOG.keskinUc);
      expect(cards.equip(owned.instanceId, 'primary')).toBe(false);
      expect(abilities.getAbility('primary')).toBeNull();
    });

    it('aynı kart diğer slota taşınınca eski slot boşalır', () => {
      const owned = cards.acquire(CARD_CATALOG.cardTurret);
      cards.equip(owned.instanceId, 'primary');
      cards.equip(owned.instanceId, 'secondary');

      expect(cards.getEquipped('primary')).toBeNull();
      expect(cards.getEquipped('secondary')?.instanceId).toBe(owned.instanceId);
      expect(abilities.getAbility('primary')).toBeNull();
      expect(abilities.getAbility('secondary')?.id).toBe('turret');
    });

    it('slottaki kart satılınca slot boşalır', () => {
      const owned = cards.acquire(CARD_CATALOG.cardTurret);
      cards.equip(owned.instanceId, 'primary');

      cards.sell(owned.instanceId);

      expect(cards.getEquipped('primary')).toBeNull();
      expect(abilities.getAbility('primary')).toBeNull();
    });

    it('unequip slotu boşaltır', () => {
      const owned = cards.acquire(CARD_CATALOG.cardTurret);
      cards.equip(owned.instanceId, 'primary');
      cards.unequip('primary');
      expect(abilities.getAbility('primary')).toBeNull();
    });

    it('yalnızca ability kartları envanter listesinde görünür', () => {
      cards.acquire(CARD_CATALOG.cardTurret);
      cards.acquire(CARD_CATALOG.keskinUc);

      expect(cards.getOwnedAbilityCards()).toHaveLength(1);
      expect(cards.getOwned()).toHaveLength(2);
    });
  });

  it('düşük can koşulu canlı okunur', () => {
    cards.acquire(CARD_CATALOG.olumeYakin);
    const baseDamage = stats.getValue('damage');

    lowHealth = true;
    expect(stats.getValue('damage')).toBeCloseTo(baseDamage * 2, 6);

    lowHealth = false;
    expect(stats.getValue('damage')).toBeCloseTo(baseDamage, 6);
  });

  it('kule ability’si atanınca Vector2 tabanlı aktivasyon çalışır', () => {
    const owned = cards.acquire(CARD_CATALOG.cardTurret);
    cards.equip(owned.instanceId, 'primary');

    abilities.update(16, new Vector2(100, 100), new Vector2(1, 0), []);
    expect(abilities.tryActivate('primary')).toBe(true);
    expect(abilities.getTurret()).not.toBeNull();
  });
});
