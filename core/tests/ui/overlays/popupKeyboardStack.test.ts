import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBackHandlerCount } from '../../../src/platform/backNavigation';
import { Popover } from '../../../src/ui/overlays/Popover';
import { Popup } from '../../../src/ui/overlays/Popup';
import { Modal } from '../../../src/ui/overlays/Modal';
import { ContextMenu } from '../../../src/ui/overlays/ContextMenu';

const cleanups: Array<() => void> = [];
const escape = (target: EventTarget = document) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );

function target(parent = document.body) {
  const button = document.createElement('button');
  parent.appendChild(button);
  return button;
}

function popup() {
  const instance = new Popup(target(), { closeOnOutsideClick: false });
  cleanups.push(() => instance.destroy());
  instance.show();
  return instance;
}

afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
  document.body.replaceChildren();
  expect(getBackHandlerCount()).toBe(0);
});

describe('Popup klavye katman yığını', () => {
  it('bir Escape yalnız son açılan katmanı kapatır', () => {
    const outer = popup();
    const inner = popup();
    escape();
    expect(inner.isOpen()).toBe(false);
    expect(outer.isOpen()).toBe(true);
    escape();
    expect(outer.isOpen()).toBe(false);
  });

  it('kapatılıp yeniden açılan katman en üst Escape sahibi olur', () => {
    const first = popup();
    const second = popup();
    first.close();
    first.show();
    escape();
    expect(first.isOpen()).toBe(false);
    expect(second.isOpen()).toBe(true);
    second.destroy();
    expect(getBackHandlerCount()).toBe(0);
  });

  it('iç Popover kapanınca odak dış katmandaki tetikleyiciye döner', async () => {
    const trigger = target();
    const outer = new Popover(trigger, { closeOnOutsideClick: false });
    const innerTrigger = target(outer.element);
    const inner = new Popover(innerTrigger, { closeOnOutsideClick: false });
    const action = target(inner.element);
    cleanups.push(
      () => outer.destroy(),
      () => inner.destroy(),
    );
    outer.show();
    await Promise.resolve();
    inner.show();
    await Promise.resolve();
    expect(document.activeElement).toBe(action);
    escape(action);
    expect(inner.isOpen()).toBe(false);
    expect(outer.isOpen()).toBe(true);
    expect(document.activeElement).toBe(innerTrigger);
    escape(innerTrigger);
    expect(outer.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('daha alttaki katmanın sökümü Escape sahipliğini bozmadan kaydı bırakır', () => {
    const outer = popup();
    const inner = popup();
    const onWindowEscape = vi.fn();
    window.addEventListener('keydown', onWindowEscape);
    cleanups.push(() => window.removeEventListener('keydown', onWindowEscape));
    outer.destroy();
    escape();
    expect(inner.isOpen()).toBe(false);
    expect(getBackHandlerCount()).toBe(0);
    expect(onWindowEscape).not.toHaveBeenCalled();
  });

  it('Popup üstünde sonradan açılan Modal tek Escape ile kapanır; Popup açık kalır', () => {
    const outer = popup();
    const modal = new Modal();
    modal.add({ element: target() });
    document.body.appendChild(modal.element);
    cleanups.push(() => modal.destroy());
    modal.open();
    escape();
    expect(modal.isOpen()).toBe(false);
    expect(outer.isOpen()).toBe(true);
  });

  it('iç ContextMenu yerel Escape tüketir ve dış Popup açık kalır', () => {
    const outer = popup();
    const trigger = target(outer.element);
    const menu = new ContextMenu(trigger, [{ label: 'Eylem', onSelect: vi.fn() }]);
    cleanups.push(() => menu.destroy());
    trigger.click();
    const item = menu.popup.element.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
    expect(document.activeElement).toBe(item);
    escape(item);
    expect(menu.popup.isOpen()).toBe(false);
    expect(outer.isOpen()).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });
});

describe('Üç katmanlı yığın (Modal → Popup → Popover)', () => {
  function stack() {
    const modal = new Modal();
    const opener = target();
    modal.add({ element: opener });
    document.body.appendChild(modal.element);
    cleanups.push(() => modal.destroy());
    modal.open();

    const popupTrigger = target(opener.parentElement ?? document.body);
    const middle = new Popup(popupTrigger, { closeOnOutsideClick: false });
    cleanups.push(() => middle.destroy());
    // Kullanıcı tetikleyiciye odaklanıp açar; geri verilecek odak bu andaki sahiptir.
    popupTrigger.focus();
    middle.show();

    const popoverTrigger = target(middle.element);
    const top = new Popover(popoverTrigger, { closeOnOutsideClick: false });
    cleanups.push(() => top.destroy());
    popoverTrigger.focus();
    top.show();
    return { modal, middle, top, opener, popupTrigger, popoverTrigger };
  }

  it('Escape katmanları açılışın tersi sırayla kapatır (LIFO), her adımda alttakiler açık kalır', async () => {
    const { modal, middle, top } = stack();
    await Promise.resolve();
    expect([modal.isOpen(), middle.isOpen(), top.isOpen()]).toEqual([true, true, true]);

    escape();
    expect([modal.isOpen(), middle.isOpen(), top.isOpen()]).toEqual([true, true, false]);
    escape();
    expect([modal.isOpen(), middle.isOpen(), top.isOpen()]).toEqual([true, false, false]);
    escape();
    expect([modal.isOpen(), middle.isOpen(), top.isOpen()]).toEqual([false, false, false]);
  });

  it('üstteki Popover kapanınca odak tetikleyicisine döner; odak yönetmeyen Popup bunu iddia etmez', async () => {
    const { middle, top, popoverTrigger } = stack();
    await Promise.resolve();
    escape();
    expect(top.isOpen()).toBe(false);
    expect(middle.isOpen()).toBe(true);
    expect(document.activeElement).toBe(popoverTrigger);
    escape();
    expect(middle.isOpen()).toBe(false);
  });

  it('ortadaki katmanın sökümü üsttekini bozmaz; kalan tek Escape üsttekini kapatır', async () => {
    const { modal, middle, top } = stack();
    await Promise.resolve();
    middle.destroy();
    escape();
    expect(top.isOpen()).toBe(false);
    expect(modal.isOpen()).toBe(true);
    escape();
    expect(modal.isOpen()).toBe(false);
    expect(getBackHandlerCount()).toBe(0);
  });

  it('tümü sökülünce gövdede katman, kilit ve geri dinleyicisi kalmaz', async () => {
    const { modal, middle, top } = stack();
    await Promise.resolve();
    top.destroy();
    middle.destroy();
    modal.destroy();
    expect(getBackHandlerCount()).toBe(0);
    expect(document.body.classList.contains('vol-modal__body-locked')).toBe(false);
    expect(document.querySelector('.vol-modal, .vol-popup, .vol-popover')).toBeNull();
  });
});
