import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatBlock, createRandom, i18n, i18next } from '@volstudio/core';
import { CardScreens } from '@/runtime/ui/CardScreens';
import { CardInventoryManager } from '@/runtime/systems/CardInventoryManager';
import { RunEconomy } from '@/runtime/systems/RunEconomy';
import { AbilityRuntime } from '@/runtime/ability/AbilityRuntime';
import { CARD_CATALOG } from '@/config/cards';
import { bulletConfig } from '@/config/bullet';
import trResources from '@/i18n/tr.json';
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

/**
 * Dalga arası akış: seviye atlamaları dövüşü KESMEZ, dalga sonunda sırayla
 * sunulur, ardından dükkan gelir.
 */
describe('CardScreens — dalga arası akış', () => {
  let root: HTMLDivElement;
  let screens: CardScreens;
  let economy: RunEconomy;
  let cards: CardInventoryManager;
  let onOpen: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;

  function levelUpButtons(): HTMLButtonElement[] {
    return [
      ...root.querySelectorAll<HTMLButtonElement>('.vol-card-picker--levelup .vol-card__action'),
    ];
  }

  function shopVisible(): boolean {
    const shop = root.querySelector<HTMLElement>('.vol-card-picker--shop');
    return shop !== null && !shop.hidden;
  }

  function levelUpVisible(): boolean {
    const picker = root.querySelector<HTMLElement>('.vol-card-picker--levelup');
    return picker !== null && !picker.hidden;
  }

  beforeEach(async () => {
    i18n.addResources('tr', 'volhell', trResources);
    await i18n.init();
    await i18next.changeLanguage('tr');

    root = document.createElement('div');
    document.body.appendChild(root);

    const stats = new StatBlock({
      damage: bulletConfig.damage,
      speed: 220,
      health: 100,
      fireRate: bulletConfig.fireCooldownMs,
    });
    economy = new RunEconomy();
    const abilities = new AbilityRuntime({
      scene: makeScene(),
      effects: {
        play: vi.fn(),
        getActiveParticleCount: () => 0,
        destroy: vi.fn(),
      } as unknown as EffectManager,
      border: { clampX: (x: number) => x, clampY: (y: number) => y } as unknown as Border,
      random: createRandom(3),
      bullets: { spawnBullet: vi.fn() } as unknown as BulletManager,
      playerStats: stats,
    });
    cards = new CardInventoryManager({
      random: createRandom(9),
      playerStats: stats,
      abilities,
      economy,
      conditions: {
        hasActiveTurret: () => false,
        isLowHealth: () => false,
        areBothSlotsFilled: () => false,
      },
    });

    onOpen = vi.fn();
    onClose = vi.fn();
    screens = new CardScreens(root, cards, economy, { onOpen, onClose });
  });

  afterEach(() => {
    screens.destroy();
    root.remove();
  });

  it('seviye atlaması dalga ortasında ekran AÇMAZ — kuyruğa alınır', () => {
    screens.queueLevelUp(2);
    screens.queueLevelUp(3);

    expect(screens.isOpen()).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screens.getPendingLevelUpCount()).toBe(2);
  });

  it('dalga sonunda bekleyen haklar sırayla sunulur, sonra dükkan gelir', () => {
    screens.queueLevelUp(2);
    screens.queueLevelUp(3);

    screens.openIntermission(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(levelUpVisible()).toBe(true);
    expect(shopVisible()).toBe(false);

    // İlk kart seçilir → ikinci hak açılır.
    levelUpButtons()[0].click();
    expect(levelUpVisible()).toBe(true);
    expect(screens.getPendingLevelUpCount()).toBe(0);

    // İkinci kart seçilir → dükkan.
    levelUpButtons()[0].click();
    expect(levelUpVisible()).toBe(false);
    expect(shopVisible()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('bekleyen hak yoksa dalga sonu doğrudan dükkanı açar', () => {
    screens.openIntermission(4);

    expect(levelUpVisible()).toBe(false);
    expect(shopVisible()).toBe(true);
  });

  it('seçilen kart envantere girer', () => {
    screens.queueLevelUp(2);
    screens.openIntermission(1);
    levelUpButtons()[0].click();

    expect(cards.getOwned()).toHaveLength(1);
  });

  it('DEVAM ET akışı bitirir ve oyunu sürdürür', () => {
    screens.openIntermission(2);
    root.querySelector<HTMLButtonElement>('.vol-card-shop__close')!.click();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screens.isOpen()).toBe(false);
  });

  it('dükkanda satın alma Flux düşürür ve envanteri günceller', () => {
    economy.addFlux(100);
    screens.openIntermission(3);

    const before = economy.getFlux();
    const buyButton = root.querySelector<HTMLButtonElement>(
      '.vol-card-picker--shop .vol-card-picker__grid .vol-card__action',
    )!;
    buyButton.click();

    expect(economy.getFlux()).toBeLessThan(before);
    expect(cards.getOwned()).toHaveLength(1);
    // Panel açık kalır: oyuncu ikinci kartı da alabilir.
    expect(shopVisible()).toBe(true);
  });

  it('bakiye yetmezse satın alma butonu kilitli', () => {
    screens.openIntermission(3);

    const buyButton = root.querySelector<HTMLButtonElement>(
      '.vol-card-picker--shop .vol-card-picker__grid .vol-card__action',
    )!;
    expect(buyButton.disabled).toBe(true);
    expect(economy.getFlux()).toBe(0);
  });

  it('envanterdeki kart SAT butonuyla geri satılır', () => {
    const owned = cards.acquire(CARD_CATALOG.keskinUc);
    screens.openIntermission(5);

    const sellButton = root.querySelector<HTMLButtonElement>(
      '.vol-card-shop__passives .vol-card__action',
    )!;
    sellButton.click();

    expect(cards.getOwned()).toHaveLength(0);
    expect(economy.getFlux()).toBeGreaterThan(0);
    expect(owned.instanceId).toBeTruthy();
  });

  it('yetenek kartı sürüklenebilir ve slota bırakılınca takılır', () => {
    const owned = cards.acquire(CARD_CATALOG.cardChainLightning);
    // Otomatik yerleşimi geri al: sürükleme yolunu sınıyoruz.
    cards.unequip('primary');
    screens.openIntermission(6);

    const slot = root.querySelectorAll<HTMLElement>('.vol-loadout__slot')[1];
    const event = new Event('drop', { bubbles: true }) as DragEvent & { dataTransfer: unknown };
    Object.defineProperty(event, 'dataTransfer', {
      value: { getData: () => owned.instanceId },
    });
    Object.defineProperty(event, 'preventDefault', { value: () => {} });
    slot.dispatchEvent(event);

    expect(cards.getEquipped('secondary')?.instanceId).toBe(owned.instanceId);
  });

  it('slot temizleme butonu yeteneği söker', () => {
    cards.acquire(CARD_CATALOG.cardTurret);
    screens.openIntermission(7);

    const clear = root.querySelector<HTMLButtonElement>('.vol-loadout__slot-clear')!;
    clear.click();

    expect(cards.getEquipped('primary')).toBeNull();
  });

  it('yetenek ve pasif kartlar ayrı bölümlerde listelenir', () => {
    cards.acquire(CARD_CATALOG.cardTurret);
    cards.acquire(CARD_CATALOG.keskinUc);
    screens.openIntermission(8);

    expect(root.querySelectorAll('.vol-card-shop__abilities .vol-card')).toHaveLength(1);
    expect(root.querySelectorAll('.vol-card-shop__passives .vol-card')).toHaveLength(1);
  });
});
