import {
  Button,
  CardTile,
  LevelUpPicker,
  ShopPicker,
  Text,
  i18next,
  type CardRarity,
  type CardTileData,
  type ShopInventoryEntry,
  type ShopPickerState,
} from '@volstudio/core';
import { card, cardGrid } from './shared';

interface Destroyable {
  destroy(): void;
}

/** Showcase kartları — gerçek oyun kataloğundan bağımsız, örnek içerik. */
const DEMO_CARDS = {
  turret: { rarity: 'rare' as CardRarity, price: 10, type: 'ability' },
  chain: { rarity: 'epic' as CardRarity, price: 18, type: 'ability' },
  inferno: { rarity: 'legendary' as CardRarity, price: 32, type: 'ability' },
  sharpEdge: { rarity: 'rare' as CardRarity, price: 10, type: 'passive' },
};

type DemoCardId = keyof typeof DEMO_CARDS;

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

/** CardTile: üç nadirlik kademesinin görsel farkı yan yana. */
function buildRarityCard(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const row = document.createElement('div');
  row.className = 'vol-showcase-card-row';

  const status = new Text(i18next.t('volui:cards.noSelection'), { variant: 'muted' });
  disposables.push(status);

  for (const id of Object.keys(DEMO_CARDS) as DemoCardId[]) {
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

/** LevelUpPicker: iki kart, fiyat yok, seçince kapanır. */
function buildLevelUpCard(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:cards.noSelection'), { variant: 'muted' });
  disposables.push(result);

  const picker = new LevelUpPicker({
    title: i18next.t('volui:cards.levelUpTitle'),
    hint: i18next.t('volui:cards.levelUpHint'),
    selectLabel: i18next.t('volui:cards.select'),
    onSelect: (id) => result.setContent(i18next.t('volui:cards.selected', { id })),
  });
  disposables.push(picker);

  const open = new Button(i18next.t('volui:cards.openLevelUp'), {
    variant: 'primary',
    onClick: () =>
      picker.present([demoCard('turret'), demoCard('inferno')], {
        title: i18next.t('volui:cards.levelUpTitle'),
        hint: i18next.t('volui:cards.levelUpHint'),
      }),
  });
  disposables.push(open);

  wrap.appendChild(picker.element);
  wrap.appendChild(open.element);
  wrap.appendChild(result.element);
  return card(i18next.t('volui:cards.levelUpCardTitle'), wrap);
}

/** ShopPicker: fiyatlı kartlar, alım/satım, iki bölümlü envanter — canlı demo. */
function buildShopCard(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  let balance = 24;
  const purchased = new Set<DemoCardId>();
  const owned: { entry: ShopInventoryEntry; id: DemoCardId }[] = [];

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
    onBuy: (id) => {
      const cardId = id as DemoCardId;
      const demo = DEMO_CARDS[cardId];
      if (!demo || purchased.has(cardId) || balance < demo.price) return;

      balance -= demo.price;
      purchased.add(cardId);
      owned.push({
        id: cardId,
        entry: {
          instanceId: `${cardId}#${owned.length + 1}`,
          card: demoCard(cardId),
          sellLabel: i18next.t('volui:cards.sell', { value: Math.floor(demo.price / 2) }),
          dragData: demo.type === 'ability' ? `${cardId}#${owned.length + 1}` : undefined,
        },
      });
      render();
    },
    onSell: (instanceId) => {
      const index = owned.findIndex((item) => item.entry.instanceId === instanceId);
      if (index < 0) return;
      const [sold] = owned.splice(index, 1);
      balance += Math.floor(DEMO_CARDS[sold.id].price / 2);
      purchased.delete(sold.id);
      render();
    },
    onClose: () => shop.hide(),
  });
  disposables.push(shop);

  function buildState(): ShopPickerState {
    return {
      offers: (Object.keys(DEMO_CARDS) as DemoCardId[]).map((id) => ({
        card: demoCard(id, { withPrice: true }),
        purchased: purchased.has(id),
        affordable: balance >= DEMO_CARDS[id].price,
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
    };
  }

  function render(): void {
    shop.render(buildState());
  }

  render();

  const open = new Button(i18next.t('volui:cards.openShop'), {
    variant: 'primary',
    onClick: () => {
      render();
      shop.show();
    },
  });
  disposables.push(open);

  wrap.appendChild(shop.element);
  wrap.appendChild(open.element);
  return card(i18next.t('volui:cards.shopCardTitle'), wrap);
}

/** Kart component'leri sekmesi — CardTile, LevelUpPicker, ShopPicker. */
export function buildCardsTab(): { element: HTMLElement; destroy: () => void } {
  const disposables: Destroyable[] = [];

  const element = cardGrid([
    buildRarityCard(disposables),
    buildLevelUpCard(disposables),
    buildShopCard(disposables),
  ]);

  return {
    element,
    destroy: () => {
      for (const item of disposables) item.destroy();
    },
  };
}
