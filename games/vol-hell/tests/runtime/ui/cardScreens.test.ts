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
    vi.restoreAllMocks();
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
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    screens.openIntermission(2);
    root.querySelector<HTMLButtonElement>('.vol-card-shop__close')!.click();

    vi.advanceTimersByTime(240);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screens.isOpen()).toBe(false);
    vi.useRealTimers();
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

  it('dükkanda reroll butonu maliyetle gösterilir', () => {
    economy.addFlux(100);
    screens.openIntermission(9);

    const reroll = root.querySelector<HTMLButtonElement>('.vol-card-shop__reroll')!;
    expect(reroll).not.toBeNull();
    expect(reroll.textContent).toMatch(/Flux/);
  });

  it('bakiye yetersizse reroll butonu kilitlidir', () => {
    screens.openIntermission(10);

    const reroll = root.querySelector<HTMLButtonElement>('.vol-card-shop__reroll')!;
    expect(reroll.disabled).toBe(true);
  });

  it('kilitleme teklifte KİLİDİ AÇ etiketine döner', () => {
    economy.addFlux(100);
    screens.openIntermission(11);

    const lockButton = root.querySelector<HTMLButtonElement>('.vol-card__action--secondary')!;
    expect(lockButton.textContent).toBe(i18next.t('volhell:cards.ui.lock'));

    lockButton.click();

    const after = root.querySelector<HTMLButtonElement>('.vol-card__action--secondary')!;
    expect(after.textContent).toBe(i18next.t('volhell:cards.ui.unlock'));
    expect(after.closest('.vol-card')?.classList.contains('vol-card--locked')).toBe(true);
  });

  it('satın alınan teklifte kilit butonu kalkar', () => {
    economy.addFlux(100);
    screens.openIntermission(12);

    const buyButton = root.querySelector<HTMLButtonElement>(
      '.vol-card-picker--shop .vol-card-picker__grid .vol-card__action',
    )!;
    buyButton.click();

    const tile = root.querySelector('.vol-card-picker--shop .vol-card-picker__grid .vol-card')!;
    expect(tile.querySelector('.vol-card__action--secondary')).toBeNull();
  });

  it('tüm slotlar doluyken TAK butonu toast bildirimi gösterir', async () => {
    cards.acquire(CARD_CATALOG.cardTurret);
    cards.acquire(CARD_CATALOG.cardFireZone);
    cards.acquire(CARD_CATALOG.cardChainLightning);
    screens.openIntermission(13);

    // Üç yetenek envanterde; TAK'lenen ilk iki slota yerleşir, üçüncü toast verir.
    const equipButtons = root.querySelectorAll<HTMLButtonElement>(
      '.vol-card-shop__abilities .vol-card__action--secondary',
    );
    equipButtons[0].click();
    equipButtons[1].click();
    equipButtons[2].click();

    await vi.waitFor(() => expect(document.body.querySelector('.vol-toast')).not.toBeNull());
  });

  it('yeni alınan yetenek otomatik slota takılır', () => {
    economy.addFlux(100);

    // Dükkan teklifini deterministik hale getir: bir yetenek ve bir pasif.
    vi.spyOn(cards, 'drawOffer').mockReturnValue([
      CARD_CATALOG.cardFireZone,
      CARD_CATALOG.keskinUc,
    ]);

    screens.openIntermission(14);

    const buyButton = root.querySelector<HTMLButtonElement>(
      '.vol-card-picker--shop .vol-card-picker__grid .vol-card__action',
    )!;
    buyButton.click();

    const equipped = cards.getEquipped('primary');
    expect(equipped).not.toBeNull();
    expect(equipped?.definition.id).toBe('cardFireZone');
  });

  it('dükkan kartı satıldıktan sonra aynı teklif tekrar satın alınabilir', () => {
    economy.addFlux(100);
    vi.spyOn(cards, 'drawOffer').mockReturnValue([
      CARD_CATALOG.cardFireZone,
      CARD_CATALOG.keskinUc,
    ]);

    screens.openIntermission(15);

    // İlk yetenek kartını al.
    const buyButton = root.querySelector<HTMLButtonElement>(
      '.vol-card-picker--shop .vol-card-picker__grid .vol-card__action',
    )!;
    buyButton.click();

    // Sat.
    const sellButton = root.querySelector<HTMLButtonElement>(
      '.vol-card-shop__abilities .vol-card__action',
    )!;
    sellButton.click();

    // Aynı teklif artık ALINDI değil; yeniden satın alınabilir.
    const afterBuy = root.querySelector<HTMLButtonElement>(
      '.vol-card-picker--shop .vol-card-picker__grid .vol-card__action',
    )!;
    expect(afterBuy.textContent).toBe(i18next.t('volhell:cards.ui.buy'));
    expect(afterBuy.disabled).toBe(false);
  });

  it('kilitli teklif sonraki wave’de aynı slotta korunur ve boş slot yenilenir', () => {
    economy.addFlux(100);
    vi.spyOn(cards, 'drawOffer')
      .mockReturnValueOnce([CARD_CATALOG.keskinUc, CARD_CATALOG.hafifBotlar])
      .mockReturnValueOnce([CARD_CATALOG.takviyeliGovde]);

    // Birinci dalga — ilk kartı kilitle.
    screens.openIntermission(16);

    const firstTile = root.querySelector(
      '.vol-card-picker--shop .vol-card-picker__grid .vol-card',
    )!;
    const lockButton = firstTile.querySelector<HTMLButtonElement>('.vol-card__action--secondary')!;
    lockButton.click();

    expect(firstTile.classList.contains('vol-card--locked')).toBe(true);
    expect(
      firstTile.querySelector<HTMLButtonElement>('.vol-card__action--secondary')?.textContent,
    ).toBe(i18next.t('volhell:cards.ui.unlock'));

    // Dükkanı kapat.
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    root.querySelector<HTMLButtonElement>('.vol-card-shop__close')!.click();
    vi.advanceTimersByTime(240);
    expect(screens.isOpen()).toBe(false);
    vi.useRealTimers();

    // İkinci dalga — kilitli kart aynı slotta, diğer slot yeni kartla doldu.
    screens.openIntermission(17);

    const tiles = root.querySelectorAll('.vol-card-picker--shop .vol-card-picker__grid .vol-card');
    expect(tiles.length).toBe(2);

    const persisted = tiles[0];
    expect(persisted.classList.contains('vol-card--locked')).toBe(true);
    expect(persisted.querySelector('.vol-card__title')?.textContent).toBe(
      i18next.t('volhell:cards.keskinUc.title'),
    );

    const refreshed = tiles[1];
    expect(refreshed.classList.contains('vol-card--locked')).toBe(false);
    expect(refreshed.querySelector('.vol-card__title')?.textContent).toBe(
      i18next.t('volhell:cards.takviyeliGovde.title'),
    );
  });

  it('havuz tükendiğinde dükkan çökmez ve mevcut teklifler görüntülenir', () => {
    economy.addFlux(100);
    vi.spyOn(cards, 'drawOffer').mockReturnValue([CARD_CATALOG.keskinUc]);

    screens.openIntermission(18);

    const tiles = root.querySelectorAll('.vol-card-picker--shop .vol-card-picker__grid .vol-card');
    expect(tiles.length).toBeGreaterThanOrEqual(1);

    for (const tile of Array.from(tiles)) {
      const title = tile.querySelector('.vol-card__title');
      expect(title?.textContent).toBeTruthy();
    }

    const button = root.querySelector<HTMLButtonElement>(
      '.vol-card-picker--shop .vol-card-picker__grid .vol-card__action',
    );
    expect(button).not.toBeNull();
  });
  /**
   * Havuz daralınca teklif listesi AYNI kartı iki slota koyuyordu.
   *
   * `refreshShopOffers` boş kalan bir slotu "o slottaki eski kartla"
   * dolduruyordu. O kart aynı turda başka bir slota da çekilmişse teklif
   * listesinde iki kez yer alıyordu. `ShopPicker` teklifleri id'ye göre Map'te
   * tuttuğu için iki slot tek karta çöküyor ve vitrindeki kart sayısı sessizce
   * azalıyordu.
   *
   * Tetiklemek için önce vitrin DOLU olmalı (2 kart), sonra havuz istenen
   * sayıyı karşılayamamalı (1 kart) — o zaman ikinci slot birinciyi tekrarlar.
   */
  describe('dükkan teklifleri — havuz daralması', () => {
    it('havuz az kart verince eski teklif vitrinde ASILI KALMAZ', () => {
      economy.addFlux(500);

      const draw = vi.spyOn(cards, 'drawOffer');
      // 1. ziyaret: vitrin dolu — keskinUc + cardFireZone.
      draw.mockReturnValueOnce([CARD_CATALOG.keskinUc, CARD_CATALOG.cardFireZone]);
      screens.openIntermission(20);
      root.querySelector<HTMLButtonElement>('.vol-card-shop__close')!.click();

      // 2. ziyaret: havuz yalnızca TEK yeni kart verebiliyor.
      draw.mockReturnValue([CARD_CATALOG.keskinUc]);
      screens.openIntermission(21);

      const titles = [
        ...root.querySelectorAll('.vol-card-picker--shop .vol-card-picker__grid .vol-card'),
      ].map((el) => el.querySelector('.vol-card__title')?.textContent ?? '');

      // Eski hâl boş slotu "o slottaki eski kartla" dolduruyordu; oyuncu reroll
      // için ödeme yaptığı hâlde önceki teklif vitrinde kalıyordu.
      expect(titles).toHaveLength(1);
      expect(new Set(titles).size).toBe(titles.length);
    });

    it('havuz hiç kart veremezse vitrin boş kalır, hayalet kart olmaz', () => {
      economy.addFlux(500);
      const draw = vi.spyOn(cards, 'drawOffer');
      draw.mockReturnValueOnce([CARD_CATALOG.keskinUc, CARD_CATALOG.cardFireZone]);
      screens.openIntermission(22);
      root.querySelector<HTMLButtonElement>('.vol-card-shop__close')!.click();

      draw.mockReturnValue([]);
      screens.openIntermission(23);

      const shown = root.querySelectorAll(
        '.vol-card-picker--shop .vol-card-picker__grid .vol-card',
      );
      expect(shown.length).toBe(0);
    });
  });
});
