import { afterEach, describe, expect, it } from 'vitest';
import { Popup, type PopupPlacement } from '../../../src/ui/overlays/Popup';

/**
 * Açılır pencere yönü (UI-07.2): `start`/`end` mantıksal kenardır. RTL'de başlangıç tetikleyicinin SAĞ kenarıdır;
 * önceki konumlama fiziksel sola hizalıyor, RTL'de pencere tetikleyicinin okuma başlangıcından uzak açılıyordu.
 */
const VIEWPORT = 1000;
const POPUP_WIDTH = 160;

let popup: Popup | null = null;

afterEach(() => {
  popup?.destroy();
  popup = null;
  document.body.replaceChildren();
  document.documentElement.removeAttribute('dir');
});

function open(
  placement: PopupPlacement,
  rect: { left: number; right: number },
  dir?: 'rtl' | 'ltr',
) {
  if (dir) document.documentElement.setAttribute('dir', dir);
  Object.defineProperty(window, 'innerWidth', { value: VIEWPORT, configurable: true });
  const target = document.createElement('button');
  target.getBoundingClientRect = () =>
    ({
      left: rect.left,
      right: rect.right,
      top: 100,
      bottom: 140,
      width: rect.right - rect.left,
      height: 40,
      x: rect.left,
      y: 100,
    }) as DOMRect;
  document.body.append(target);
  popup = new Popup(target, { placement });
  Object.defineProperty(popup.element, 'offsetWidth', { value: POPUP_WIDTH, configurable: true });
  Object.defineProperty(popup.element, 'offsetHeight', { value: 100, configurable: true });
  popup.show();
  return parseFloat(popup.element.style.left);
}

describe('Popup yönü', () => {
  it('LTR: start sol kenara, end sağ kenara hizalanır', () => {
    expect(open('bottom-start', { left: 300, right: 500 }, 'ltr')).toBe(300);
    popup?.destroy();
    expect(open('bottom-end', { left: 300, right: 500 }, 'ltr')).toBe(500 - POPUP_WIDTH);
  });

  it('RTL: start tetikleyicinin sağ kenarına, end sol kenarına hizalanır', () => {
    expect(open('bottom-start', { left: 300, right: 500 }, 'rtl')).toBe(500 - POPUP_WIDTH);
    popup?.destroy();
    expect(open('bottom-end', { left: 300, right: 500 }, 'rtl')).toBe(300);
  });

  it('yön en yakın dir özniteliğinden okunur (iç içe ltr kazanır)', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    const island = document.createElement('div');
    island.setAttribute('dir', 'ltr');
    document.body.append(island);
    Object.defineProperty(window, 'innerWidth', { value: VIEWPORT, configurable: true });
    const target = document.createElement('button');
    target.getBoundingClientRect = () =>
      ({ left: 300, right: 500, top: 100, bottom: 140, width: 200, height: 40 }) as DOMRect;
    island.append(target);
    popup = new Popup(target, { placement: 'bottom-start' });
    Object.defineProperty(popup.element, 'offsetWidth', { value: POPUP_WIDTH, configurable: true });
    popup.show();
    expect(parseFloat(popup.element.style.left)).toBe(300);
  });

  it('taşarsa karşı kenara çevrilir: LTR sağ kenarda, RTL sol kenarda', () => {
    // LTR: sağdaki tetikleyicinin soluna hizalı pencere görünür alana sığmaz → sağ kenara çevrilir.
    expect(open('bottom-start', { left: 900, right: 990 }, 'ltr')).toBe(990 - POPUP_WIDTH);
    popup?.destroy();
    // RTL: soldaki tetikleyicinin sağ kenarına hizalı pencere sol dışına taşar → sol kenara çevrilir.
    expect(open('bottom-start', { left: 10, right: 100 }, 'rtl')).toBe(10);
  });

  it('görünür alandan asla taşmaz', () => {
    const left = open('bottom-start', { left: 20, right: 60 }, 'rtl');
    expect(left).toBeGreaterThanOrEqual(0);
    popup?.destroy();
    const leftLtr = open('bottom-start', { left: 960, right: 1000 }, 'ltr');
    expect(leftLtr + POPUP_WIDTH).toBeLessThanOrEqual(VIEWPORT);
  });
});
