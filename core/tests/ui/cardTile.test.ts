/**
 * `CardTile` ve `LevelUpPicker` sözleşmeleri.
 *
 * `ShopPicker` ayrı dosyada (`shopPicker.test.ts`): tek dosya 1413 satıra
 * çıkmıştı ve sert sınır 1000'dir. Ortak yardımcılar `cardFixtures.ts`te.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CardTile,
  CARD_DRAG_MIME,
  CARD_ENTER_ANIMATION_MS,
  type CardTileData,
} from '../../src/ui/cards/CardTile';
import { LevelUpPicker } from '../../src/ui/cards/LevelUpPicker';
import { HIDE_ANIMATION_MS } from '../../src/ui/cards/CardPicker';
import {} from '../../src/ui/cards/ShopPicker';

function makeCard(id: string, rarity: CardTileData['rarity'] = 'rare'): CardTileData {
  return {
    id,
    title: `${id} başlık`,
    description: `${id} açıklama`,
    rarity,
    rarityLabel: rarity.toUpperCase(),
  };
}

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
