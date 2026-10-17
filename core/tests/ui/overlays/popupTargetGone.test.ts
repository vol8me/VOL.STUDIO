import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Popup } from '../../../src/ui/overlays/Popup';

/**
 * Açık listenin tetikleyicisi sahneden kalkarsa (üst sekme/panel gizlenir, düğüm söküldü) liste kapanır; yoksa konumu
 * sıfır dikdörtgene göre hesaplanıp görünür alanın köşesine yapışırdı (Deck'te Tema sekmesinden LB ile çıkış).
 */
type Callback = () => void;
let callbacks: Callback[] = [];
let disconnected = 0;

class FakeResizeObserver {
  constructor(callback: Callback) {
    callbacks.push(callback);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    disconnected += 1;
  }
}

const rendered = [{ width: 80, height: 30 }] as unknown as DOMRectList;
const popups: Popup[] = [];

function openPopup(onClose?: () => void): { popup: Popup; target: HTMLButtonElement } {
  const target = document.createElement('button');
  document.body.appendChild(target);
  const popup = new Popup(target, { onClose });
  popups.push(popup);
  popup.show();
  return { popup, target };
}

beforeEach(() => {
  callbacks = [];
  disconnected = 0;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => rendered);
});

afterEach(() => {
  while (popups.length > 0) popups.pop()?.destroy();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Popup: tetikleyici sahneden kalkınca kapanır', () => {
  it('ölçüsü sıfırlanan (gizlenen) tetikleyicide liste kapanır ve onClose bir kez çalışır', () => {
    const onClose = vi.fn();
    const { popup } = openPopup(onClose);
    expect(popup.isOpen()).toBe(true);

    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(
      () => [] as unknown as DOMRectList,
    );
    callbacks.forEach((callback) => callback());

    expect(popup.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('görünür tetikleyicide ölçü değişimi listeyi kapatmaz', () => {
    const { popup } = openPopup();
    callbacks.forEach((callback) => callback());
    expect(popup.isOpen()).toBe(true);
  });

  it('belgeden sökülen tetikleyicide liste kapanır', () => {
    const { popup, target } = openPopup();
    target.remove();
    callbacks.forEach((callback) => callback());
    expect(popup.isOpen()).toBe(false);
  });

  it('kapanınca gözlemci bırakılır (sızıntı yok)', () => {
    const { popup } = openPopup();
    popup.close();
    expect(disconnected).toBe(1);
  });
});
