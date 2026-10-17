/**
 * Seçici ailesi durumları (UI-04.2): son seçimin tek niyeti, yükleniyor/hata bildirimi ve kart sürükleme
 * niyeti. Modal/geri/odak geri yükleme `cardPickerIntent.test.ts`te; yeniden giriş/reroll
 * `shopPicker*.test.ts`te.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardTile, type CardTileData } from '../../../src/ui/cards/CardTile';
import { HIDE_ANIMATION_MS, type CardPicker } from '../../../src/ui/cards/CardPicker';
import { LevelUpPicker } from '../../../src/ui/cards/LevelUpPicker';
import { ShopPicker } from '../../../src/ui/cards/ShopPicker';
import { uiIntentBusFor, type UiIntent } from '../../../src/ui/feedback/uiIntent';

const cards: CardTileData[] = [
  { id: 'a', title: 'A', description: 'A', rarity: 'rare' },
  { id: 'b', title: 'B', description: 'B', rarity: 'epic' },
];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('son seçimin tek niyeti', () => {
  it('kapanış animasyonu sürerken ikinci tıklama ikinci seçim üretmez', () => {
    const selected: string[] = [];
    const picker = new LevelUpPicker({ selectLabel: 'Seç', onSelect: (id) => selected.push(id) });
    document.body.append(picker.element);
    picker.present(cards);
    const [first, second] = picker.element.querySelectorAll<HTMLButtonElement>('.vol-card__action');
    first.click();
    first.click();
    second.click();
    expect(selected).toEqual(['a']);
    vi.advanceTimersByTime(HIDE_ANIMATION_MS);
    picker.present(cards);
    picker.element.querySelector<HTMLButtonElement>('.vol-card__action')!.click();
    expect(selected, 'yeniden sunumda seçim yine çalışır').toEqual(['a', 'a']);
    picker.destroy();
  });

  it('dükkan kapatma: çift tıklama ve tıklama + geri onClose’u bir kez çağırır', () => {
    const onClose = vi.fn();
    const shop = new ShopPicker({
      labels: {
        buy: 'Al',
        owned: 'Var',
        tooExpensive: 'Yetersiz',
        abilitiesTitle: 'Yetenek',
        passivesTitle: 'Pasif',
        empty: 'Boş',
        close: 'Devam',
      },
      onBuy: () => {},
      onSell: () => {},
      onClose,
    });
    document.body.append(shop.element);
    shop.present({ offers: [], abilities: [], passives: [], balanceLabel: '0' });
    const close = shop.element.querySelector<HTMLButtonElement>('.vol-card-shop__close')!;
    close.click();
    close.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    shop.destroy();
  });
});

describe('seçici durum bildirimi', () => {
  const notice = (picker: CardPicker): HTMLElement =>
    picker.element.querySelector<HTMLElement>('.vol-card-picker__notice')!;
  const grid = (picker: CardPicker): HTMLElement =>
    picker.element.querySelector<HTMLElement>('.vol-card-picker__grid')!;

  it('başlangıçta gizlidir ve erişilebilirlik ağacında yoktur', () => {
    const picker = new LevelUpPicker({ selectLabel: 'Seç', onSelect: () => {} });
    expect(notice(picker).hidden).toBe(true);
    expect(notice(picker).hasAttribute('role')).toBe(false);
    picker.destroy();
  });

  it('yükleniyor: nazik status bölgesi ve ızgarada aria-busy', () => {
    const picker: CardPicker = new LevelUpPicker({ selectLabel: 'Seç', onSelect: () => {} });
    picker.setNotice({ kind: 'loading', message: 'Teklifler yükleniyor' });
    expect(notice(picker).hidden).toBe(false);
    expect(notice(picker).getAttribute('role')).toBe('status');
    expect(notice(picker).textContent).toBe('Teklifler yükleniyor');
    expect(notice(picker).classList.contains('vol-card-picker__notice--loading')).toBe(true);
    expect(grid(picker).getAttribute('aria-busy')).toBe('true');
    picker.destroy();
  });

  it('hata: alert; yükleniyordan hataya geçişte busy kalkar, temizleyince hepsi sıfırlanır', () => {
    const picker = new LevelUpPicker({ selectLabel: 'Seç', onSelect: () => {} });
    picker.setNotice({ kind: 'loading', message: 'Yükleniyor' });
    picker.setNotice({ kind: 'error', message: 'Teklif alınamadı' });
    expect(notice(picker).getAttribute('role')).toBe('alert');
    expect(notice(picker).classList.contains('vol-card-picker__notice--loading')).toBe(false);
    expect(notice(picker).classList.contains('vol-card-picker__notice--error')).toBe(true);
    expect(grid(picker).hasAttribute('aria-busy')).toBe(false);
    picker.setNotice(null);
    expect(notice(picker).hidden).toBe(true);
    expect(notice(picker).textContent).toBe('');
    expect(notice(picker).hasAttribute('role')).toBe(false);
    picker.destroy();
  });

  it('yeni sunum ve kapanış sonrası eski hata bildirimi sızmaz', () => {
    const picker = new LevelUpPicker({ selectLabel: 'Seç', onSelect: () => {} });
    document.body.append(picker.element);
    picker.present(cards);
    picker.setNotice({ kind: 'error', message: 'Teklif alınamadı' });
    picker.present(cards);
    expect(notice(picker).hidden, 'yeni sunum eski bildirimi temizler').toBe(true);

    picker.setNotice({ kind: 'loading', message: 'Yükleniyor' });
    picker.hide();
    expect(notice(picker).hidden, 'kapanış animasyonu sürerken bildirim durur').toBe(false);
    vi.advanceTimersByTime(HIDE_ANIMATION_MS);
    expect(notice(picker).hidden).toBe(true);
    expect(grid(picker).hasAttribute('aria-busy')).toBe(false);
    picker.destroy();
  });

  it('hideImmediately bildirimi temizler: eski hata sonraki sunuma sızmaz', () => {
    const picker = new LevelUpPicker({ selectLabel: 'Seç', onSelect: () => {} });
    document.body.append(picker.element);
    picker.present(cards);
    picker.setNotice({ kind: 'error', message: 'Teklif alınamadı' });
    picker.hideImmediately();
    expect(notice(picker).hidden).toBe(true);
    picker.destroy();
  });
});

describe('kart sürükleme niyeti', () => {
  it('sürükleme başlayınca kök veriyoluna tek "pick" niyeti yayar', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const { bus, release } = uiIntentBusFor(root);
    const seen: UiIntent[] = [];
    bus.subscribe({ onIntent: (intent) => seen.push(intent) });
    const tile = new CardTile({ data: cards[0], dragData: 'slot:a' });
    root.append(tile.element);
    tile.element.dispatchEvent(new Event('dragstart', { bubbles: true }));
    expect(seen.map((intent) => `${intent.origin}:${intent.kind}:${intent.source}`)).toEqual([
      'CardTile:pick:pointer',
    ]);
    expect(tile.element.classList.contains('vol-card--dragging')).toBe(true);
    tile.destroy();
    release();
  });
});
