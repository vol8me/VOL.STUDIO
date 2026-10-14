/**
 * `CardTile` seçili durumu ve ayrıntı bloğu: tek seçimli listelerin (garaj, sınıf seçimi) ihtiyacı.
 * Seçim kalıcıdır ve renge güvenmez; eylem düğmesi `aria-pressed` ile durumu okuyucuya söyler.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardTile, type CardTileData } from '../../../src/ui/cards/CardTile';

const data: CardTileData = {
  id: 'striker',
  title: 'Striker',
  description: 'Ana tank',
  rarity: 'rare',
};
const tiles: CardTile[] = [];

function tile(options: Partial<ConstructorParameters<typeof CardTile>[0]> = {}): CardTile {
  const made = new CardTile({ data, actionLabel: 'Seç', ...options });
  document.body.append(made.element);
  tiles.push(made);
  return made;
}

const action = (card: CardTile): HTMLButtonElement =>
  card.element.querySelector<HTMLButtonElement>('.vol-card__action')!;

afterEach(() => {
  for (const card of tiles.splice(0)) card.destroy();
});

describe('CardTile seçili durumu', () => {
  it('seçilebilirlik verilmezse düğme basılı durumu taşımaz', () => {
    const card = tile();
    expect(action(card).hasAttribute('aria-pressed')).toBe(false);
    expect(card.element.classList.contains('vol-card--selected')).toBe(false);
  });

  it('seçenek seçili durumla başlatır; düğme aria-pressed taşır', () => {
    const on = tile({ selected: true });
    const off = tile({ selected: false });
    expect(action(on).getAttribute('aria-pressed')).toBe('true');
    expect(on.element.classList.contains('vol-card--selected')).toBe(true);
    expect(action(off).getAttribute('aria-pressed')).toBe('false');
    expect(off.element.classList.contains('vol-card--selected')).toBe(false);
  });

  it('setSelected durumu kalıcı değiştirir ve kartı seçilebilir yapar', () => {
    const card = tile();
    card.setSelected(true);
    expect(action(card).getAttribute('aria-pressed')).toBe('true');
    expect(card.element.classList.contains('vol-card--selected')).toBe(true);
    card.setSelected(false);
    expect(action(card).getAttribute('aria-pressed')).toBe('false');
    expect(card.element.classList.contains('vol-card--selected')).toBe(false);
  });

  it('düğme sonradan eklenirse mevcut seçili durumu taşır', () => {
    const card = tile({ selected: true });
    card.setActionLabel(undefined);
    expect(card.element.querySelector('.vol-card__action')).toBeNull();
    card.setActionLabel('Seçili');
    expect(action(card).getAttribute('aria-pressed')).toBe('true');
  });

  it('seçim eylem geri çağrısını etkilemez: seçili kart yine bildirir', () => {
    const onAction = vi.fn();
    const card = tile({ selected: true, onAction });
    action(card).click();
    expect(onAction).toHaveBeenCalledWith('striker');
  });
});

describe('CardTile ayrıntı bloğu', () => {
  it('açıklamayla alt şerit arasına girer ve kart sökülünce gider', () => {
    const card = tile();
    const block = document.createElement('div');
    block.textContent = 'ölçüler';
    card.addDetail({ element: block });
    const children = [...card.element.children];
    const footer = card.element.querySelector('.vol-card__footer')!;
    const description = card.element.querySelector('.vol-card__description')!;
    expect(children.indexOf(block)).toBe(children.indexOf(footer) - 1);
    expect(children.indexOf(block)).toBeGreaterThan(children.indexOf(description));
    expect(block.classList.contains('vol-card__detail')).toBe(true);
    card.destroy();
    tiles.splice(tiles.indexOf(card), 1);
    expect(card.element.isConnected).toBe(false);
  });
});
