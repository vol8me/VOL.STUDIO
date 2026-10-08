import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../../../src/ui/hud/ActionBar';
import { BuildMenu } from '../../../src/ui/hud/BuildMenu';
import { SwipeableCardStack } from '../../../src/ui/cards/SwipeableCardStack';

afterEach(() => {
  document.body.replaceChildren();
});

describe('BuildMenu seçim durumu okuyucuya duyulur', () => {
  it('aria-pressed seçimi izler; aynı öğeye tekrar basmak kaldırır', () => {
    const menu = new BuildMenu({
      items: [
        { id: 'tower', label: 'Kule', icon: 'T', onSelect: vi.fn(), onDeselect: vi.fn() },
        { id: 'wall', label: 'Duvar', icon: 'W', onSelect: vi.fn() },
      ],
    });
    document.body.appendChild(menu.element);
    const [tower, wall] = [...menu.element.querySelectorAll<HTMLButtonElement>('button')];
    expect([tower, wall].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
    tower.click();
    expect([tower, wall].map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    wall.click();
    expect([tower, wall].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    wall.click();
    expect(wall.getAttribute('aria-pressed')).toBe('false');
    menu.destroy();
  });
});

describe('ActionBar durumları okuyucuya duyulur', () => {
  it('mod taşıyan slot aria-pressed alır; taşımayan almaz', () => {
    const bar = new ActionBar({
      slots: [
        { id: 'mode', label: 'Mod', active: true },
        { id: 'plain', label: 'Düz' },
      ],
      onActivate: vi.fn(),
    });
    document.body.appendChild(bar.element);
    const [mode, plain] = [...bar.element.querySelectorAll<HTMLButtonElement>('button')];
    expect(mode.getAttribute('aria-pressed')).toBe('true');
    expect(plain.hasAttribute('aria-pressed')).toBe(false);
    bar.setActive('mode', false);
    expect(mode.getAttribute('aria-pressed')).toBe('false');
    bar.destroy();
  });

  it('soğuma sırasında slot aria-disabled olur, bitince geri döner; durum değişmedikçe yazılmaz', () => {
    const bar = new ActionBar({
      slots: [{ id: 'dash', label: 'Atılım' }],
      onActivate: vi.fn(),
    });
    document.body.appendChild(bar.element);
    const slot = bar.element.querySelector<HTMLButtonElement>('button')!;
    const set = vi.spyOn(slot, 'setAttribute');
    bar.setCooldown('dash', 0.8, 5);
    expect(slot.getAttribute('aria-disabled')).toBe('true');
    set.mockClear();
    bar.setCooldown('dash', 0.5, 5);
    bar.setCooldown('dash', 0.3, 5);
    expect(set).not.toHaveBeenCalled();
    bar.setCooldown('dash', 0, 5);
    expect(slot.getAttribute('aria-disabled')).toBe('false');
    bar.destroy();
  });
});

describe('SwipeableCardStack okuyucu ve odak', () => {
  const cards = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `c${i}`, element: document.createElement('div') }));

  it('yalnız üstteki kart etkileşimlidir; alttakiler inert ve gizli', () => {
    const stack = new SwipeableCardStack({ cards: cards(3) });
    document.body.appendChild(stack.element);
    const els = [...stack.element.querySelectorAll<HTMLElement>('.vol-card-stack__card')];
    expect(els).toHaveLength(3);
    const top = els[els.length - 1];
    expect(top.hasAttribute('aria-hidden')).toBe(false);
    for (const below of els.slice(0, -1)) {
      expect(below.inert).toBe(true);
      expect(below.getAttribute('aria-hidden')).toBe('true');
    }
    expect(stack.element.querySelector('.vol-card-stack__hint')!.getAttribute('aria-hidden')).toBe(
      'true',
    );
    stack.destroy();
  });

  it('son kart düğmeyle verilince odak gövdeye düşmez, desteye alınır', () => {
    vi.useFakeTimers();
    const stack = new SwipeableCardStack({ cards: cards(1), showActionButtons: true });
    document.body.appendChild(stack.element);
    const accept = stack.element.querySelector<HTMLButtonElement>(
      '.vol-card-stack__action--accept',
    )!;
    accept.focus();
    accept.click();
    vi.runAllTimers();
    expect(accept.disabled).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
    expect(stack.element.contains(document.activeElement)).toBe(true);
    stack.destroy();
    vi.useRealTimers();
  });
});
