/**
 * Kart yüzeyi sözleşmesi (UI-04.1): erişilebilir ad, renk dışı nadirlik işareti, seçim vurgusu ve
 * seçim niyeti. Görsel ölçümler (taşma, kontrast, iki dış görünüm) vitrin e2e'sindedir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardTile, type CardTileData } from '../../../src/ui/cards/CardTile';
import { HIDE_ANIMATION_MS } from '../../../src/ui/cards/CardPicker';
import { LevelUpPicker } from '../../../src/ui/cards/LevelUpPicker';
import { uiIntentBusFor, type UiIntent } from '../../../src/ui/feedback/uiIntent';

function card(id: string, rarity: CardTileData['rarity'] = 'rare'): CardTileData {
  return { id, title: `${id} başlık`, description: `${id} açıklama`, rarity };
}

/** `aria-labelledby` zincirinin okuyucuya verdiği ad. */
function accessibleName(element: Element): string {
  const ids = (element.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('kart erişilebilir adı', () => {
  it('kart, başlığıyla adlandırılmış bir gruptur', () => {
    const tile = new CardTile({ data: card('kule') });
    document.body.append(tile.element);
    expect(tile.element.getAttribute('role')).toBe('group');
    expect(accessibleName(tile.element)).toBe('kule başlık');
    tile.destroy();
  });

  it('eylem düğmesi etiketini ve kartın adını birlikte okutur (aynı etiketli düğmeler ayrışır)', () => {
    const a = new CardTile({ data: card('a'), actionLabel: 'Seç' });
    const b = new CardTile({ data: card('b'), actionLabel: 'Seç' });
    document.body.append(a.element, b.element);
    const names = [a, b].map((tile) =>
      accessibleName(tile.element.querySelector('.vol-card__action')!),
    );
    expect(names).toEqual(['Seç a başlık', 'Seç b başlık']);
    a.destroy();
    b.destroy();
  });

  it('ikincil düğme de kartın adını taşır; etiket güncellenince ad güncel kalır', () => {
    const tile = new CardTile({
      data: card('kule'),
      actionLabel: 'Sat',
      secondaryActionLabel: 'Tak',
    });
    document.body.append(tile.element);
    const secondary = tile.element.querySelector('.vol-card__action--secondary')!;
    expect(accessibleName(secondary)).toBe('Tak kule başlık');
    tile.setSecondaryAction('Çıkar');
    tile.update({ title: 'Yeni ad' });
    expect(accessibleName(secondary)).toBe('Çıkar Yeni ad');
    tile.destroy();
  });

  it('kimlikler karta özeldir (çakışma yok)', () => {
    const tiles = [0, 1, 2].map((n) => new CardTile({ data: card(`k${n}`), actionLabel: 'Seç' }));
    for (const tile of tiles) document.body.append(tile.element);
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tile of tiles) tile.destroy();
  });

  it('seçici paneli başlığıyla adlandırılır ve başlık değişince ad izler', () => {
    const picker = new LevelUpPicker({
      selectLabel: 'Seç',
      title: 'Seviye atladın',
      onSelect: () => {},
    });
    document.body.append(picker.element);
    expect(accessibleName(picker.element)).toBe('Seviye atladın');
    picker.present([card('a')], { title: 'Yeni teklif' });
    expect(accessibleName(picker.element)).toBe('Yeni teklif');
    picker.destroy();
  });
});

describe('nadirlik renk dışı işareti', () => {
  const pips = (tile: CardTile): HTMLElement => tile.element.querySelector('.vol-card__pips')!;

  it('kademe sayısı kadar baklava; okuyucudan gizli', () => {
    const counts = (['rare', 'epic', 'legendary'] as const).map((rarity) => {
      const tile = new CardTile({ data: card('k', rarity) });
      const mark = pips(tile);
      expect(mark.getAttribute('aria-hidden')).toBe('true');
      const length = mark.querySelectorAll('svg').length;
      expect(mark.textContent, 'işaret metin karakteri değil çizgidir').toBe('');
      tile.destroy();
      return length;
    });
    expect(counts).toEqual([1, 2, 3]);
  });

  it('nadirlik etiketi verilmese de işaret vardır; kademe değişince güncellenir', () => {
    const tile = new CardTile({ data: card('k', 'rare') });
    expect(tile.element.querySelector('.vol-card__rarity')).toBeNull();
    expect(pips(tile).querySelectorAll('svg')).toHaveLength(1);
    tile.update({ rarity: 'legendary' });
    expect(pips(tile).querySelectorAll('svg')).toHaveLength(3);
    tile.destroy();
  });
});

describe('seçim vurgusu', () => {
  it('markPicked sınıfı ekler ve süre sonunda kaldırır; tekrar çağrı süreyi yeniler', () => {
    const tile = new CardTile({ data: card('k') });
    document.body.append(tile.element);
    tile.markPicked();
    expect(tile.element.classList.contains('vol-card--picked')).toBe(true);
    vi.advanceTimersByTime(200);
    tile.markPicked();
    vi.advanceTimersByTime(200);
    expect(tile.element.classList.contains('vol-card--picked')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(tile.element.classList.contains('vol-card--picked')).toBe(false);
    tile.destroy();
  });

  it('destroy bekleyen zamanlayıcıyı bırakmaz', () => {
    const tile = new CardTile({ data: card('k') });
    tile.markPicked();
    tile.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('seviye atlama seçimi yalnız seçilen kartı vurgular ve paneli kapatır', () => {
    const selected: string[] = [];
    const picker = new LevelUpPicker({
      selectLabel: 'Seç',
      onSelect: (id) => selected.push(id),
    });
    document.body.append(picker.element);
    picker.present([card('a'), card('b')]);
    const buttons = picker.element.querySelectorAll<HTMLButtonElement>('.vol-card__action');
    buttons[1].click();
    const marked = [...picker.element.querySelectorAll('.vol-card--picked')];
    expect(marked).toHaveLength(1);
    expect(accessibleName(marked[0].querySelector('.vol-card__action')!)).toContain('b başlık');
    expect(selected).toEqual(['b']);
    vi.advanceTimersByTime(HIDE_ANIMATION_MS);
    expect(picker.element.hidden).toBe(true);
    picker.destroy();
  });
});

describe('seçim niyeti', () => {
  it('eylem tıklaması kök veriyoluna tek bir "select" niyeti yayar (düğme sesi yedeği yinelenmez)', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const { bus, release } = uiIntentBusFor(root);
    const seen: UiIntent[] = [];
    bus.subscribe({ onIntent: (intent) => seen.push(intent) });
    const onAction = vi.fn();
    const tile = new CardTile({ data: card('k'), actionLabel: 'Seç', onAction });
    root.append(tile.element);
    tile.element.querySelector<HTMLButtonElement>('.vol-card__action')!.click();
    expect(onAction).toHaveBeenCalledWith('k');
    expect(seen.map((intent) => `${intent.origin}:${intent.kind}`)).toEqual(['CardTile:select']);
    tile.destroy();
    release();
  });

  it('devre dışı eylem ne geri çağrı ne niyet üretir', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const { bus, release } = uiIntentBusFor(root);
    const seen: UiIntent[] = [];
    bus.subscribe({ onIntent: (intent) => seen.push(intent) });
    const onAction = vi.fn();
    const tile = new CardTile({ data: card('k'), actionLabel: 'Seç', disabled: true, onAction });
    root.append(tile.element);
    tile.element.querySelector<HTMLButtonElement>('.vol-card__action')!.click();
    expect(onAction).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
    tile.destroy();
    release();
  });
});
