import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CardTile, CARD_DRAG_MIME, type CardTileData } from '../../src/ui/cards/CardTile';
import { LevelUpPicker } from '../../src/ui/cards/LevelUpPicker';
import { ShopPicker, type ShopPickerState } from '../../src/ui/cards/ShopPicker';

function makeCard(id: string, rarity: CardTileData['rarity'] = 'rare'): CardTileData {
  return {
    id,
    title: `${id} başlık`,
    description: `${id} açıklama`,
    rarity,
    rarityLabel: rarity.toUpperCase(),
  };
}

const SHOP_LABELS = {
  buy: 'SATIN AL',
  owned: 'ALINDI',
  tooExpensive: 'YETERSİZ',
  abilitiesTitle: 'Yeteneklerin',
  passivesTitle: 'Pasiflerin',
  empty: 'Kart yok',
  close: 'DEVAM',
};

function action(root: ParentNode): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>('.vol-card__action');
  if (!button) throw new Error('Aksiyon butonu bulunamadı');
  return button;
}

describe('CardTile', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => root.remove());

  it('başlık, açıklama, nadirlik ve tip rozetini yazar', () => {
    const tile = new CardTile({
      data: { ...makeCard('kule', 'legendary'), typeLabel: 'YETENEK' },
    });
    root.appendChild(tile.element);

    expect(tile.element.textContent).toContain('kule başlık');
    expect(tile.element.textContent).toContain('kule açıklama');
    expect(tile.element.textContent).toContain('LEGENDARY');
    expect(tile.element.textContent).toContain('YETENEK');
    tile.destroy();
  });

  it('nadirlik CSS class’ına yansır — görsel fark yalnızca stille verilir', () => {
    for (const rarity of ['rare', 'epic', 'legendary'] as const) {
      const tile = new CardTile({ data: makeCard('k', rarity) });
      expect(tile.element.classList.contains(`vol-card--${rarity}`)).toBe(true);
      tile.destroy();
    }
  });

  it('fiyat verilmezse fiyat satırı çizilmez — level-up ücretsizdir', () => {
    const free = new CardTile({ data: makeCard('a') });
    expect(free.element.querySelector('.vol-card__price')).toBeNull();

    const priced = new CardTile({ data: { ...makeCard('b'), priceLabel: '18 Flux' } });
    expect(priced.element.querySelector('.vol-card__price')?.textContent).toBe('18 Flux');

    free.destroy();
    priced.destroy();
  });

  it('aksiyon verilmezse buton çizilmez — kart yanlışlıkla harcanamaz', () => {
    const tile = new CardTile({ data: makeCard('a') });
    expect(tile.element.querySelector('.vol-card__action')).toBeNull();
    tile.destroy();
  });

  it('kart GÖVDESİNE tıklamak hiçbir şey tetiklemez', () => {
    const onAction = vi.fn();
    const tile = new CardTile({ data: makeCard('a'), actionLabel: 'SAT', onAction });

    tile.element.click();
    expect(onAction).not.toHaveBeenCalled();

    action(tile.element).click();
    expect(onAction).toHaveBeenCalledWith('a');
    tile.destroy();
  });

  it('devre dışı aksiyon çalışmaz', () => {
    const onAction = vi.fn();
    const tile = new CardTile({
      data: makeCard('a'),
      actionLabel: 'SATIN AL',
      disabled: true,
      onAction,
    });

    action(tile.element).click();
    expect(onAction).not.toHaveBeenCalled();
    expect(action(tile.element).disabled).toBe(true);
    tile.destroy();
  });

  it('setDisabled butonu ve durum metnini günceller', () => {
    const tile = new CardTile({ data: makeCard('a'), actionLabel: 'SATIN AL' });
    tile.setDisabled(true, 'ALINDI');

    expect(action(tile.element).disabled).toBe(true);
    expect(tile.element.querySelector('.vol-card__status')?.textContent).toBe('ALINDI');
    tile.destroy();
  });

  it('dragData verilince kart sürüklenebilir olur ve kimliği taşır', () => {
    const tile = new CardTile({ data: makeCard('kule'), dragData: 'kule#3' });
    expect(tile.element.draggable).toBe(true);

    const transferred = new Map<string, string>();
    const event = new Event('dragstart') as DragEvent & { dataTransfer: unknown };
    Object.defineProperty(event, 'dataTransfer', {
      value: { setData: (type: string, value: string) => transferred.set(type, value) },
    });
    tile.element.dispatchEvent(event);

    expect(transferred.get(CARD_DRAG_MIME)).toBe('kule#3');
    expect(transferred.get('text/plain')).toBe('kule#3');
    tile.destroy();
  });

  it('destroy elementi DOM’dan kaldırır', () => {
    const tile = new CardTile({ data: makeCard('a') });
    root.appendChild(tile.element);
    tile.destroy();
    expect(root.querySelector('.vol-card')).toBeNull();
  });
});

describe('LevelUpPicker', () => {
  let root: HTMLDivElement;

  function makePicker(onSelect = vi.fn()): { picker: LevelUpPicker; onSelect: typeof onSelect } {
    const picker = new LevelUpPicker({ selectLabel: 'SEÇ', onSelect });
    root.appendChild(picker.element);
    return { picker, onSelect };
  }

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => root.remove());

  it('başlangıçta gizlidir', () => {
    const { picker } = makePicker();
    expect(picker.isVisible()).toBe(false);
    expect(picker.element.hidden).toBe(true);
    picker.destroy();
  });

  it('present verilen kartları çizer ve paneli açar', () => {
    const { picker } = makePicker();
    picker.present([makeCard('a'), makeCard('b')], { title: 'SEVİYE 2', hint: 'Bir kart seç' });

    expect(picker.isVisible()).toBe(true);
    expect(picker.element.querySelectorAll('.vol-card')).toHaveLength(2);
    expect(picker.element.textContent).toContain('SEVİYE 2');
    picker.destroy();
  });

  it('SEÇ butonu bildirir ve paneli kapatır', () => {
    const { picker, onSelect } = makePicker();
    picker.present([makeCard('a'), makeCard('b')]);

    picker.element.querySelectorAll<HTMLButtonElement>('.vol-card__action')[1].click();

    expect(onSelect).toHaveBeenCalledWith('b');
    expect(picker.isVisible()).toBe(false);
    picker.destroy();
  });

  it('yeni teklif eski kartların yerine geçer', () => {
    const { picker } = makePicker();
    picker.present([makeCard('a'), makeCard('b')]);
    picker.present([makeCard('c')]);

    expect(picker.element.querySelectorAll('.vol-card')).toHaveLength(1);
    expect(picker.element.textContent).toContain('c başlık');
    picker.destroy();
  });

  it('fiyat göstermez', () => {
    const { picker } = makePicker();
    picker.present([makeCard('a')]);
    expect(picker.element.querySelector('.vol-card__price')).toBeNull();
    picker.destroy();
  });
});

describe('ShopPicker', () => {
  let root: HTMLDivElement;

  function makeState(overrides: Partial<ShopPickerState> = {}): ShopPickerState {
    return {
      offers: [
        { card: { ...makeCard('a'), priceLabel: '10 Flux' }, purchased: false, affordable: true },
        { card: { ...makeCard('b'), priceLabel: '32 Flux' }, purchased: false, affordable: false },
      ],
      abilities: [],
      passives: [],
      balanceLabel: 'Flux: 12',
      title: 'DÜKKAN — DALGA 1',
      hint: 'Kart al',
      ...overrides,
    };
  }

  function makeShop(
    handlers: Partial<{ onBuy: () => void; onSell: () => void; onClose: () => void }> = {},
  ) {
    const shop = new ShopPicker({
      labels: SHOP_LABELS,
      onBuy: handlers.onBuy ?? vi.fn(),
      onSell: handlers.onSell ?? vi.fn(),
      onClose: handlers.onClose ?? vi.fn(),
    });
    root.appendChild(shop.element);
    return shop;
  }

  function offerActions(shop: ShopPicker): HTMLButtonElement[] {
    return [
      ...shop.element.querySelectorAll<HTMLButtonElement>(
        '.vol-card-picker__grid .vol-card__action',
      ),
    ];
  }

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => root.remove());

  it('teklifleri fiyatlarıyla ve bakiyeyle gösterir', () => {
    const shop = makeShop();
    shop.present(makeState());

    expect(shop.isVisible()).toBe(true);
    expect(shop.element.querySelectorAll('.vol-card__price')).toHaveLength(2);
    expect(shop.element.textContent).toContain('Flux: 12');
    shop.destroy();
  });

  it('bakiye yetmeyen kartın butonu kilitli ve uyarı metinli', () => {
    const onBuy = vi.fn();
    const shop = makeShop({ onBuy });
    shop.present(makeState());

    const buttons = offerActions(shop);
    expect(buttons[1].disabled).toBe(true);
    buttons[1].click();
    expect(onBuy).not.toHaveBeenCalled();
    expect(shop.element.textContent).toContain('YETERSİZ');
    shop.destroy();
  });

  it('SATIN AL butonu alımı bildirir', () => {
    const onBuy = vi.fn();
    const shop = makeShop({ onBuy });
    shop.present(makeState());

    offerActions(shop)[0].click();

    expect(onBuy).toHaveBeenCalledWith('a');
    shop.destroy();
  });

  it('satın alınan kart ALINDI olur ve tekrar alınamaz', () => {
    const shop = makeShop();
    shop.present(makeState());
    shop.render(
      makeState({
        offers: [
          { card: { ...makeCard('a'), priceLabel: '10 Flux' }, purchased: true, affordable: true },
        ],
      }),
    );

    expect(offerActions(shop)[0].disabled).toBe(true);
    expect(shop.element.textContent).toContain('ALINDI');
    shop.destroy();
  });

  it('alım paneli kapatmaz — oyuncu ikinci kartı da alabilir', () => {
    const onClose = vi.fn();
    const shop = makeShop({ onClose });
    shop.present(makeState());

    offerActions(shop)[0].click();

    expect(shop.isVisible()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    shop.destroy();
  });

  it('devam et butonu paneli kapatır', () => {
    const onClose = vi.fn();
    const shop = makeShop({ onClose });
    shop.present(makeState());

    shop.element.querySelector<HTMLButtonElement>('.vol-card-shop__close')!.click();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(shop.isVisible()).toBe(false);
    shop.destroy();
  });

  it('envanter iki bölüme ayrılır: yetenekler ve pasifler', () => {
    const shop = makeShop();
    shop.present(
      makeState({
        abilities: [
          { instanceId: 'kule#1', card: makeCard('kule'), sellLabel: 'SAT +5', dragData: 'kule#1' },
        ],
        passives: [{ instanceId: 'keskin#1', card: makeCard('keskin'), sellLabel: 'SAT +5' }],
      }),
    );

    expect(shop.element.querySelectorAll('.vol-card-shop__abilities .vol-card')).toHaveLength(1);
    expect(shop.element.querySelectorAll('.vol-card-shop__passives .vol-card')).toHaveLength(1);
    shop.destroy();
  });

  it('pasif kartlar ne yaptıklarını gösterir — envanterde açıklama gizlenmez', () => {
    const shop = makeShop();
    shop.present(
      makeState({
        passives: [{ instanceId: 'keskin#1', card: makeCard('keskin'), sellLabel: 'SAT +5' }],
      }),
    );

    const passive = shop.element.querySelector('.vol-card-shop__passives .vol-card');
    expect(passive?.textContent).toContain('keskin açıklama');
    shop.destroy();
  });

  it('yetenek kartları sürüklenebilir, pasifler değil', () => {
    const shop = makeShop();
    shop.present(
      makeState({
        abilities: [
          { instanceId: 'kule#1', card: makeCard('kule'), sellLabel: 'SAT +5', dragData: 'kule#1' },
        ],
        passives: [{ instanceId: 'keskin#1', card: makeCard('keskin'), sellLabel: 'SAT +5' }],
      }),
    );

    const ability = shop.element.querySelector<HTMLElement>('.vol-card-shop__abilities .vol-card');
    const passive = shop.element.querySelector<HTMLElement>('.vol-card-shop__passives .vol-card');
    expect(ability?.draggable).toBe(true);
    expect(passive?.draggable).toBe(false);
    shop.destroy();
  });

  it('SAT butonu satışı bildirir — karta tıklamak satmaz', () => {
    const onSell = vi.fn();
    const shop = makeShop({ onSell });
    shop.present(
      makeState({
        passives: [{ instanceId: 'keskin#1', card: makeCard('keskin'), sellLabel: 'SAT +5' }],
      }),
    );

    const tile = shop.element.querySelector<HTMLElement>('.vol-card-shop__passives .vol-card')!;
    tile.click();
    expect(onSell).not.toHaveBeenCalled();

    action(tile).click();
    expect(onSell).toHaveBeenCalledWith('keskin#1');
    shop.destroy();
  });

  it('boş bölümde bilgi metni gösterir', () => {
    const shop = makeShop();
    shop.present(makeState());

    expect(shop.element.querySelectorAll('.vol-card-shop__empty')).toHaveLength(2);
    shop.destroy();
  });

  it('slotArea çağıranın kendi içeriğini koyabileceği alandır', () => {
    const shop = makeShop();
    const marker = document.createElement('div');
    marker.className = 'test-slots';
    shop.slotArea.appendChild(marker);

    expect(shop.element.querySelector('.test-slots')).not.toBeNull();
    shop.destroy();
  });

  it('render paneli kapatmadan içeriği tazeler', () => {
    const shop = makeShop();
    shop.present(makeState());
    shop.render(makeState({ balanceLabel: 'Flux: 2' }));

    expect(shop.isVisible()).toBe(true);
    expect(shop.element.textContent).toContain('Flux: 2');
    shop.destroy();
  });
});
