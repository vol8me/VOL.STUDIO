import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FocusNavController, FOCUS_NAV_CLASS } from '../../../src/ui/focus/FocusNavController';

function button(label: string, y: number): HTMLButtonElement {
  const el = document.createElement('button');
  el.textContent = label;
  el.getBoundingClientRect = () => ({ x: 0, y, width: 40, height: 20, left: 0, top: y }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

describe('FocusNav halka devri', () => {
  let nav: FocusNavController;
  beforeEach(() => {
    document.body.innerHTML = '';
    nav = new FocusNavController({ getGamepads: () => [] });
    nav.start();
  });
  afterEach(() => {
    nav.destroy();
    document.body.innerHTML = '';
  });

  it('odağı başka kod yolu taşıyınca (örn. Tabs ok tuşu) eski eleman halkayı bırakır', () => {
    const a = button('a', 0);
    const b = button('b', 30);
    nav.move('down');
    expect(a.classList.contains(FOCUS_NAV_CLASS)).toBe(true);
    b.focus(); // gezinti denetleyicisi dışında odak değişti
    expect(a.classList.contains(FOCUS_NAV_CLASS)).toBe(false);
  });

  it('kendi taşıdığı odakta halka yerinde kalır ve yalnız tek elemandadır', () => {
    const a = button('a', 0);
    const b = button('b', 30);
    nav.move('down');
    nav.move('down');
    expect(a.classList.contains(FOCUS_NAV_CLASS)).toBe(false);
    expect(b.classList.contains(FOCUS_NAV_CLASS)).toBe(true);
    expect(document.querySelectorAll(`.${FOCUS_NAV_CLASS}`)).toHaveLength(1);
  });
});
