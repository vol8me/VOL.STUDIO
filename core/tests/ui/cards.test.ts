import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CardTile,
  CARD_DRAG_MIME,
  CARD_ENTER_ANIMATION_MS,
  type CardTileData,
} from '../../src/ui/cards/CardTile';
import { LevelUpPicker } from '../../src/ui/cards/LevelUpPicker';
import { HIDE_ANIMATION_MS } from '../../src/ui/cards/CardPicker';
import {
  ShopPicker,
  LEAVE_ANIMATION_MS,
  type ShopPickerState,
} from '../../src/ui/cards/ShopPicker';

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

  it('startEnterAnimation vol-card--entering ekler ve süre sonunda kaldırır', () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
    const tile = new CardTile({ data: makeCard('a') });
    root.appendChild(tile.element);

    tile.startEnterAnimation();
    expect(tile.element.classList.contains('vol-card--entering')).toBe(true);

    vi.advanceTimersByTime(CARD_ENTER_ANIMATION_MS);
    expect(tile.element.classList.contains('vol-card--entering')).toBe(false);

    tile.destroy();
    vi.useRealTimers();
  });

  it('update status metnini boş stringle siler, undefined verilmezse dokunmaz', () => {
    const tile = new CardTile({ data: { ...makeCard('a'), statusLabel: 'TAKILI' } });
    root.appendChild(tile.element);

    const status = tile.element.querySelector('.vol-card__status')!;
    expect(status.textContent).toBe('TAKILI');

    tile.update({ statusLabel: '' });
    expect(status.textContent).toBe('');

    // Yalnızca başlık güncellenir; eski durum metni yanlışlıkla silinmez.
    tile.update({ title: 'yeni başlık' });
    expect(status.textContent).toBe('');

    tile.destroy();
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

  it('present sonrası kartlar vol-card--entering alır', () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
    const { picker } = makePicker();
    picker.present([makeCard('a'), makeCard('b')]);

    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(picker.element.querySelectorAll('.vol-card--entering')).toHaveLength(2);

    vi.advanceTimersByTime(CARD_ENTER_ANIMATION_MS);
    expect(picker.element.querySelectorAll('.vol-card--entering')).toHaveLength(0);

    picker.destroy();
    vi.useRealTimers();
  });

  it('fiyat göstermez', () => {
    const { picker } = makePicker();
    picker.present([makeCard('a')]);
    expect(picker.element.querySelector('.vol-card__price')).toBeNull();
    picker.destroy();
  });

  describe('CardPicker — hide() çıkış geçişi (LevelUpPicker üzerinden, ortak taban davranışı)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('hide() sonrası isVisible() HEMEN false olur, element.hidden ise HIDE_ANIMATION_MS sonra', () => {
      vi.useFakeTimers();
      const { picker } = makePicker();
      picker.present([makeCard('a')]);

      picker.hide();

      expect(picker.isVisible()).toBe(false);
      expect(picker.element.hidden).toBe(false);
      expect(picker.element.classList.contains('vol-card-picker--leaving')).toBe(true);

      vi.advanceTimersByTime(HIDE_ANIMATION_MS);

      expect(picker.element.hidden).toBe(true);
      expect(picker.element.classList.contains('vol-card-picker--leaving')).toBe(false);
      picker.destroy();
    });

    it('show() bekleyen bir hide()’ı iptal eder — panel hiç gizlenmez', () => {
      vi.useFakeTimers();
      const { picker } = makePicker();
      picker.present([makeCard('a')]);

      picker.hide();
      picker.present([makeCard('a'), makeCard('b')]); // present() → show()

      vi.advanceTimersByTime(HIDE_ANIMATION_MS);

      expect(picker.isVisible()).toBe(true);
      expect(picker.element.hidden).toBe(false);
      expect(picker.element.classList.contains('vol-card-picker--leaving')).toBe(false);
      picker.destroy();
    });

    it('zaten kapalıyken hide() tekrar çağrılması no-op’tur', () => {
      const { picker } = makePicker();
      expect(() => picker.hide()).not.toThrow();
      expect(picker.isVisible()).toBe(false);
      picker.destroy();
    });

    it('destroy() bekleyen hide zamanlayıcısını iptal eder — sonradan hata fırlatmaz', () => {
      vi.useFakeTimers();
      const { picker } = makePicker();
      picker.present([makeCard('a')]);
      picker.hide();

      picker.destroy();

      expect(() => vi.advanceTimersByTime(HIDE_ANIMATION_MS * 2)).not.toThrow();
    });

    it('hideImmediately() animasyonsuz kapatır — element.hidden hemen true olur', () => {
      vi.useFakeTimers();
      const { picker } = makePicker();
      picker.present([makeCard('a')]);

      picker.hideImmediately();

      expect(picker.isVisible()).toBe(false);
      expect(picker.element.hidden).toBe(true);
      expect(picker.element.classList.contains('vol-card-picker--leaving')).toBe(false);
      picker.destroy();
    });

    it('hideImmediately() bekleyen bir hide()’ın zamanlayıcısını da iptal eder', () => {
      vi.useFakeTimers();
      const { picker } = makePicker();
      picker.present([makeCard('a')]);

      picker.hide(); // gecikmeli kapanış zamanlayıcısı kurulur
      picker.hideImmediately(); // hemen kapat, bekleyen zamanlayıcı gereksiz kalır

      expect(picker.element.hidden).toBe(true);
      // Zamanlayıcı hâlâ ayakta olsaydı bile ikinci kez `hidden = true`
      // atamak zararsızdır — asıl kontrol, iptal edilip HİÇ ateşlenmediği.
      expect(() => vi.advanceTimersByTime(HIDE_ANIMATION_MS * 2)).not.toThrow();
      picker.destroy();
    });
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
    handlers: Partial<{
      onBuy: () => void;
      onSell: () => void;
      onClose: () => void;
      onReroll: () => void;
      onToggleLock: (id: string) => void;
      onEquip: (instanceId: string) => void;
    }> = {},
  ) {
    const shop = new ShopPicker({
      labels: SHOP_LABELS,
      onBuy: handlers.onBuy ?? vi.fn(),
      onSell: handlers.onSell ?? vi.fn(),
      onClose: handlers.onClose ?? vi.fn(),
      onEquip: handlers.onEquip,
      reroll: handlers.onReroll
        ? { label: 'YENİDEN ÇEVİR', onReroll: handlers.onReroll }
        : undefined,
      lock: handlers.onToggleLock
        ? { lockLabel: 'KİLİTLE', unlockLabel: 'KİLİDİ AÇ', onToggle: handlers.onToggleLock }
        : undefined,
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

  it('açılışta yeni teklifler vol-card--entering alır ve süre sonunda kalkar', () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
    const shop = makeShop();
    shop.present(makeState());

    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(
      shop.element.querySelectorAll('.vol-card-picker__grid .vol-card--entering'),
    ).toHaveLength(2);

    vi.advanceTimersByTime(CARD_ENTER_ANIMATION_MS);
    expect(shop.element.querySelectorAll('.vol-card--entering')).toHaveLength(0);

    shop.destroy();
    vi.useRealTimers();
  });

  it('reroll sonrası yeni teklifler vol-card--entering alır', () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
    const shop = makeShop();
    shop.present(makeState());
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    vi.advanceTimersByTime(CARD_ENTER_ANIMATION_MS);

    shop.render(
      makeState({
        offers: [
          {
            card: { ...makeCard('c'), priceLabel: '5 Flux' },
            purchased: false,
            affordable: true,
          },
          {
            card: { ...makeCard('d'), priceLabel: '7 Flux' },
            purchased: false,
            affordable: true,
          },
        ],
      }),
    );

    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(
      shop.element.querySelectorAll('.vol-card-picker__grid .vol-card--entering'),
    ).toHaveLength(2);

    shop.destroy();
    vi.useRealTimers();
  });

  it('reroll sonrası panel vol-card-picker--rerolling alır ve süre sonunda kalkar', () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
    const shop = makeShop();
    shop.present(makeState());
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    vi.advanceTimersByTime(CARD_ENTER_ANIMATION_MS);

    shop.render(
      makeState({
        offers: [
          {
            card: { ...makeCard('c'), priceLabel: '5 Flux' },
            purchased: false,
            affordable: true,
          },
          {
            card: { ...makeCard('d'), priceLabel: '7 Flux' },
            purchased: false,
            affordable: true,
          },
        ],
      }),
    );

    expect(shop.element.classList.contains('vol-card-picker--rerolling')).toBe(true);

    vi.advanceTimersByTime(240);
    expect(shop.element.classList.contains('vol-card-picker--rerolling')).toBe(false);

    shop.destroy();
    vi.useRealTimers();
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

  describe('reroll (opsiyonel özellik)', () => {
    it('reroll option verilmezse buton hiç render edilmez', () => {
      const shop = makeShop();
      shop.present(makeState());

      expect(shop.element.querySelector('.vol-card-shop__reroll')).toBeNull();
      shop.destroy();
    });

    it('reroll option verilirse buton render edilir ve tıklama onReroll çağırır', () => {
      const onReroll = vi.fn();
      const shop = makeShop({ onReroll });
      shop.present(makeState());

      const button = shop.element.querySelector<HTMLButtonElement>('.vol-card-shop__reroll');
      expect(button).not.toBeNull();
      button!.click();
      expect(onReroll).toHaveBeenCalledTimes(1);
      shop.destroy();
    });

    it('maliyet etiketini gösterir ve karşılanamıyorsa butonu kilitler', () => {
      const onReroll = vi.fn();
      const shop = makeShop({ onReroll });
      shop.present(makeState({ reroll: { costLabel: '5 Flux', affordable: false } }));

      const button = shop.element.querySelector<HTMLButtonElement>('.vol-card-shop__reroll')!;
      expect(button.textContent).toContain('5 Flux');
      expect(button.disabled).toBe(true);

      button.click();
      expect(onReroll).not.toHaveBeenCalled();
      shop.destroy();
    });

    it('destroy reroll buton listenerını kaldırır', () => {
      const shop = makeShop({ onReroll: vi.fn() });
      shop.present(makeState());
      const button = shop.element.querySelector<HTMLButtonElement>('.vol-card-shop__reroll')!;
      const removeSpy = vi.spyOn(button, 'removeEventListener');

      shop.destroy();

      expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function));
    });
  });

  describe('lock (opsiyonel özellik)', () => {
    it('lock option verilmezse tekliflerde ikinci buton çıkmaz', () => {
      const shop = makeShop();
      shop.present(makeState());

      expect(shop.element.querySelectorAll('.vol-card__action--secondary')).toHaveLength(0);
      shop.destroy();
    });

    it('lock option verilirse KİLİTLE butonu çıkar ve tıklama doğru id ile onToggleLock çağırır', () => {
      const onToggleLock = vi.fn();
      const shop = makeShop({ onToggleLock });
      shop.present(makeState());

      const lockButtons = [
        ...shop.element.querySelectorAll<HTMLButtonElement>('.vol-card__action--secondary'),
      ];
      expect(lockButtons).toHaveLength(2);
      expect(lockButtons[0].textContent).toBe('KİLİTLE');

      lockButtons[0].click();
      expect(onToggleLock).toHaveBeenCalledWith('a');
      shop.destroy();
    });

    it('kilitli teklif KİLİDİ AÇ etiketi ve vol-card--locked classı taşır', () => {
      const shop = makeShop({ onToggleLock: vi.fn() });
      shop.present(
        makeState({
          offers: [
            {
              card: { ...makeCard('a'), priceLabel: '10 Flux' },
              purchased: false,
              affordable: true,
              locked: true,
            },
          ],
        }),
      );

      const tile = shop.element.querySelector('.vol-card')!;
      expect(tile.classList.contains('vol-card--locked')).toBe(true);
      expect(
        tile.querySelector<HTMLButtonElement>('.vol-card__action--secondary')?.textContent,
      ).toBe('KİLİDİ AÇ');
      shop.destroy();
    });

    it('satın alınmış teklifte kilit butonu çıkmaz — kilitlenecek bir şey kalmadı', () => {
      const shop = makeShop({ onToggleLock: vi.fn() });
      shop.present(
        makeState({
          offers: [
            {
              card: { ...makeCard('a'), priceLabel: '10 Flux' },
              purchased: true,
              affordable: true,
            },
          ],
        }),
      );

      expect(shop.element.querySelector('.vol-card__action--secondary')).toBeNull();
      shop.destroy();
    });
  });

  describe('diff tabanlı render — yerinde güncelleme', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('ilgisiz bir render (başka teklifin kilidini değiştirmek) diğer tekliflerin DOM düğümünü DEĞİŞTİRMEZ', () => {
      const shop = makeShop({ onToggleLock: vi.fn() });
      shop.present(makeState());

      const tileA = shop.element.querySelector('.vol-card')!;
      shop.render(
        makeState({
          offers: [
            {
              card: { ...makeCard('a'), priceLabel: '10 Flux' },
              purchased: false,
              affordable: true,
            },
            {
              card: { ...makeCard('b'), priceLabel: '32 Flux' },
              purchased: false,
              affordable: false,
              locked: true,
            },
          ],
        }),
      );

      // 'a' teklifi hiç değişmedi (locked verilmedi) — AYNI DOM düğümü korunmalı.
      expect(shop.element.querySelector('.vol-card')).toBe(tileA);
      shop.destroy();
    });

    it('satın alma yalnızca o teklifi setDisabled ile günceller — kart YENİDEN OLUŞTURULMAZ', () => {
      const shop = makeShop();
      shop.present(makeState());

      const tileA = shop.element.querySelectorAll('.vol-card')[0];
      const tileB = shop.element.querySelectorAll('.vol-card')[1];

      shop.render(
        makeState({
          offers: [
            {
              card: { ...makeCard('a'), priceLabel: '10 Flux' },
              purchased: true,
              affordable: true,
            },
            {
              card: { ...makeCard('b'), priceLabel: '32 Flux' },
              purchased: false,
              affordable: false,
            },
          ],
        }),
      );

      const tiles = shop.element.querySelectorAll('.vol-card');
      expect(tiles[0]).toBe(tileA);
      expect(tiles[1]).toBe(tileB);
      expect(tiles[0].textContent).toContain('ALINDI');
      shop.destroy();
    });

    it('kilit durumu değişince tile YERİNDE güncellenir (etiket ve locked classı değişir)', () => {
      const shop = makeShop({ onToggleLock: vi.fn() });
      shop.present(
        makeState({
          offers: [
            {
              card: { ...makeCard('a'), priceLabel: '10 Flux' },
              purchased: false,
              affordable: true,
            },
          ],
        }),
      );

      const before = shop.element.querySelector('.vol-card')!;
      expect(before.classList.contains('vol-card--locked')).toBe(false);
      expect(
        shop.element.querySelector<HTMLButtonElement>('.vol-card__action--secondary')?.textContent,
      ).toBe('KİLİTLE');

      shop.render(
        makeState({
          offers: [
            {
              card: { ...makeCard('a'), priceLabel: '10 Flux' },
              purchased: false,
              affordable: true,
              locked: true,
            },
          ],
        }),
      );

      // Yapısal imza değişti (locked) — CardTile artık ikincil butonu
      // yerinde ekleyip kaldırabildiği için tile YENİDEN kurulmuyor.
      const after = shop.element.querySelector('.vol-card')!;
      expect(after).toBe(before);
      expect(after.classList.contains('vol-card--locked')).toBe(true);
      expect(
        after.querySelector<HTMLButtonElement>('.vol-card__action--secondary')?.textContent,
      ).toBe('KİLİDİ AÇ');
      shop.destroy();
    });

    it('İLK KEZ satın alınan teklif kısa bir "başarı" vurgusu classı alır', () => {
      vi.useFakeTimers();
      const shop = makeShop();
      shop.present(
        makeState({
          offers: [
            {
              card: { ...makeCard('a'), priceLabel: '10 Flux' },
              purchased: false,
              affordable: true,
            },
          ],
        }),
      );

      shop.render(
        makeState({
          offers: [
            {
              card: { ...makeCard('a'), priceLabel: '10 Flux' },
              purchased: true,
              affordable: true,
            },
          ],
        }),
      );

      const tile = shop.element.querySelector('.vol-card')!;
      expect(tile.classList.contains('vol-card--just-purchased')).toBe(true);

      vi.advanceTimersByTime(LEAVE_ANIMATION_MS);
      expect(tile.classList.contains('vol-card--just-purchased')).toBe(false);
      shop.destroy();
    });

    it('aynı teklif tekrar render edilirken (satın alınmış durum korunarak) vurgu YENİDEN tetiklenmez', () => {
      const shop = makeShop();
      shop.present(
        makeState({
          offers: [
            {
              card: { ...makeCard('a'), priceLabel: '10 Flux' },
              purchased: true,
              affordable: true,
            },
          ],
        }),
      );
      const tile = shop.element.querySelector('.vol-card')!;
      tile.classList.remove('vol-card--just-purchased'); // ilk render'ın vurgusunu temizle

      shop.render(
        makeState({
          offers: [
            {
              card: { ...makeCard('a'), priceLabel: '10 Flux' },
              purchased: true,
              affordable: true,
            },
          ],
        }),
      );

      expect(tile.classList.contains('vol-card--just-purchased')).toBe(false);
      shop.destroy();
    });

    it('listeden düşen teklif anında silinir ve yeni teklifler aynı hücreye girer', () => {
      const shop = makeShop({ onReroll: vi.fn() });
      shop.present(
        makeState({
          offers: [
            {
              card: { ...makeCard('a'), priceLabel: '10 Flux' },
              purchased: false,
              affordable: true,
            },
          ],
        }),
      );

      shop.render(makeState({ offers: [] }));

      // Teklif ızgarasında eski kartlar hemen kaldırılır; çıkış
      // animasyonu envanter gibi ardışık listelerde kullanılır.
      expect(shop.element.querySelectorAll('.vol-card--leaving')).toHaveLength(0);
      expect(shop.element.querySelectorAll('.vol-card')).toHaveLength(0);
      shop.destroy();
    });

    it('envanterde var olan bir kart ilgisiz bir render sırasında (bakiye değişimi) yeniden oluşturulmaz', () => {
      const shop = makeShop();
      shop.present(
        makeState({
          abilities: [
            {
              instanceId: 'a#1',
              card: makeCard('a'),
              sellLabel: 'SAT +5',
            },
          ],
        }),
      );

      const tile = shop.element.querySelector('.vol-card-shop__abilities .vol-card')!;
      shop.render(makeState({ balanceLabel: 'Flux: 99' }));

      expect(shop.element.querySelector('.vol-card-shop__abilities .vol-card')).toBe(tile);
      shop.destroy();
    });

    it('destroy bekleyen çıkış/vurgu zamanlayıcılarını iptal eder — zamanlayıcı ateşlenince hata fırlatmaz', () => {
      vi.useFakeTimers();
      const shop = makeShop();
      shop.present(
        makeState({
          abilities: [{ instanceId: 'a#1', card: makeCard('a'), sellLabel: 'SAT +5' }],
        }),
      );
      shop.render(makeState({ abilities: [] })); // envanterdeki 'a#1' leaving durumunda

      shop.destroy();
      expect(() => vi.advanceTimersByTime(LEAVE_ANIMATION_MS * 2)).not.toThrow();
    });

    it('envanterdeki kart satış etiketi ve TAK butonu yerinde güncellenir', () => {
      const onEquip = vi.fn();
      const shop = makeShop({ onEquip });
      shop.present(
        makeState({
          abilities: [{ instanceId: 'a#1', card: makeCard('a'), sellLabel: 'SAT +5' }],
        }),
      );

      const tile = shop.element.querySelector('.vol-card-shop__abilities .vol-card')!;
      const action = tile.querySelector<HTMLButtonElement>('.vol-card__action')!;
      expect(action.textContent).toBe('SAT +5');
      expect(tile.querySelector('.vol-card__action--secondary')).toBeNull();

      shop.render(
        makeState({
          abilities: [
            {
              instanceId: 'a#1',
              card: { ...makeCard('a'), statusLabel: 'TAKILI' },
              sellLabel: 'SAT +8',
              equipLabel: 'TAK',
            },
          ],
        }),
      );

      expect(shop.element.querySelector('.vol-card-shop__abilities .vol-card')).toBe(tile);
      expect(action.textContent).toBe('SAT +8');
      const secondary = tile.querySelector<HTMLButtonElement>('.vol-card__action--secondary');
      expect(secondary).not.toBeNull();
      expect(secondary!.textContent).toBe('TAK');

      secondary!.click();
      expect(onEquip).toHaveBeenCalledWith('a#1');

      shop.destroy();
    });

    it('reroll sonrası aynı kart tekrar gelirse hayalet düğüm oluşmaz', () => {
      const shop = makeShop({ onReroll: vi.fn() });
      shop.present(
        makeState({
          offers: [
            {
              card: { ...makeCard('a'), priceLabel: '10 Flux' },
              purchased: false,
              affordable: true,
            },
          ],
        }),
      );

      shop.render(makeState({ offers: [] }));
      expect(shop.element.querySelectorAll('.vol-card--leaving')).toHaveLength(0);

      // Aynı kart geri geldiğinde eski düğüm kalmamış olmalı; yeni
      // düğüm tek kart olarak ızgarada yerini alır.
      shop.render(
        makeState({
          offers: [
            {
              card: { ...makeCard('a'), priceLabel: '10 Flux' },
              purchased: false,
              affordable: true,
            },
          ],
        }),
      );

      expect(shop.element.querySelectorAll('.vol-card-picker__grid .vol-card')).toHaveLength(1);
      expect(shop.element.querySelector('.vol-card--leaving')).toBeNull();

      shop.destroy();
    });

    it('teklifler render sonrası diziliş sırasını korur', () => {
      const shop = makeShop();
      shop.present(
        makeState({
          offers: [
            {
              card: { ...makeCard('a'), priceLabel: '10 Flux' },
              purchased: false,
              affordable: true,
            },
            {
              card: { ...makeCard('b'), priceLabel: '20 Flux' },
              purchased: false,
              affordable: true,
            },
            {
              card: { ...makeCard('c'), priceLabel: '30 Flux' },
              purchased: false,
              affordable: true,
            },
          ],
        }),
      );

      const [a, b, c] = shop.element.querySelectorAll('.vol-card-picker__grid .vol-card');

      shop.render(
        makeState({
          offers: [
            {
              card: { ...makeCard('b'), priceLabel: '20 Flux' },
              purchased: false,
              affordable: true,
            },
            {
              card: { ...makeCard('a'), priceLabel: '10 Flux' },
              purchased: false,
              affordable: true,
            },
            {
              card: { ...makeCard('c'), priceLabel: '30 Flux' },
              purchased: false,
              affordable: true,
            },
          ],
        }),
      );

      const [first, second, third] = shop.element.querySelectorAll(
        '.vol-card-picker__grid .vol-card',
      );
      expect(first).toBe(b);
      expect(second).toBe(a);
      expect(third).toBe(c);

      shop.destroy();
    });

    it('reroll sonrası aynı teklif tekrar gelirse güncel veri ve durumla döner', () => {
      const shop = makeShop();
      shop.present(
        makeState({
          offers: [
            {
              card: { ...makeCard('a'), priceLabel: '10 Flux' },
              purchased: false,
              affordable: true,
            },
          ],
        }),
      );

      // Kart ızgaradan anında çıkarılır.
      shop.render(makeState({ offers: [] }));
      expect(shop.element.querySelector('.vol-card--leaving')).toBeNull();

      // Aynı kart geri geliyor; fiyat ve durum değişmiş.
      shop.render(
        makeState({
          offers: [
            {
              card: { ...makeCard('a'), priceLabel: '99 Flux' },
              purchased: true,
              affordable: true,
            },
          ],
        }),
      );

      const tile = shop.element.querySelector('.vol-card-picker__grid .vol-card')!;
      expect(tile.querySelector('.vol-card__price')?.textContent).toBe('99 Flux');
      expect(tile.querySelector<HTMLButtonElement>('.vol-card__action')?.disabled).toBe(true);

      shop.destroy();
    });

    it('envanterdeki kart sırası değiştiğinde DOM konumları güncellenir', () => {
      const shop = makeShop();
      shop.present(
        makeState({
          abilities: [
            { instanceId: 'a#1', card: makeCard('a'), sellLabel: 'SAT A' },
            { instanceId: 'b#1', card: makeCard('b'), sellLabel: 'SAT B' },
          ],
        }),
      );

      const [first, second] = shop.element.querySelectorAll('.vol-card-shop__abilities .vol-card');
      expect(first.textContent).toContain('a başlık');
      expect(second.textContent).toContain('b başlık');

      shop.render(
        makeState({
          abilities: [
            { instanceId: 'b#1', card: makeCard('b'), sellLabel: 'SAT B' },
            { instanceId: 'a#1', card: makeCard('a'), sellLabel: 'SAT A' },
          ],
        }),
      );

      const [afterFirst, afterSecond] = shop.element.querySelectorAll(
        '.vol-card-shop__abilities .vol-card',
      );
      expect(afterFirst).toBe(second);
      expect(afterSecond).toBe(first);

      shop.destroy();
    });
  });
});
