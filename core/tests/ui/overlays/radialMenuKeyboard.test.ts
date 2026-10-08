import { afterEach, describe, expect, it, vi } from 'vitest';
import { RadialMenu } from '../../../src/ui/overlays/RadialMenu';

/**
 * RadialMenu klavye/kol yolu: işaretçisiz açılan menü ilk item'a odaklanır, ok tuşları döner, Enter/Space/A seçer,
 * Escape/Tab/dışarı tıklama seçmeden kapatır, odak açan öğeye döner. İşaretçi akışı (basılı tut → sürükle → bırak) değişmez.
 */
let menu: RadialMenu | null = null;
afterEach(() => {
  menu?.destroy();
  menu = null;
  document.body.replaceChildren();
});

function mount(onSelect = vi.fn()): {
  root: HTMLElement;
  onSelect: ReturnType<typeof vi.fn>;
  opener: HTMLButtonElement;
} {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  menu = new RadialMenu({
    items: [
      { id: 'a', label: 'Saldır' },
      { id: 'b', label: 'Savun', disabled: true },
      { id: 'c', label: 'İyileş' },
      { id: 'd', label: 'Kaç' },
    ],
    onSelect,
    label: 'Eylemler',
  });
  document.body.append(menu.element);
  return { root: menu.element, onSelect, opener };
}

const items = (root: HTMLElement): HTMLButtonElement[] => [
  ...root.querySelectorAll<HTMLButtonElement>('.vol-radial-menu__item'),
];
const key = (k: string): void => {
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
  );
};

describe('klavye ve kol', () => {
  it('menü rolü, adı ve item rolleri vardır; açılınca ilk etkin item odaklanır', () => {
    const { root } = mount();
    expect(root.getAttribute('role')).toBe('menu');
    expect(root.getAttribute('aria-label')).toBe('Eylemler');
    expect(items(root).every((el) => el.getAttribute('role') === 'menuitem')).toBe(true);
    menu!.openFocused(100, 100);
    expect(document.activeElement).toBe(items(root)[0]);
    expect(items(root)[0].classList.contains('vol-radial-menu__item--hovered')).toBe(true);
  });

  it('ok tuşları devre dışı item’ı atlayarak döner; Home/End uçlara gider', () => {
    const { root } = mount();
    menu!.openFocused(100, 100);
    key('ArrowRight');
    expect(document.activeElement).toBe(items(root)[2]);
    key('ArrowRight');
    expect(document.activeElement).toBe(items(root)[3]);
    key('ArrowRight');
    expect(document.activeElement).toBe(items(root)[0]);
    key('ArrowLeft');
    expect(document.activeElement).toBe(items(root)[3]);
    key('Home');
    expect(document.activeElement).toBe(items(root)[0]);
    key('End');
    expect(document.activeElement).toBe(items(root)[3]);
  });

  it('Enter ve kol A (click, detail 0) odaktaki item’ı seçer ve odak açan öğeye döner', () => {
    const { root, onSelect, opener } = mount();
    menu!.openFocused(100, 100);
    key('ArrowRight');
    items(root)[2].click();
    expect(onSelect).toHaveBeenCalledWith('c');
    expect(document.activeElement).toBe(opener);
  });

  it('Escape seçmeden kapatır ve tuşu yutar; Tab de seçmeden kapatır', () => {
    const { onSelect } = mount();
    const later = vi.fn();
    document.addEventListener('keydown', later);
    menu!.openFocused(100, 100);
    key('Escape');
    expect(onSelect).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();
    menu!.openFocused(100, 100);
    key('Tab');
    expect(onSelect).not.toHaveBeenCalled();
    document.removeEventListener('keydown', later);
  });

  it('dışarı tıklama seçmeden kapatır', () => {
    const { onSelect } = mount();
    menu!.openFocused(100, 100);
    document.body.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(menu!.element.classList.contains('vol-radial-menu--visible')).toBe(false);
  });

  it('işaretçisiz `open` (HoldButton demosu) eski sürükleme akışında kalır: odak almaz, dışarıdaki bırakış kapatır', () => {
    const { root } = mount();
    const before = document.activeElement;
    menu!.open(100, 100);
    expect(document.activeElement).toBe(before);
    document.body.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    expect(root.classList.contains('vol-radial-menu--visible')).toBe(false);
  });

  it('işaretçiyle açılan menü eski akışta kalır: bırakınca hover’daki seçilir, odak almaz', () => {
    const { root, onSelect } = mount();
    const before = document.activeElement;
    menu!.open(100, 100, 7);
    expect(document.activeElement).toBe(before);
    expect(root.classList.contains('vol-radial-menu--visible')).toBe(true);
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 }));
    expect(onSelect).not.toHaveBeenCalled(); // deadzone: hiçbir item hover değil
  });
});
