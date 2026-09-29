import { describe, expect, it } from 'vitest';
import { isBlockedShortcut, suppressNativeMenus } from '../../src/ui/nativeMenus';

function dispatch(target: EventTarget, type: string): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

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
