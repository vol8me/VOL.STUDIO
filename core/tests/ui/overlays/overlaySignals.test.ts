import { afterEach, describe, expect, it, vi } from 'vitest';
import { uiIntentBusFor, type UiIntent } from '../../../src/ui/feedback/uiIntent';
import { CommandPalette } from '../../../src/ui/overlays/CommandPalette';
import { ContextMenu } from '../../../src/ui/overlays/ContextMenu';
import { Popover } from '../../../src/ui/overlays/Popover';
import { Popup } from '../../../src/ui/overlays/Popup';
import { Select } from '../../../src/ui/primitives/Select';
import { RadialMenu } from '../../../src/ui/overlays/RadialMenu';
import { Button } from '../../../src/ui/primitives/Button';
import { OnScreenKeyboard } from '../../../src/ui/textEntry/OnScreenKeyboard';

/**
 * Katman açılış/kapanış sesi: tetikleyici kayıtlı bir UI kökündeyse niyet yayılır; kodla,
 * tetikleyicisiz açılan katman sessizdir. Seçimin kendi sesi olan kapanışlar çiftlenmez.
 */
function root() {
  const element = document.createElement('div');
  const trigger = document.createElement('button');
  trigger.textContent = 'Aç';
  element.append(trigger);
  document.body.append(element);
  const handle = uiIntentBusFor(element);
  const seen: UiIntent[] = [];
  handle.bus.subscribe({ onIntent: (intent) => seen.push(intent) });
  return { element, trigger, seen, release: handle.release };
}

const kinds = (seen: UiIntent[]): string[] =>
  seen.map((intent) => `${intent.kind}:${intent.origin}`);

it('async Button OSK sonucu beklerken disabled olur; kapanıştan sonra enabled tetikleyiciye odak döner', async () => {
  const { element, release } = root();
  const trigger = new Button('Klavye', {
    onClick: async () => {
      await OnScreenKeyboard.open({ value: '' });
    },
  });
  element.append(trigger.element);
  trigger.element.focus();
  trigger.element.click();
  expect(trigger.element.disabled).toBe(true);
  expect(document.querySelector('.vol-osk')).not.toBeNull();
  document.querySelector<HTMLButtonElement>('.vol-osk [data-action="cancel"]')!.click();
  expect(document.querySelector('.vol-osk')).toBeNull();
  await vi.waitFor(() => {
    expect(trigger.element.disabled).toBe(false);
    expect(document.activeElement).toBe(trigger.element);
  });
  expect(document.querySelector('.vol-osk')).toBeNull();
  trigger.destroy();
  release();
});

describe('RadialMenu niyet ve söküm sahipliği', () => {
  it('kenar açılışı öğe sınırlarıyla sıkıştırılır; küçük pencerede ortalanır ve kapalıyken resize kaynağı yoktur', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const menu = new RadialMenu({
      items: Array.from({ length: 5 }, (_, index) => ({ id: String(index), label: 'Öğe' })),
      onSelect: () => undefined,
    });
    document.body.append(menu.element);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(64);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(64);
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 640 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
      menu.open(0, 0);
      expect(parseFloat(menu.element.style.left)).toBeGreaterThan(100);
      expect(parseFloat(menu.element.style.top)).toBeGreaterThan(100);
      menu.open(1000, 1000);
      expect(parseFloat(menu.element.style.left)).toBeLessThan(540);
      expect(parseFloat(menu.element.style.top)).toBeLessThan(300);
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 160 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 160 });
      window.dispatchEvent(new Event('resize'));
      expect(menu.element.style.left).toBe('80px');
      expect(menu.element.style.top).toBe('80px');
      menu.close(false);
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 640 });
      window.dispatchEvent(new Event('resize'));
      expect(menu.element.style.left).toBe('80px');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
      vi.restoreAllMocks();
      menu.destroy();
    }
  });

  it('seçim tüketicisi hata atsa da odak geri gelir, vurgu ve açık kaynaklar temizlenmiştir', () => {
    const { element, trigger, seen, release } = root();
    const menu = new RadialMenu({
      items: [{ id: 'one', label: 'Bir' }],
      onSelect: () => {
        throw new Error('tüketici');
      },
    });
    element.append(menu.element);
    trigger.focus();
    menu.openFocused(120, 120, trigger);
    expect(() => menu.close(true)).toThrow('tüketici');
    expect(document.activeElement).toBe(trigger);
    expect(menu.element.querySelector('.vol-radial-menu__item--hovered')).toBeNull();
    expect(menu.element.classList.contains('vol-radial-menu--visible')).toBe(false);
    expect(kinds(seen)).toEqual(['open:RadialMenu', 'select:RadialMenu']);
    menu.destroy();
    release();
  });

  it('açılış ve iptal tek sinyal; seçimin ardından ayrı kapanış sesi yoktur', () => {
    const { element, trigger, seen, release } = root();
    let selections = 0;
    const menu = new RadialMenu({
      items: [{ id: 'one', label: 'Bir' }],
      onSelect: () => selections++,
    });
    element.append(menu.element);
    trigger.focus();
    menu.openFocused(120, 120, trigger);
    menu.close(false);
    expect(kinds(seen)).toEqual(['open:RadialMenu', 'close:RadialMenu']);
    seen.length = 0;
    menu.openFocused(120, 120, trigger);
    menu.element.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click();
    expect(selections).toBe(1);
    expect(kinds(seen)).toEqual(['open:RadialMenu', 'select:RadialMenu']);
    menu.destroy();
    release();
  });

  it('programatik açılış, destroy ve destroy sonrası açma sessizdir; kaynak yeniden bağlanmaz', () => {
    const { element, trigger, seen, release } = root();
    let selections = 0;
    const menu = new RadialMenu({
      items: [{ id: 'one', label: 'Bir' }],
      onSelect: () => selections++,
    });
    element.append(menu.element);
    menu.openFocused(120, 120);
    menu.close(false);
    expect(seen).toEqual([]);
    menu.openFocused(120, 120, trigger);
    seen.length = 0;
    menu.destroy();
    menu.openFocused(120, 120, trigger);
    menu.element.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click();
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(seen).toEqual([]);
    expect(selections).toBe(0);
    expect(menu.element.isConnected).toBe(false);
    release();
  });
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('Popup ailesi: açılış ve kapanış niyeti', () => {
  it('Popover açılış ve kapanışta birer niyet yayar', () => {
    const { element, trigger, seen, release } = root();
    const popover = new Popover(trigger, { container: element });
    popover.show();
    popover.close();
    expect(kinds(seen)).toEqual(['open:Popover', 'close:Popover']);
    popover.destroy();
    release();
  });

  it('ContextMenu: tetikleyici tıklaması açar; öğe seçimi kapanış sesini çiftlemez', () => {
    const { element, trigger, seen, release } = root();
    let chosen = 0;
    const menu = new ContextMenu(trigger, [{ label: 'Sil', onSelect: () => (chosen += 1) }], {
      container: element,
    });
    trigger.click();
    expect(kinds(seen)).toContain('open:ContextMenu');
    seen.length = 0;
    menu.popup.element.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click();
    expect(chosen).toBe(1);
    expect(kinds(seen).filter((entry) => entry.startsWith('close:'))).toEqual([]);
    menu.destroy();
    release();
  });

  it('ContextMenu Escape ile kapanınca kapanış sesi çalar', () => {
    const { element, trigger, seen, release } = root();
    const menu = new ContextMenu(trigger, [{ label: 'Sil', onSelect: () => undefined }], {
      container: element,
    });
    trigger.click();
    seen.length = 0;
    menu.popup.element
      .querySelector<HTMLButtonElement>('[role="menuitem"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(kinds(seen)).toEqual(['close:ContextMenu']);
    menu.destroy();
    release();
  });

  it('sinyal adı verilmeyen Popup sessizdir (Select kendi niyetini yayar, çiftlenmez)', () => {
    const { element, trigger, seen, release } = root();
    const popup = new Popup(trigger, { container: element });
    popup.show();
    popup.close();
    expect(seen).toEqual([]);

    const select = new Select({
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      value: 'a',
      container: element,
    });
    element.append(select.element);
    seen.length = 0;
    select.element.click();
    expect(kinds(seen).filter((entry) => /^(open|close):/.test(entry))).toEqual([]);
    select.destroy();
    popup.destroy();
    release();
  });

  it('tetikleyicisi bağlı olmayan ya da sökülen katman sessizdir', () => {
    const { element, seen, release } = root();
    const orphan = document.createElement('button');
    const popup = new Popup(orphan, { container: element, signal: 'Popup' });
    popup.show();
    popup.close();
    expect(seen).toEqual([]);

    const trigger = element.querySelector('button')!;
    const open = new Popup(trigger, { container: element, signal: 'Popup' });
    open.show();
    seen.length = 0;
    open.destroy();
    expect(seen).toEqual([]);
    popup.destroy();
    release();
  });
});

describe('CommandPalette: kısayolla açılış', () => {
  function palette() {
    const made = root();
    const palette = new CommandPalette();
    palette.setItems([{ id: 'a', label: 'Birinci', onSelect: () => undefined }]);
    document.body.append(palette.element);
    return { ...made, palette };
  }

  it('odak kayıtlı kökteki bir öğedeyken açılış ve kapanış tetikleyici sayılır', () => {
    const { trigger, seen, palette: instance, release } = palette();
    trigger.focus();
    instance.open();
    instance.close();
    expect(kinds(seen)).toEqual(['open:CommandPalette', 'close:CommandPalette']);
    release();
  });

  it('odak gövdedeyse (tetikleyici yok) açılış kodla sayılır ve sessizdir', () => {
    const { seen, palette: instance, release } = palette();
    (document.activeElement as HTMLElement | null)?.blur();
    instance.open();
    instance.close();
    expect(seen).toEqual([]);
    release();
  });

  it('ikinci open() ve ikinci close() ses çiftlemez', () => {
    const { trigger, seen, palette: instance, release } = palette();
    trigger.focus();
    instance.open();
    instance.open();
    instance.close();
    instance.close();
    expect(kinds(seen)).toEqual(['open:CommandPalette', 'close:CommandPalette']);
    release();
  });

  it('komut seçimi kapanış sesini çiftlemez (satırın kendi niyeti vardır)', () => {
    const { trigger, seen, palette: instance, release } = palette();
    let ran = 0;
    instance.setItems([{ id: 'a', label: 'Birinci', onSelect: () => (ran += 1) }]);
    trigger.focus();
    instance.open();
    seen.length = 0;
    instance.element.querySelector<HTMLElement>('[role="option"]')!.click();
    expect(ran).toBe(1);
    expect(kinds(seen).filter((entry) => entry.startsWith('close:'))).toEqual([]);
    release();
  });
});
