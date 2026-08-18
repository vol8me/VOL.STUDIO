import {
  Button,
  CardTile,
  HIDE_ANIMATION_MS,
  LevelUpPicker,
  ShopPicker,
  Text,
  i18next,
  type CardRarity,
  type CardTileData,
  type ShopInventoryEntry,
  type ShopPickerState,
} from '@volstudio/core';
import { card } from './shared';

interface Destroyable {
  destroy(): void;
}

/** Bir kapatma fonksiyonunu ortak listeye kaydeder (bkz. `buildCardsTab`). */
type RegisterCloser = (close: () => void) => void;
/** Verilen kapatıcı DIŞINDAKİ tüm kayıtlı overlay'leri kapatır. */
type CloseAllExcept = (except: () => void) => void;

/**
 * Showcase kartları — gerçek oyun kataloğundan bağımsız, örnek içerik.
 * Dükkan demosunun "geniş market" hissi için 14'e çıkarıldı: havuz
 * `SHOP_SIZE`'ın (4) çok üzerinde olmalı, aksi halde birkaç satın alma +
 * kilitleme sonrası reroll'da havuz tükenip 4'ten AZ teklif gösterilir
 * (gerçek bir bulguydu — bkz. `refreshOffers`).
 */
const DEMO_CARDS = {
  turret: { rarity: 'rare' as CardRarity, price: 10, type: 'ability' },
  chain: { rarity: 'epic' as CardRarity, price: 18, type: 'ability' },
  inferno: { rarity: 'legendary' as CardRarity, price: 32, type: 'ability' },
  sharpEdge: { rarity: 'rare' as CardRarity, price: 10, type: 'passive' },
  multiShot: { rarity: 'epic' as CardRarity, price: 20, type: 'ability' },
  swiftBoots: { rarity: 'rare' as CardRarity, price: 8, type: 'passive' },
  ironWill: { rarity: 'legendary' as CardRarity, price: 28, type: 'passive' },
  frostNova: { rarity: 'epic' as CardRarity, price: 22, type: 'ability' },
  vampiricRounds: { rarity: 'rare' as CardRarity, price: 12, type: 'passive' },
  berserkerRage: { rarity: 'legendary' as CardRarity, price: 30, type: 'passive' },
  shieldWall: { rarity: 'rare' as CardRarity, price: 14, type: 'ability' },
  criticalFocus: { rarity: 'epic' as CardRarity, price: 18, type: 'passive' },
  phoenixFeather: { rarity: 'legendary' as CardRarity, price: 26, type: 'ability' },
  nimbleReflexes: { rarity: 'rare' as CardRarity, price: 9, type: 'passive' },
};

type DemoCardId = keyof typeof DEMO_CARDS;

const SHOP_POOL = Object.keys(DEMO_CARDS) as DemoCardId[];
/** Dükkanda AYNI ANDA görünen teklif sayısı — havuzun tamamı değil, bir kesiti. */
const SHOP_SIZE = 4;
const REROLL_BASE_COST = 5;
const REROLL_COST_STEP = 3;
/** Q/E yetenek slotu sayısı — gerçek oyundaki `AbilityLoadout` ile aynı (bkz. TODO.md). */
const ABILITY_SLOT_COUNT = 2;

function demoCard(id: DemoCardId, options: { withPrice?: boolean } = {}): CardTileData {
  const demo = DEMO_CARDS[id];
  return {
    id,
    title: i18next.t(`volui:cards.${id}.title` as 'volui:cards.turret.title'),
    description: i18next.t(`volui:cards.${id}.desc` as 'volui:cards.turret.desc'),
    rarity: demo.rarity,
    rarityLabel: i18next.t(`volui:cards.rarity.${demo.rarity}` as 'volui:cards.rarity.rare'),
    typeLabel: i18next.t(`volui:cards.type.${demo.type}` as 'volui:cards.type.ability'),
    priceLabel: options.withPrice
      ? i18next.t('volui:cards.price', { price: demo.price })
      : undefined,
  };
}

/** Havuzdan rastgele `n` benzersiz eleman seçer (Fisher-Yates parçalı). */
function pickRandom(pool: readonly DemoCardId[], n: number): DemoCardId[] {
  const copy = [...pool];
  const picked: DemoCardId[] = [];
  while (picked.length < n && copy.length > 0) {
    const index = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(index, 1)[0]);
  }
  return picked;
}

/** CardTile: örnek kartların nadirlik/tip görsel farkı yan yana. */
function buildRarityCard(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const row = document.createElement('div');
  row.className = 'vol-showcase-card-row';

  const status = new Text(i18next.t('volui:cards.noSelection'), { variant: 'muted' });
  disposables.push(status);

  // Tüm havuzu değil, ilk yedisini göster — bu kart yalnızca nadirlik/tip
  // görsel farkını tanıtır, dükkan demosuyla aynı geniş havuzu tekrar
  // sergilemenin bir değeri yok.
  for (const id of SHOP_POOL.slice(0, 7)) {
    const tile = new CardTile({
      data: demoCard(id),
      actionLabel: i18next.t('volui:cards.select'),
      onAction: (selected) =>
        status.setContent(i18next.t('volui:cards.selected', { id: selected })),
    });
    disposables.push(tile);
    row.appendChild(tile.element);
  }

  wrap.appendChild(row);
  wrap.appendChild(status.element);
  return card(i18next.t('volui:cards.rarityTitle'), wrap);
}

/**
 * Ortak overlay katmanı — `CardPicker` bilinçli olarak Modal'a bağlı değildir
 * (konumlandırma çağıranın sorumluluğu); burada `games/vol-hell`'in
 * `vol-card-layer`'ıyla AYNI mekanizma kurulur: ortalanmış, kararmış,
 * `uiRootElement`'e mount edilmiş bir katman. Panel artık kartın kendi
 * akışında değil bu katmanda yaşadığı için açılışı kartın boyutunu ETKİLEMEZ.
 *
 * `hide`/`show` çağıranın (`open`/`close` fonksiyonları) sorumluluğunda —
 * bu fonksiyon yalnızca DOM iskeletini kurar.
 */
function buildCardLayer(uiRootElement: HTMLElement, pickerElement: HTMLElement): HTMLDivElement {
  const layer = document.createElement('div');
  layer.className = 'vol-showcase-card-layer';
  layer.hidden = true;
  layer.appendChild(pickerElement);
  uiRootElement.appendChild(layer);
  return layer;
}

/**
 * Katmanı (scrim + panel) açar/kapar. Kapanış `HIDE_ANIMATION_MS` (CORE'un
 * `CardPicker.hide()` ile AYNI süre) kadar ertelenir — aksi halde panel
 * yumuşakça solarken arkasındaki scrim aniden kesilip uyumsuz görünürdü.
 */
function createLayerController(
  layer: HTMLDivElement,
  picker: { show(): void; hide(): void },
  openButton: Button,
): { open: () => void; close: () => void } {
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  const open = (): void => {
    if (hideTimeout !== null) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    layer.classList.remove('vol-showcase-card-layer--leaving');
    layer.hidden = false;
    openButton.element.hidden = true;
  };

  const close = (): void => {
    if (layer.hidden || hideTimeout !== null) return;
    picker.hide();
    layer.classList.add('vol-showcase-card-layer--leaving');
    hideTimeout = setTimeout(() => {
      hideTimeout = null;
      layer.hidden = true;
      layer.classList.remove('vol-showcase-card-layer--leaving');
      openButton.element.hidden = false;
    }, HIDE_ANIMATION_MS);
  };

  return { open, close };
}

/**
 * LevelUpPicker: iki kart, fiyat yok, seçince kapanır.
 *
 * Tetikleyici buton overlay açıkken GİZLENİR. Aynı anda yalnızca TEK bir
 * kart ekranı açık olabilir — `closeAllExcept` diğer overlay'i (dükkan)
 * kapatır, `registerCloser` bu overlayin kendisini o listeye ekler.
 */
function buildLevelUpCard(
  uiRootElement: HTMLElement,
  disposables: Destroyable[],
  registerCloser: RegisterCloser,
  closeAllExcept: CloseAllExcept,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:cards.noSelection'), { variant: 'muted' });
  disposables.push(result);

  const picker = new LevelUpPicker({
    title: i18next.t('volui:cards.levelUpTitle'),
    hint: i18next.t('volui:cards.levelUpHint'),
    selectLabel: i18next.t('volui:cards.select'),
    onSelect: (id) => {
      result.setContent(i18next.t('volui:cards.selected', { id }));
      controller.close();
    },
  });
  disposables.push(picker);

  const layer = buildCardLayer(uiRootElement, picker.element);
  disposables.push({ destroy: () => layer.remove() });

  const open = new Button(i18next.t('volui:cards.openLevelUp'), {
    variant: 'primary',
    onClick: () => {
      closeAllExcept(controller.close);
      // Katman önce görünür hale gelir; panel açılış animasyonu
      // görünür ağaçta çalışır, gizli katmanda sıfırlandan başlamaz.
      controller.open();
      picker.present([demoCard('turret'), demoCard('inferno')], {
        title: i18next.t('volui:cards.levelUpTitle'),
        hint: i18next.t('volui:cards.levelUpHint'),
      });
    },
  });
  disposables.push(open);

  const controller = createLayerController(layer, picker, open);
  registerCloser(controller.close);

  wrap.appendChild(open.element);
  wrap.appendChild(result.element);
  return card(i18next.t('volui:cards.levelUpCardTitle'), wrap);
}

/**
 * ShopPicker: "geniş market" demosu — 14 kartlık havuzdan 4'ü teklif edilir,
 * reroll (ücretli, artan maliyetli) unlocked teklifleri yeniler, lock belirli
 * bir teklifi reroll'dan korur. Bu iki özelliğin GERÇEK mantığı (RNG, maliyet
 * eğrisi, hangi kartların korunacağı) burada yaşar — `ShopPicker`'ın kendisi
 * yalnızca butonları çizer ve niyeti `onReroll`/`onToggle` ile bildirir.
 *
 * `slotArea` (gerçek oyunda Q/E yetenek slotları) burada da doldurulur —
 * `ShopPicker`'ın "çağıranın kendi içeriğini koyabileceği alan" sözleşmesinin
 * boş kalmaması için; alınan bir yetenek kartı otomatik ilk boş slota gider.
 *
 * Bakiye bilinçli olarak yüksek (500) — çoklu satın alma senaryolarını
 * (art arda alım, envanter satışı, reroll'la aynı anda) engelsiz test etmek
 * için.
 */
function buildShopCard(
  uiRootElement: HTMLElement,
  disposables: Destroyable[],
  registerCloser: RegisterCloser,
  closeAllExcept: CloseAllExcept,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  let balance = 500;
  let rerollCost = REROLL_BASE_COST;
  const purchased = new Set<DemoCardId>();
  const locked = new Set<DemoCardId>();
  const owned: { entry: ShopInventoryEntry; id: DemoCardId }[] = [];
  const slots: (DemoCardId | null)[] = new Array<DemoCardId | null>(ABILITY_SLOT_COUNT).fill(null);
  let currentOfferIds: DemoCardId[] = [];

  /**
   * Kilitli teklifler aynı slotta kalır; yalnızca kilitli olmayan slotlar
   * yeniden çekilir. Böylece 3. kart kilitlendiyse reroll sonrası 3. sırada
   * durmaya devam eder, 1. sıraya atlamaz.
   */
  function refreshOffers(): void {
    const keep = currentOfferIds.filter((id) => locked.has(id) && !purchased.has(id));
    const keepSet = new Set(keep);
    const pool = SHOP_POOL.filter((id) => !purchased.has(id) && !keepSet.has(id));
    const needed = Math.max(0, SHOP_SIZE - keep.length);
    const fresh = pickRandom(pool, needed);
    const freshQueue = [...fresh];

    // Havuz istenen sayıyı karşılayamazsa slot BOŞ bırakılır. Önceki fallback
    // zinciri (`?? current ?? fresh[0] ?? 'cardTurret'`) aynı kartı birden
    // fazla slota koyabiliyordu; `ShopPicker` teklifleri id'ye göre Map'te
    // tuttuğu için iki slot tek karta çöküyor ve teklif sayısı sessizce
    // azalıyordu. Ayrıca son çare `'cardTurret'` satın alınmış olsa bile
    // vitrine girebiliyordu.
    const used = new Set<DemoCardId>();
    const next: DemoCardId[] = [];

    for (let i = 0; i < SHOP_SIZE; i++) {
      const current = currentOfferIds[i];
      if (current && locked.has(current) && !purchased.has(current) && !used.has(current)) {
        used.add(current);
        next.push(current);
        continue;
      }
      const drawn = freshQueue.shift();
      if (drawn !== undefined && !used.has(drawn)) {
        used.add(drawn);
        next.push(drawn);
      }
    }

    currentOfferIds = next;
  }

  refreshOffers();

  const shop = new ShopPicker({
    labels: {
      buy: i18next.t('volui:cards.buy'),
      owned: i18next.t('volui:cards.owned'),
      tooExpensive: i18next.t('volui:cards.tooExpensive'),
      abilitiesTitle: i18next.t('volui:cards.abilitiesTitle'),
      passivesTitle: i18next.t('volui:cards.passivesTitle'),
      empty: i18next.t('volui:cards.inventoryEmpty'),
      close: i18next.t('volui:cards.close'),
    },
    reroll: {
      label: i18next.t('volui:cards.reroll'),
      onReroll: () => {
        if (balance < rerollCost) return;
        balance -= rerollCost;
        refreshOffers();
        rerollCost += REROLL_COST_STEP;
        // Panel reroll'u tahmin etmez; niyeti çağıran bildirir. Kilitli
        // teklifler yerinde kalır, kilitsizler giriş animasyonuyla yenilenir.
        render('reroll');
      },
    },
    lock: {
      lockLabel: i18next.t('volui:cards.lock'),
      unlockLabel: i18next.t('volui:cards.unlock'),
      onToggle: (id) => {
        const cardId = id as DemoCardId;
        if (locked.has(cardId)) {
          locked.delete(cardId);
        } else {
          locked.add(cardId);
        }
        render();
      },
    },
    onBuy: (id) => {
      const cardId = id as DemoCardId;
      const demo = DEMO_CARDS[cardId];
      if (!demo || purchased.has(cardId) || balance < demo.price) return;

      balance -= demo.price;
      purchased.add(cardId);
      // Satın alınan kart artık teklif değil — kilit anlamsız kalır.
      locked.delete(cardId);
      owned.push({
        id: cardId,
        entry: {
          instanceId: `${cardId}#${owned.length + 1}`,
          card: demoCard(cardId),
          sellLabel: i18next.t('volui:cards.sell', { value: Math.floor(demo.price / 2) }),
          dragData: demo.type === 'ability' ? `${cardId}#${owned.length + 1}` : undefined,
        },
      });

      // Gerçek oyundaki gibi: yeni alınan bir yetenek, boş slot varsa
      // otomatik yerleşir (bkz. TODO.md — "yeni alınan ability boş slot
      // varsa OTOMATİK yerleşir").
      if (demo.type === 'ability') {
        const emptyIndex = slots.indexOf(null);
        if (emptyIndex !== -1) slots[emptyIndex] = cardId;
      }

      render();
      renderSlots();
    },
    onSell: (instanceId) => {
      const index = owned.findIndex((item) => item.entry.instanceId === instanceId);
      if (index < 0) return;
      const [sold] = owned.splice(index, 1);
      balance += Math.floor(DEMO_CARDS[sold.id].price / 2);
      purchased.delete(sold.id);

      const slotIndex = slots.indexOf(sold.id);
      if (slotIndex !== -1) slots[slotIndex] = null;

      render();
      renderSlots();
    },
    onClose: () => controller.close(),
  });
  disposables.push(shop);

  function buildState(): ShopPickerState {
    return {
      offers: currentOfferIds.map((id) => ({
        card: demoCard(id, { withPrice: true }),
        purchased: purchased.has(id),
        affordable: balance >= DEMO_CARDS[id].price,
        locked: locked.has(id),
      })),
      abilities: owned
        .filter((item) => DEMO_CARDS[item.id].type === 'ability')
        .map((item) => item.entry),
      passives: owned
        .filter((item) => DEMO_CARDS[item.id].type !== 'ability')
        .map((item) => item.entry),
      balanceLabel: i18next.t('volui:cards.balance', { amount: balance }),
      title: i18next.t('volui:cards.shopTitle'),
      hint: i18next.t('volui:cards.shopHint'),
      reroll: {
        costLabel: i18next.t('volui:cards.price', { price: rerollCost }),
        affordable: balance >= rerollCost,
      },
    };
  }

  function render(transition?: ShopPickerState['transition']): void {
    shop.render({ ...buildState(), transition });
  }

  // `shop.slotArea` — "çağıranın kendi içeriğini koyabileceği alan" (bkz.
  // ShopPicker dokümantasyonu). Gerçek oyunda burası AbilityLoadout'un
  // (Q/E slotları) yaşadığı yer; showcase'de aynı sözleşmeyi göstermek için
  // basit, sürüklemesiz bir slot listesi kuruyoruz.
  const slotsTitle = new Text(i18next.t('volui:cards.slotsTitle'), { variant: 'muted' });
  shop.slotArea.appendChild(slotsTitle.element);
  const slotRow = document.createElement('div');
  slotRow.className = 'vol-showcase-ability-slots';
  shop.slotArea.appendChild(slotRow);
  disposables.push(slotsTitle);

  function renderSlots(): void {
    slotRow.replaceChildren();
    for (const cardId of slots) {
      const slot = document.createElement('div');
      slot.className = 'vol-showcase-ability-slots__slot';
      slot.textContent = cardId
        ? i18next.t(`volui:cards.${cardId}.title` as 'volui:cards.turret.title')
        : i18next.t('volui:cards.slotEmpty');
      slot.classList.toggle('vol-showcase-ability-slots__slot--filled', cardId !== null);
      slotRow.appendChild(slot);
    }
  }

  render();
  renderSlots();

  const layer = buildCardLayer(uiRootElement, shop.element);
  disposables.push({ destroy: () => layer.remove() });

  const open = new Button(i18next.t('volui:cards.openShop'), {
    variant: 'primary',
    onClick: () => {
      closeAllExcept(controller.close);
      render();
      // Katman önce görünür hale gelir; `shop.show()` panel açılış
      // animasyonunu görünür ağaçta başlatır.
      controller.open();
      shop.show();
    },
  });
  disposables.push(open);

  const controller = createLayerController(layer, shop, open);
  registerCloser(controller.close);

  wrap.appendChild(open.element);
  return card(i18next.t('volui:cards.shopCardTitle'), wrap);
}

/**
 * Kart component'leri sekmesi — CardTile, LevelUpPicker, ShopPicker.
 *
 * CardTile kartı ÜSTTE tam genişlikte durur: örnek kartlar
 * (`.vol-showcase-card-row`, auto-fit grid) ancak geniş bir konteynerde yan
 * yana sığar. LevelUpPicker/ShopPicker ALTTA, yüzde-elli bölünmüş ayrı bir
 * satırda yan yana durur; ikisinin panelleri artık kendi kartlarının İÇİNDE
 * değil, `uiRootElement`'e mount edilmiş ortak bir overlay katmanında açılır
 * (bkz. `buildCardLayer`) — `games/vol-hell`'deki gerçek kullanım deseniyle
 * aynı (ortalanmış, kararmış, tam ekran, yumuşak geçişli).
 */
export function buildCardsTab(uiRootElement: HTMLElement): {
  element: HTMLElement;
  destroy: () => void;
} {
  const disposables: Destroyable[] = [];
  const closeHandlers: Array<() => void> = [];
  const registerCloser: RegisterCloser = (close) => closeHandlers.push(close);
  const closeAllExcept: CloseAllExcept = (except) => {
    for (const close of closeHandlers) {
      if (close !== except) close();
    }
  };

  const bottomRow = document.createElement('div');
  bottomRow.className = 'vol-showcase-cards-bottom-row';
  bottomRow.append(
    buildLevelUpCard(uiRootElement, disposables, registerCloser, closeAllExcept),
    buildShopCard(uiRootElement, disposables, registerCloser, closeAllExcept),
  );

  const element = document.createElement('div');
  element.className = 'vol-showcase-section';
  element.append(buildRarityCard(disposables), bottomRow);

  return {
    element,
    destroy: () => {
      for (const item of disposables) item.destroy();
    },
  };
}
