import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Modal } from '../../src/ui/overlays/Modal';
import { Tooltip } from '../../src/ui/overlays/Tooltip';
import { ToastManager } from '../../src/ui/overlays/Toast';
import { ContextMenu, type ContextMenuEntry } from '../../src/ui/overlays/ContextMenu';
import { Popup } from '../../src/ui/overlays/Popup';

const disposables: Array<{ destroy(): void }> = [];

function track<T extends { destroy(): void }>(instance: T): T {
  disposables.push(instance);
  return instance;
}

function appendToBody<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  document.body.appendChild(element);
  track({ destroy: () => element.remove() });
  return element;
}

function cleanupDom(): void {
  for (const selector of ['.vol-modal', '.vol-popup', '.vol-tooltip', '.vol-toast-container']) {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      element.remove();
    }
  }
  document.body.classList.remove('vol-modal__body-locked');
}

afterEach(() => {
  for (const disposable of disposables) {
    disposable.destroy();
  }
  disposables.length = 0;
  cleanupDom();
});

describe('Modal', () => {
  function mount(modal: Modal): void {
    document.body.appendChild(modal.element);
  }

  it('oluştur ve yok et', () => {
    const modal = track(new Modal());
    expect(modal.element).toBeInstanceOf(HTMLDivElement);
    expect(modal.element.classList.contains('vol-modal')).toBe(true);
    expect(modal.isOpen()).toBe(false);
    expect(modal.element.inert).toBe(true);
    expect(document.body.contains(modal.element)).toBe(false);
  });

  it('aç/kapat, body scroll lock ve onClose', () => {
    const onClose = vi.fn();
    const modal = track(new Modal({ onClose }));
    const button = document.createElement('button');
    button.textContent = 'Tamam';
    modal.add({ element: button });
    mount(modal);

    modal.open();
    expect(modal.isOpen()).toBe(true);
    expect(modal.element.classList.contains('vol-modal--visible')).toBe(true);
    expect(document.body.classList.contains('vol-modal__body-locked')).toBe(true);

    const content = modal.element.querySelector('.vol-modal__content') as HTMLDivElement;
    expect(content.getAttribute('role')).toBe('dialog');
    expect(content.getAttribute('aria-modal')).toBe('true');

    modal.close();
    expect(modal.isOpen()).toBe(false);
    expect(modal.element.classList.contains('vol-modal--visible')).toBe(false);
    expect(document.body.classList.contains('vol-modal__body-locked')).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('scrim tıklaması varsayılan olarak kapatır, kapatma false ise kapatmaz', () => {
    const onClose1 = vi.fn();
    const modal1 = track(new Modal({ onClose: onClose1 }));
    modal1.add({ element: document.createElement('button') });
    mount(modal1);
    modal1.open();
    const scrim1 = modal1.element.querySelector('.vol-modal__scrim') as HTMLDivElement;
    scrim1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(modal1.isOpen()).toBe(false);
    expect(onClose1).toHaveBeenCalledOnce();

    const onClose2 = vi.fn();
    const modal2 = track(new Modal({ closeOnScrimClick: false, onClose: onClose2 }));
    modal2.add({ element: document.createElement('button') });
    mount(modal2);
    modal2.open();
    const scrim2 = modal2.element.querySelector('.vol-modal__scrim') as HTMLDivElement;
    scrim2.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(modal2.isOpen()).toBe(true);
    expect(onClose2).not.toHaveBeenCalled();
  });

  it('Escape ile kapanır ve yığının yalnızca en üstündeki modalini kapatır', () => {
    const onCloseBottom = vi.fn();
    const onCloseTop = vi.fn();
    const bottom = track(new Modal({ onClose: onCloseBottom }));
    const top = track(new Modal({ onClose: onCloseTop }));
    bottom.add({ element: document.createElement('button') });
    top.add({ element: document.createElement('button') });
    mount(bottom);
    mount(top);

    bottom.open();
    top.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(top.isOpen()).toBe(false);
    expect(bottom.isOpen()).toBe(true);
    expect(onCloseTop).toHaveBeenCalledOnce();
    expect(onCloseBottom).not.toHaveBeenCalled();

    bottom.close();
    expect(document.body.classList.contains('vol-modal__body-locked')).toBe(false);
  });

  it('açıldığında ilk odaklanabilir öğeyi odaklar ve kapanınca önceki odağı geri getirir', () => {
    const previous = appendToBody('button');
    previous.focus();

    const modal = track(new Modal());
    const contentButton = document.createElement('button');
    modal.add({ element: contentButton });
    mount(modal);

    modal.open();
    expect(document.activeElement).toBe(contentButton);
    modal.close();
    expect(document.activeElement).toBe(previous);
  });

  it('Tab ve Shift+Tab ile odağı içeride tutar', () => {
    const modal = track(new Modal());
    const first = document.createElement('button');
    const last = document.createElement('button');
    modal.add({ element: first });
    modal.add({ element: last });
    mount(modal);
    modal.open();

    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    first.focus();
    const shiftTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true,
      bubbles: true,
    });
    document.dispatchEvent(shiftTab);
    expect(shiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('ikinci kez close() onClose tekrar tetiklemez', () => {
    const onClose = vi.fn();
    const modal = track(new Modal({ onClose }));
    modal.add({ element: document.createElement('button') });
    mount(modal);
    modal.open();
    modal.close();
    modal.close();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('destroy sonrası Escape ve scrim etkisiz', () => {
    const onClose = vi.fn();
    const modal = track(new Modal({ onClose }));
    modal.add({ element: document.createElement('button') });
    mount(modal);
    modal.open();

    const scrim = modal.element.querySelector('.vol-modal__scrim') as HTMLDivElement;
    modal.destroy();

    expect(document.body.contains(modal.element)).toBe(false);
    scrim.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('Popup', () => {
  function makeTarget(): HTMLButtonElement {
    return appendToBody('button');
  }

  it('oluştur ve yok et', () => {
    const target = makeTarget();
    const popup = track(new Popup(target));
    expect(popup.element).toBeInstanceOf(HTMLDivElement);
    expect(popup.element.classList.contains('vol-popup')).toBe(true);
    expect(document.body.contains(popup.element)).toBe(false);
    popup.destroy();
    expect(target.isConnected).toBe(true);
  });

  it('show/hide, DOM varlığı ve onClose', async () => {
    const target = makeTarget();
    const onClose = vi.fn();
    const popup = track(new Popup(target, { onClose }));
    popup.add({ element: document.createElement('div') });

    popup.show();
    await Promise.resolve();
    expect(popup.isOpen()).toBe(true);
    expect(document.body.contains(popup.element)).toBe(true);
    expect(popup.element.classList.contains('vol-popup--visible')).toBe(true);

    popup.close();
    expect(popup.isOpen()).toBe(false);
    expect(popup.element.classList.contains('vol-popup--visible')).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('dışarı tıklama kapatır, hedef veya içerik tıklaması kapatmaz', async () => {
    const target = makeTarget();
    const outside = appendToBody('div');
    const onClose = vi.fn();
    const popup = track(new Popup(target, { onClose }));
    popup.add({ element: document.createElement('div') });

    popup.show();
    await Promise.resolve();
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(popup.isOpen()).toBe(false);

    popup.show();
    await Promise.resolve();
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(popup.isOpen()).toBe(true);

    const inside = popup.element.querySelector('div') as HTMLDivElement;
    inside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(popup.isOpen()).toBe(true);
  });

  it('closeOnOutsideClick: false dışarıda tıklamayı engeller', async () => {
    const target = makeTarget();
    const outside = appendToBody('div');
    const onClose = vi.fn();
    const popup = track(new Popup(target, { closeOnOutsideClick: false, onClose }));
    popup.show();
    await Promise.resolve();
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
    expect(popup.isOpen()).toBe(true);
  });

  it('Escape ile kapatır', async () => {
    const target = makeTarget();
    const onClose = vi.fn();
    const popup = track(new Popup(target, { onClose }));
    popup.show();
    await Promise.resolve();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(popup.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('pointerdown dışarıda kapatmaz, click kapatır', async () => {
    const target = makeTarget();
    const outside = appendToBody('div');
    const onClose = vi.fn();
    const popup = track(new Popup(target, { onClose }));
    popup.show();
    await Promise.resolve();

    outside.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }),
    );
    expect(popup.isOpen()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(popup.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('toggle aç/kapat', async () => {
    const target = makeTarget();
    const popup = track(new Popup(target));
    popup.toggle();
    await Promise.resolve();
    expect(popup.isOpen()).toBe(true);
    popup.toggle();
    expect(popup.isOpen()).toBe(false);
  });

  it('destroy sonrası dış tıklama ve Escape etkisiz', async () => {
    const target = makeTarget();
    const outside = appendToBody('div');
    const onClose = vi.fn();
    const popup = track(new Popup(target, { onClose }));
    popup.show();
    await Promise.resolve();
    popup.destroy();

    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.contains(popup.element)).toBe(false);
  });
});

describe('ContextMenu', () => {
  it('oluştur ve yok et', () => {
    const target = appendToBody('button');
    const onSelect = vi.fn();
    const menu = track(new ContextMenu(target, [{ label: 'A', onSelect }]));
    expect(target.getAttribute('aria-haspopup')).toBe('menu');
    expect(target.getAttribute('aria-expanded')).toBe('false');
    expect(menu.popup.element.getAttribute('role')).toBe('menu');
    expect(menu.popup.element.classList.contains('vol-context-menu')).toBe(true);
  });

  it('hedef tıklaması menüyü açar ve kapatır', async () => {
    const target = appendToBody('button');
    const onSelect = vi.fn();
    const menu = track(new ContextMenu(target, [{ label: 'A', onSelect }]));

    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(target.getAttribute('aria-expanded')).toBe('true');
    expect(menu.popup.isOpen()).toBe(true);
    expect(document.body.contains(menu.popup.element)).toBe(true);

    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.popup.isOpen()).toBe(false);
    expect(target.getAttribute('aria-expanded')).toBe('false');
  });

  it('öğe tıklaması onSelect çağırır ve menüyü kapatır', async () => {
    const target = appendToBody('button');
    const onSelect = vi.fn();
    const menu = track(new ContextMenu(target, [{ label: 'Kes', onSelect }]));

    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    const item = menu.popup.element.querySelector('.vol-context-menu__item') as HTMLButtonElement;
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(menu.popup.isOpen()).toBe(false);
    expect(target.getAttribute('aria-expanded')).toBe('false');
  });

  it('devre dışı öğe seçilemez ve klavye ile atlanır', async () => {
    const target = appendToBody('button');
    const onA = vi.fn();
    const onB = vi.fn();
    const menu = track(
      new ContextMenu(target, [
        { label: 'A', onSelect: onA },
        { label: 'B', onSelect: onB, disabled: true },
        { label: 'C', onSelect: vi.fn() },
      ] as ContextMenuEntry[]),
    );

    const buttons = Array.from(
      menu.popup.element.querySelectorAll<HTMLButtonElement>('.vol-context-menu__item'),
    );
    expect(buttons[1].disabled).toBe(true);

    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    buttons[1].click();
    expect(onB).not.toHaveBeenCalled();

    buttons[0].click();
    expect(onA).toHaveBeenCalledOnce();
  });

  it('ayırıcı öğeler role separator alır ve odak dışı bırakılır', () => {
    const target = appendToBody('button');
    const menu = track(
      new ContextMenu(target, [
        { label: 'A', onSelect: vi.fn() },
        { type: 'separator' },
        { label: 'B', onSelect: vi.fn() },
      ] as ContextMenuEntry[]),
    );
    const items = menu.popup.element.querySelectorAll('.vol-context-menu__item');
    const separators = menu.popup.element.querySelectorAll('[role="separator"]');
    expect(items.length).toBe(2);
    expect(separators.length).toBe(1);
  });

  it('klavye ile gezinme ve Escape kapatır', async () => {
    const target = appendToBody('button');
    const onSelect = vi.fn();
    const menu = track(
      new ContextMenu(target, [
        { label: 'A', onSelect },
        { label: 'B', onSelect, disabled: true },
        { label: 'C', onSelect },
      ] as ContextMenuEntry[]),
    );

    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    const buttons = Array.from(menu.popup.element.querySelectorAll('.vol-context-menu__item'));

    expect(document.activeElement).toBe(buttons[0]);

    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(buttons[2]);

    buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(buttons[0]);

    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(buttons[2]);

    buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(buttons[0]);

    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.popup.isOpen()).toBe(false);
    expect(target.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(target);
  });

  it('Tab ile kapanır', async () => {
    const target = appendToBody('button');
    const menu = track(new ContextMenu(target, [{ label: 'A', onSelect: vi.fn() }]));

    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    const item = menu.popup.element.querySelector('.vol-context-menu__item') as HTMLButtonElement;
    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

    expect(menu.popup.isOpen()).toBe(false);
    expect(target.getAttribute('aria-expanded')).toBe('false');
  });

  it('destroy sonrası hedef tıklaması ve Escape etkisiz', async () => {
    const target = appendToBody('button');
    const onSelect = vi.fn();
    const menu = track(new ContextMenu(target, [{ label: 'A', onSelect }]));
    menu.destroy();

    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.body.contains(menu.popup.element)).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('erişilebilirlik nitelikleri', async () => {
    const target = appendToBody('button');
    const menu = track(
      new ContextMenu(target, [
        { label: 'A', onSelect: vi.fn(), disabled: true },
        { label: 'B', onSelect: vi.fn() },
      ] as ContextMenuEntry[]),
    );

    expect(target.getAttribute('aria-haspopup')).toBe('menu');
    expect(target.getAttribute('aria-expanded')).toBe('false');
    expect(menu.popup.element.getAttribute('role')).toBe('menu');

    const items = Array.from(
      menu.popup.element.querySelectorAll<HTMLButtonElement>('.vol-context-menu__item'),
    );
    expect(items[0].getAttribute('role')).toBe('menuitem');
    expect(items[0].tabIndex).toBe(-1);
    expect(items[0].disabled).toBe(true);

    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(target.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('ToastManager', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('oluştur ve yok et', () => {
    const toast = track(new ToastManager(document.body));
    const container = document.body.querySelector('.vol-toast-container');
    expect(container).not.toBeNull();
    expect(container?.getAttribute('role')).toBe('status');
    expect(container?.getAttribute('aria-live')).toBe('polite');
    toast.destroy();
    expect(document.body.querySelector('.vol-toast-container')).toBeNull();
  });

  it('show mesaj ekler ve rAF ile görünür olur', () => {
    const toast = track(new ToastManager(document.body));
    toast.show('Kaydedildi', { variant: 'success' });
    const container = document.body.querySelector('.vol-toast-container') as HTMLDivElement;
    const element = container.querySelector('.vol-toast') as HTMLDivElement;
    expect(element.textContent).toBe('Kaydedildi');
    expect(element.classList.contains('vol-toast--success')).toBe(true);
    expect(element.classList.contains('vol-toast--visible')).toBe(false);

    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(element.classList.contains('vol-toast--visible')).toBe(true);
  });

  it('süre dolunca toast kalkar', () => {
    const toast = track(new ToastManager(document.body));
    toast.show('Geçici', { durationMs: 0 });
    const element = document.body.querySelector('.vol-toast') as HTMLDivElement;

    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(element.classList.contains('vol-toast--visible')).toBe(true);

    vi.advanceTimersByTime(260);
    expect(document.body.contains(element)).toBe(false);
  });

  it('fazla toast eskisini kaldırır', () => {
    const toast = track(new ToastManager(document.body));
    toast.show('1', { durationMs: 10000 });
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    toast.show('2', { durationMs: 10000 });
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    toast.show('3', { durationMs: 10000 });
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    toast.show('4', { durationMs: 10000 });
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();

    let toasts = document.body.querySelectorAll('.vol-toast');
    expect(toasts.length).toBe(4);
    expect(toasts[0].textContent).toBe('1');

    toast.show('5', { durationMs: 10000 });
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();

    toasts = document.body.querySelectorAll('.vol-toast');
    expect(toasts.length).toBe(4);
    expect(toasts[0].textContent).toBe('2');
    expect(toasts[3].textContent).toBe('5');
  });

  it('destroy sırasında timer ve container temizlenir', () => {
    const toast = track(new ToastManager(document.body));
    toast.show('A', { durationMs: 0 });
    const element = document.body.querySelector('.vol-toast') as HTMLDivElement;

    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(element.classList.contains('vol-toast--visible')).toBe(true);

    toast.destroy();
    expect(document.body.contains(element)).toBe(false);
    expect(document.body.querySelector('.vol-toast-container')).toBeNull();
    vi.advanceTimersByTime(300);
    expect(document.body.querySelector('.vol-toast')).toBeNull();
  });
});

describe('Tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('oluştur ve yok et', () => {
    const target = appendToBody('button');
    const tooltip = track(new Tooltip(target, 'Açıklama'));
    const id = target.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).toBeNull();
    tooltip.destroy();
    expect(target.getAttribute('aria-describedby')).toBeNull();
  });

  it('mouseenter/focus gösterir, mouseleave/blur gizler', () => {
    const target = appendToBody('button');
    const _tooltip = track(new Tooltip(target, 'Açıklama', { delayMs: 0 }));

    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersToNextTimer();
    const bubble = document.getElementById(
      target.getAttribute('aria-describedby')!,
    ) as HTMLDivElement;
    expect(bubble).not.toBeNull();
    expect(bubble.textContent).toBe('Açıklama');
    expect(bubble.classList.contains('vol-tooltip--visible')).toBe(true);
    expect(bubble.classList.contains('vol-tooltip--top')).toBe(true);

    target.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(bubble.classList.contains('vol-tooltip--visible')).toBe(false);

    target.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    vi.advanceTimersToNextTimer();
    expect(bubble.classList.contains('vol-tooltip--visible')).toBe(true);

    target.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    expect(bubble.classList.contains('vol-tooltip--visible')).toBe(false);
  });

  it('setText içeriği günceller', () => {
    const target = appendToBody('button');
    const tooltip = track(new Tooltip(target, 'İlk', { delayMs: 0 }));

    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersToNextTimer();
    tooltip.setText('Yeni');

    const bubble = document.getElementById(
      target.getAttribute('aria-describedby')!,
    ) as HTMLDivElement;
    expect(bubble.textContent).toBe('Yeni');
  });

  it('placement bottom sınıfını uygular', () => {
    const target = appendToBody('button');
    const _tooltip = track(new Tooltip(target, 'Açıklama', { placement: 'bottom', delayMs: 0 }));

    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersToNextTimer();
    const bubble = document.getElementById(
      target.getAttribute('aria-describedby')!,
    ) as HTMLDivElement;
    expect(bubble.classList.contains('vol-tooltip--bottom')).toBe(true);
  });

  it('destroy sonrası olay dinleyicileri kalkar', () => {
    const target = appendToBody('button');
    const tooltip = track(new Tooltip(target, 'Açıklama', { delayMs: 0 }));
    tooltip.destroy();

    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersToNextTimer();
    expect(target.getAttribute('aria-describedby')).toBeNull();
    expect(document.body.querySelector('.vol-tooltip')).toBeNull();
  });
});
