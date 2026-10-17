import { describe, expect, it } from 'vitest';
import {
  allowsNativeEditMenu,
  isBlockedShortcut,
  isTouchContextMenu,
  suppressNativeMenus,
} from '../../src/ui/nativeMenus';

function dispatch(target: EventTarget, type: string): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function touchInfo(event: Event, init: { pointerType?: string; fires?: boolean }): Event {
  if (init.pointerType !== undefined)
    Object.defineProperty(event, 'pointerType', { value: init.pointerType });
  if (init.fires !== undefined)
    Object.defineProperty(event, 'sourceCapabilities', {
      value: { firesTouchEvents: init.fires },
    });
  return event;
}

function contextMenu(
  target: EventTarget,
  init: { pointerType?: string; fires?: boolean } = {},
): Event {
  const event = touchInfo(new Event('contextmenu', { bubbles: true, cancelable: true }), init);
  target.dispatchEvent(event);
  return event;
}

describe('dokunma kaynaklı bağlam menüsü (Android seçim çubuğu)', () => {
  it('pointerType touch/pen ve firesTouchEvents dokunma sayılır; fare sayılmaz', () => {
    const make = (init: { pointerType?: string; fires?: boolean }): Event =>
      touchInfo(new Event('contextmenu'), init);
    expect(isTouchContextMenu(make({ pointerType: 'touch' }))).toBe(true);
    expect(isTouchContextMenu(make({ pointerType: 'pen' }))).toBe(true);
    expect(isTouchContextMenu(make({ fires: true }))).toBe(true);
    expect(isTouchContextMenu(make({ pointerType: 'mouse', fires: false }))).toBe(false);
    expect(isTouchContextMenu(make({}))).toBe(false);
  });

  it('düzenlenebilir alanda dokunma olayı engellenmez; fare ve tuval engellenir', () => {
    const stop = suppressNativeMenus(document);
    const canvas = document.createElement('canvas');
    const input = document.createElement('input');
    document.body.append(canvas, input);

    expect(contextMenu(input, { pointerType: 'touch' }).defaultPrevented).toBe(false);
    expect(contextMenu(input, { pointerType: 'mouse' }).defaultPrevented).toBe(true);
    // Düzenlenemeyen yüzeyde dokunma da engellenir (oyun tuvalinde yerel metin menüsü yok).
    expect(contextMenu(canvas, { pointerType: 'touch' }).defaultPrevented).toBe(true);

    stop();
    canvas.remove();
    input.remove();
  });

  it('birincil işaretçisi dokunmatik cihazda fare tipli olay da düzenlenebilir alanda geçer', () => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = ((query: string) => ({
      matches: query === '(pointer: coarse)',
    })) as typeof matchMedia;
    const input = document.createElement('input');
    const canvas = document.createElement('canvas');
    document.body.append(input, canvas);
    try {
      const onInput = touchInfo(new Event('contextmenu', { bubbles: true }), {
        pointerType: 'mouse',
      });
      input.dispatchEvent(onInput);
      expect(allowsNativeEditMenu(onInput)).toBe(true);
      const onCanvas = touchInfo(new Event('contextmenu', { bubbles: true }), {
        pointerType: 'mouse',
      });
      canvas.dispatchEvent(onCanvas);
      expect(allowsNativeEditMenu(onCanvas)).toBe(false);
    } finally {
      globalThis.matchMedia = original;
      input.remove();
      canvas.remove();
    }
  });
});

describe('suppressNativeMenus', () => {
  it('bağlam menüsünü metin alanı dahil her yerde engeller', () => {
    const stop = suppressNativeMenus(document);
    const canvas = document.createElement('canvas');
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    document.body.append(canvas, input, textarea);

    expect(dispatch(canvas, 'contextmenu').defaultPrevented).toBe(true);
    expect(dispatch(input, 'contextmenu').defaultPrevented).toBe(true);
    expect(dispatch(textarea, 'contextmenu').defaultPrevented).toBe(true);

    stop();
    expect(dispatch(canvas, 'contextmenu').defaultPrevented).toBe(false);
    canvas.remove();
    input.remove();
    textarea.remove();
  });

  it('sürükleme hayaletini engeller ama metin alanındaki seçimi bırakır', () => {
    const stop = suppressNativeMenus(document);
    const image = document.createElement('img');
    const input = document.createElement('input');
    document.body.append(image, input);

    expect(dispatch(image, 'dragstart').defaultPrevented).toBe(true);
    expect(dispatch(document, 'dragstart').defaultPrevented).toBe(true);
    expect(dispatch(input, 'dragstart').defaultPrevented).toBe(false);

    stop();
    expect(dispatch(image, 'dragstart').defaultPrevented).toBe(false);
    image.remove();
    input.remove();
  });

  it('köke bağlanan bitişik iki kapsam birbirinin dinleyicisini almaz', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const stop = suppressNativeMenus(host);

    expect(dispatch(host, 'contextmenu').defaultPrevented).toBe(true);
    expect(dispatch(document.body, 'contextmenu').defaultPrevented).toBe(false);

    stop();
    host.remove();
  });

  it('tarayıcı kısayollarının varsayılanını durdurur, metin alanında düzenlemeyi korur', () => {
    const stop = suppressNativeMenus(document);
    const canvas = document.createElement('canvas');
    const input = document.createElement('input');
    document.body.append(canvas, input);
    const press = (target: EventTarget, init: KeyboardEventInit): boolean => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(press(canvas, { key: 'p', ctrlKey: true })).toBe(true);
    expect(press(input, { key: 'r', ctrlKey: true })).toBe(true);
    expect(press(canvas, { key: 'F5' })).toBe(true);
    expect(press(canvas, { key: 'ArrowLeft', altKey: true })).toBe(true);
    expect(press(canvas, { key: 'z', ctrlKey: true })).toBe(true);
    expect(press(input, { key: 'z', ctrlKey: true })).toBe(false);
    expect(press(canvas, { key: 'Backspace' })).toBe(true);
    expect(press(input, { key: 'Backspace' })).toBe(false);
    expect(press(canvas, { key: 'w' })).toBe(false);
    expect(press(canvas, { key: 'ArrowLeft' })).toBe(false);

    stop();
    expect(press(canvas, { key: 'p', ctrlKey: true })).toBe(false);
    canvas.remove();
    input.remove();
  });

  it('kısayol kararı saf fonksiyondur', () => {
    const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);
    expect(isBlockedShortcut(key({ key: 'P', metaKey: true }), false)).toBe(true);
    expect(isBlockedShortcut(key({ key: 'a', ctrlKey: true }), true)).toBe(false);
    expect(isBlockedShortcut(key({ key: 'a', ctrlKey: true }), false)).toBe(true);
  });
});
