/**
 * `ShopPicker`in AÇIK geçiş niyeti — reroll ve kapanış animasyonu.
 *
 * Satın alma/kilit sözleşmeleri `shopPicker.test.ts`te; bölme gerekçesi
 * `cardTile.test.ts`te yazılı.
 */
/**
 * `ShopPicker` sözleşmeleri — satın alma, reroll, kilit ve geçiş niyeti.
 *
 * `CardTile`/`LevelUpPicker` ayrı dosyada (`cardTile.test.ts`); bölme
 * gerekçesi orada yazılı.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { type CardTileData } from '../../src/ui/cards/CardTile';
import { ShopPicker, PURCHASE_FLASH_MS, type ShopPickerState } from '../../src/ui/cards/ShopPicker';

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

describe('ShopPicker — açık geçiş niyeti', () => {
  let root: HTMLDivElement;

  const LABELS = SHOP_LABELS;

  type ShopOptions = ConstructorParameters<typeof ShopPicker>[0];

  function makeShop(over: Partial<ShopOptions> = {}): ShopPicker {
    const shop = new ShopPicker({
      labels: LABELS,
      onBuy: () => {},
      onSell: () => {},
      onClose: () => {},
      lock: { lockLabel: 'KİLİTLE', unlockLabel: 'AÇ', onToggle: () => {} },
      ...over,
    });
    root.appendChild(shop.element);
    return shop;
  }

  function offersOf(...ids: string[]) {
    return ids.map((id) => ({
      card: { ...makeCard(id), priceLabel: '5 Flux' },
      purchased: false,
      affordable: true,
    }));
  }

  function state(over: Partial<ShopPickerState> = {}): ShopPickerState {
    return {
      offers: offersOf('a', 'b'),
      passives: [],
      abilities: [],
      balanceLabel: 'Flux: 10',
      ...over,
    };
  }

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => root.remove());

  it('transition verilmezse teklif değişimi reroll vurgusu OYNATMAZ', () => {
    const shop = makeShop();
    shop.present(state());
    // Teklif kümesi tamamen değişti ama bu bir reroll değil.
    shop.render(state({ offers: offersOf('c', 'd') }));
    expect(shop.element.classList.contains('vol-card-picker--rerolling')).toBe(false);
    shop.destroy();
  });

  it('reroll DIŞI güncellemede var olan kart düğümü KORUNUR', () => {
    const shop = makeShop();
    shop.present(state());
    const before = shop.element.querySelectorAll('.vol-card')[0];

    // Yalnızca bakiye/alınabilirlik değişti.
    shop.render(
      state({
        offers: [
          { card: { ...makeCard('a'), priceLabel: '5 Flux' }, purchased: false, affordable: false },
          { card: { ...makeCard('b'), priceLabel: '5 Flux' }, purchased: false, affordable: true },
        ],
      }),
    );

    const after = shop.element.querySelectorAll('.vol-card')[0];
    expect(after).toBe(before);
    shop.destroy();
  });

  it("reroll'da kilitli kart yerinde kalır, kilitsiz kart yenilenir", () => {
    const shop = makeShop();
    shop.present(
      state({
        offers: [
          {
            card: { ...makeCard('a'), priceLabel: '5 Flux' },
            purchased: false,
            affordable: true,
            locked: true,
          },
          { card: { ...makeCard('b'), priceLabel: '5 Flux' }, purchased: false, affordable: true },
        ],
      }),
    );
    const lockedBefore = shop.element.querySelectorAll('.vol-card')[0];

    shop.render(
      state({
        transition: 'reroll',
        offers: [
          {
            card: { ...makeCard('a'), priceLabel: '5 Flux' },
            purchased: false,
            affordable: true,
            locked: true,
          },
          { card: { ...makeCard('z'), priceLabel: '5 Flux' }, purchased: false, affordable: true },
        ],
      }),
    );

    const cards = shop.element.querySelectorAll('.vol-card');
    expect(cards[0]).toBe(lockedBefore);
    expect(cards[1]).not.toBe(lockedBefore);
    shop.destroy();
  });

  it('satın alma vurgusu yalnızca İLK kez alındığında oynar', () => {
    vi.useFakeTimers();
    const shop = makeShop();
    shop.present(state());

    const bought = [
      { card: { ...makeCard('a'), priceLabel: '5 Flux' }, purchased: true, affordable: true },
      { card: { ...makeCard('b'), priceLabel: '5 Flux' }, purchased: false, affordable: true },
    ];
    shop.render(state({ offers: bought }));
    const tile = shop.element.querySelectorAll('.vol-card')[0];
    expect(tile?.classList.contains('vol-card--just-purchased')).toBe(true);

    vi.advanceTimersByTime(PURCHASE_FLASH_MS);
    expect(tile?.classList.contains('vol-card--just-purchased')).toBe(false);

    // Aynı durumla ikinci render vurguyu TEKRAR oynatmaz.
    shop.render(state({ offers: bought }));
    expect(tile?.classList.contains('vol-card--just-purchased')).toBe(false);

    shop.destroy();
    vi.useRealTimers();
  });

  it('destroy tüm bekleyen zamanlayıcıları temizler', () => {
    vi.useFakeTimers();
    const shop = makeShop();
    shop.present(state());
    shop.render(state({ transition: 'reroll', offers: offersOf('c', 'd') }));

    shop.destroy();
    // Zamanlayıcı kalırsa yok edilmiş DOM'a dokunup patlar.
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    vi.useRealTimers();
  });
});
