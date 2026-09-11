import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBackHandlerCount, pushBackHandler } from '../../src/platform/backNavigation';
import { Popover } from '../../src/ui/overlays/Popover';
import { Popup } from '../../src/ui/overlays/Popup';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
  document.body.innerHTML = '';
  expect(getBackHandlerCount()).toBe(0);
});

function makeTarget(): HTMLButtonElement {
  const button = document.createElement('button');
  document.body.appendChild(button);
  return button;
}

function openPopup(options: ConstructorParameters<typeof Popup>[1] = {}): Popup {
  const popup = new Popup(makeTarget(), options);
  cleanups.push(() => popup.destroy());
  popup.show();
  return popup;
}

function androidBack(): void {
  window.dispatchEvent(new Event('vol:androidback'));
}

describe('Açılır katmanlar ve Android geri hareketi', () => {
  it('açık Popup geri hareketini tüketir, alttaki işleyiciye sızdırmaz', () => {
    const lower = vi.fn(() => true);
    cleanups.push(pushBackHandler(lower));
    const onClose = vi.fn();
    const popup = openPopup({ onClose });

    androidBack();

    expect(popup.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
    expect(lower).not.toHaveBeenCalled();
  });

  it('kapanan Popup kaydını bırakır; sonraki geri hareketi alttaki ekrana gider', () => {
    const lower = vi.fn(() => true);
    cleanups.push(pushBackHandler(lower));
    const popup = openPopup();
    expect(getBackHandlerCount()).toBe(2);

    popup.close();
    expect(getBackHandlerCount()).toBe(1);

    androidBack();
    expect(lower).toHaveBeenCalledOnce();
  });

  it('Escape ve dış tıklamayla kapanış da kaydı bırakır', async () => {
    const popup = openPopup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(getBackHandlerCount()).toBe(0);

    popup.show();
    await Promise.resolve();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(popup.isOpen()).toBe(false);
    expect(getBackHandlerCount()).toBe(0);
  });

  it('açıkken yok edilen Popup kayıt bırakmaz', () => {
    const popup = openPopup();
    popup.destroy();
    expect(getBackHandlerCount()).toBe(0);
  });

  it('iç içe katmanlarda en son açılan önce kapanır', () => {
    const outer = openPopup({ closeOnOutsideClick: false });
    const inner = openPopup({ closeOnOutsideClick: false });

    androidBack();
    expect(inner.isOpen()).toBe(false);
    expect(outer.isOpen()).toBe(true);

    androidBack();
    expect(outer.isOpen()).toBe(false);
  });

  it('Popover açılışta odağı roving tabindex grubunun seçili öğesine verir', async () => {
    const popover = new Popover(makeTarget());
    const first = document.createElement('button');
    first.tabIndex = -1;
    const selected = document.createElement('button');
    selected.tabIndex = 0;
    const group = document.createElement('div');
    group.append(first, selected);
    popover.add(group);
    cleanups.push(() => popover.destroy());

    popover.show();
    await Promise.resolve();

    expect(document.activeElement).toBe(selected);
  });

  it('Popover aynı sözleşmeyi taşır ve odağı tetikleyiciye döndürür', () => {
    const trigger = makeTarget();
    const popover = new Popover(trigger);
    const inside = document.createElement('button');
    popover.add(inside);
    cleanups.push(() => popover.destroy());

    popover.show();
    inside.focus();
    androidBack();

    expect(popover.isOpen()).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });
});
