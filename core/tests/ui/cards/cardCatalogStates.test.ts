import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardPicker } from '../../../src/ui/cards/CardPicker';
import { CardTile, type CardTileData } from '../../../src/ui/cards/CardTile';
import { LevelUpPicker } from '../../../src/ui/cards/LevelUpPicker';
import { ShopPicker } from '../../../src/ui/cards/ShopPicker';
import { FocusNavController } from '../../../src/ui/focus/FocusNavController';

const data: CardTileData = {
  id: 'offer',
  title: '999999',
  description: '100000',
  rarity: 'rare',
  priceLabel: '999999',
};
const labels = {
  buy: 'Al',
  owned: 'Var',
  tooExpensive: 'Yetersiz',
  abilitiesTitle: 'Yetenek',
  passivesTitle: 'Pasif',
  empty: 'Boş',
  close: 'Kapat',
};
const cleanup: { destroy(): void }[] = [];

class CatalogPicker extends CardPicker {
  present(disabled: boolean, onAction: (id: string) => void): void {
    this.clearTiles();
    this.addTile(data, { actionLabel: 'Seç', disabled, onAction });
    this.show();
  }
}

function mountFamilies(onAction: (id: string) => void): HTMLElement[] {
  const base: CardPicker = new CatalogPicker();
  const level = new LevelUpPicker({ selectLabel: 'Seç', onSelect: onAction });
  const shop = new ShopPicker({ labels, onBuy: onAction, onSell: () => {}, onClose: () => {} });
  const tile = new CardTile({ data, actionLabel: 'Seç', onAction });
  cleanup.push(base, level, shop, tile);
  const roots = [base.element, level.element, shop.element, tile.element];
  document.body.append(...roots);
  (base as CatalogPicker).present(false, onAction);
  level.present([data]);
  shop.present({
    offers: [{ card: data, affordable: true, purchased: false }],
    abilities: [],
    passives: [],
    balanceLabel: '100000',
  });
  for (const root of roots) {
    for (const action of root.querySelectorAll<HTMLElement>('button')) {
      action.getBoundingClientRect = () => ({ x: 0, y: 0, width: 100, height: 40 }) as DOMRect;
    }
  }
  return roots;
}

afterEach(() => {
  for (const item of cleanup.splice(0)) item.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('kart ailesi ortak eylem sözleşmesi', () => {
  it('normal sunum altı haneli başlık, açıklama ve fiyatı her ailede korur', () => {
    for (const root of mountFamilies(() => {})) {
      expect(root.hidden).toBe(false);
      expect(root.querySelector('.vol-card__title')?.textContent).toBe('999999');
      expect(root.querySelector('.vol-card__description')?.textContent).toBe('100000');
      expect(root.querySelector('.vol-card__price')?.textContent).toBe('999999');
      expect(root.querySelector<HTMLButtonElement>('.vol-card__action')?.disabled).toBe(false);
    }
  });

  it('FocusNavController gamepad aktivasyonu odaktaki her ailenin yalnız bir eylemini çalıştırır', () => {
    const selected: string[] = [];
    const roots = mountFamilies((id) => selected.push(id));
    const nav = new FocusNavController();
    cleanup.push(nav);
    for (const [index, root] of roots.entries()) {
      const action = root.querySelector<HTMLButtonElement>('.vol-card__action')!;
      action.focus();
      expect(document.activeElement).toBe(action);
      nav.activate();
      expect(selected).toHaveLength(index + 1);
      expect(selected[index]).toBe('offer');
    }
  });

  it('keyboard Enter varsayılan aktivasyonu ve touch bırakışı her ailede tek seçimdir', () => {
    for (const pointerType of ['keyboard', 'touch']) {
      const selected: string[] = [];
      const roots = mountFamilies((id) => selected.push(id));
      for (const [index, root] of roots.entries()) {
        const action = root.querySelector<HTMLButtonElement>('.vol-card__action')!;
        action.focus();
        expect(document.activeElement).toBe(action);
        if (pointerType === 'keyboard') {
          action.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        } else {
          for (const type of ['pointerdown', 'pointerup'])
            action.dispatchEvent(
              new PointerEvent(type, { pointerType, pointerId: 1, isPrimary: true, bubbles: true }),
            );
        }
        // jsdom native Enter/dokunma aktivasyonu üretmez; tarayıcının varsayılan click adımı canlandırılır.
        action.click();
        expect(selected).toHaveLength(index + 1);
      }
    }
  });

  it('CardPicker disabled kart eylemini engeller, yeni sunum kilidi kaldırır', () => {
    const selected = vi.fn();
    const picker: CardPicker = new CatalogPicker();
    cleanup.push(picker);
    document.body.append(picker.element);
    (picker as CatalogPicker).present(true, selected);
    const disabled = picker.element.querySelector<HTMLButtonElement>('.vol-card__action')!;
    expect(disabled.disabled).toBe(true);
    disabled.click();
    expect(selected).not.toHaveBeenCalled();
    (picker as CatalogPicker).present(false, selected);
    picker.element.querySelector<HTMLButtonElement>('.vol-card__action')!.click();
    expect(selected).toHaveBeenCalledExactlyOnceWith('offer');
  });

  it('LevelUpPicker boş teklif yeni kart sunumuna ve hata bildiriminin temizlenmesine engel olmaz', () => {
    const picker: CardPicker = new LevelUpPicker({ selectLabel: 'Seç', onSelect: () => {} });
    cleanup.push(picker);
    document.body.append(picker.element);
    (picker as LevelUpPicker).present([]);
    const emptyGrid = picker.element.querySelector('.vol-card-picker__grid')!;
    expect(emptyGrid.childElementCount).toBe(0);
    expect(picker.isVisible()).toBe(true);
    picker.setNotice({ kind: 'error', message: 'Teklif yok' });
    expect(picker.element.querySelector('[role="alert"]')?.textContent).toBe('Teklif yok');
    (picker as LevelUpPicker).present([data]);
    expect(emptyGrid.querySelectorAll('.vol-card')).toHaveLength(1);
    expect(picker.element.querySelector('[role="alert"]')).toBeNull();
  });

  it('ShopPicker loading durumundan error durumuna geçerken busy silinir ve yeni sunum hatayı temizler', () => {
    const shop = new ShopPicker({ labels, onBuy: () => {}, onSell: () => {}, onClose: () => {} });
    cleanup.push(shop);
    document.body.append(shop.element);
    shop.setNotice({ kind: 'loading', message: 'Yükleniyor' });
    expect(shop.element.querySelector('[aria-busy="true"]')).not.toBeNull();
    shop.setNotice({ kind: 'error', message: 'Ağ yok' });
    expect(shop.element.querySelector('[aria-busy="true"]')).toBeNull();
    expect(shop.element.querySelector('[role="alert"]')?.textContent).toBe('Ağ yok');
    shop.present({ offers: [], abilities: [], passives: [], balanceLabel: '0' });
    expect(shop.element.querySelector('[role="alert"]')).toBeNull();
  });
});
