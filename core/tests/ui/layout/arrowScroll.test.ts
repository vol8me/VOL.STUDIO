import { afterEach, describe, expect, it } from 'vitest';
import { UI_SIZE } from '../../../src/constants';
import { FocusNavController } from '../../../src/ui/focus/FocusNavController';
import { scrollByArrowKey } from '../../../src/ui/layout/arrowScroll';
import { ScrollView } from '../../../src/ui/layout/ScrollView';
import { VirtualList } from '../../../src/ui/layout/VirtualList';

/**
 * Odaklanabilir kaydırma yüzeylerinin ok tuşu adımı (UI-08.4). `FocusNavController` ok tuşlarını uzamsal gezinme için
 * tükettiği için tarayıcının yerel ok kaydırması bu yüzeylerde çalışmıyordu: gerçek tarayıcıda ArrowDown ScrollView'u
 * kaydırmıyor, odağı komşu denetime atıyordu. Jsdom yerleşim hesaplamaz; kaydırma konumları tarayıcı gibi kenetlenen
 * erişimcilerle taklit edilir. Gerçek tarayıcı sonucu `devtools/vol-showcase/tests/e2e/scrollView.spec.ts`tedir.
 */
const STEP = UI_SIZE.SCROLL_KEY_STEP_PX;

afterEach(() => {
  document.body.replaceChildren();
});

/** 200×200 görünür alan, 600×800 içerik: konumlar `[0, içerik − görünür]` aralığına kenetlenir. */
function clamp(element: HTMLElement, content = { w: 600, h: 800 }): void {
  const view = { w: 200, h: 200 };
  let left = 0;
  let top = 0;
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: view.w },
    clientHeight: { configurable: true, value: view.h },
    scrollWidth: { configurable: true, value: content.w },
    scrollHeight: { configurable: true, value: content.h },
    scrollLeft: {
      configurable: true,
      get: () => left,
      set: (value: number) => {
        left = Math.min(Math.max(0, value), Math.max(0, content.w - view.w));
      },
    },
    scrollTop: {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        top = Math.min(Math.max(0, value), Math.max(0, content.h - view.h));
      },
    },
  });
}

function press(
  target: Element,
  key: string,
  init: KeyboardEventInit = {},
  dispatchOn: Element = target,
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  dispatchOn.dispatchEvent(event);
  return event;
}

function surface(): HTMLDivElement {
  const element = document.createElement('div');
  document.body.append(element);
  clamp(element);
  return element;
}

describe('scrollByArrowKey', () => {
  it('dikey eksende ArrowDown/ArrowUp bir adım kaydırır ve olayı iptal eder', () => {
    const element = surface();
    element.addEventListener('keydown', (event) => scrollByArrowKey(element, event, 'vertical'));

    expect(press(element, 'ArrowDown').defaultPrevented).toBe(true);
    expect(element.scrollTop).toBe(STEP);
    expect(press(element, 'ArrowUp').defaultPrevented).toBe(true);
    expect(element.scrollTop).toBe(0);
  });

  it('yatay eksende ArrowRight/ArrowLeft kaydırır; dik eksenin tuşuna dokunmaz', () => {
    const element = surface();
    element.addEventListener('keydown', (event) => scrollByArrowKey(element, event, 'horizontal'));

    expect(press(element, 'ArrowRight').defaultPrevented).toBe(true);
    expect(element.scrollLeft).toBe(STEP);
    expect(press(element, 'ArrowDown').defaultPrevented).toBe(false);
    expect(element.scrollTop).toBe(0);
    expect(press(element, 'ArrowLeft').defaultPrevented).toBe(true);
    expect(element.scrollLeft).toBe(0);
  });

  it('kaydırılacak yer kalmadıysa olay iptal edilmez (gezinme yüzeyden çıkabilir)', () => {
    const element = surface();
    element.addEventListener('keydown', (event) => scrollByArrowKey(element, event, 'vertical'));

    expect(press(element, 'ArrowUp').defaultPrevented).toBe(false);
    element.scrollTop = 600;
    expect(press(element, 'ArrowDown').defaultPrevented).toBe(false);
    expect(element.scrollTop).toBe(600);
  });

  it('içeriği görünür alana sığan yüzeyde hiçbir tuşu iptal etmez', () => {
    const element = document.createElement('div');
    document.body.append(element);
    clamp(element, { w: 200, h: 200 });
    element.addEventListener('keydown', (event) => scrollByArrowKey(element, event, 'vertical'));

    expect(press(element, 'ArrowDown').defaultPrevented).toBe(false);
  });

  it('içerideki denetimin tuşunu çalmaz; değiştirici tuş ve iptal edilmiş olay işlenmez', () => {
    const element = surface();
    const inner = document.createElement('button');
    element.append(inner);
    element.addEventListener('keydown', (event) => scrollByArrowKey(element, event, 'vertical'));

    expect(press(inner, 'ArrowDown').defaultPrevented).toBe(false);
    for (const init of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { shiftKey: true },
    ]) {
      expect(press(element, 'ArrowDown', init).defaultPrevented).toBe(false);
    }
    const early = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    early.preventDefault();
    element.dispatchEvent(early);
    expect(element.scrollTop).toBe(0);
  });
});

describe('ScrollView ve VirtualList ok tuşu bağı', () => {
  it("ScrollView ekseniyle aynı `data-vol-arrows` taşır (kol D-pad'i aynı işleyiciye gider)", () => {
    expect(new ScrollView({ direction: 'vertical' }).element.dataset.volArrows).toBe('vertical');
    expect(new ScrollView({ direction: 'horizontal' }).element.dataset.volArrows).toBe(
      'horizontal',
    );
  });

  it('ScrollView odaktayken ok tuşu kaydırır', () => {
    const view = new ScrollView({ size: 200 });
    document.body.append(view.element);
    clamp(view.element);

    expect(press(view.element, 'ArrowDown').defaultPrevented).toBe(true);
    expect(view.element.scrollTop).toBe(STEP);
  });

  it('VirtualList odaktayken ok tuşu kaydırır ve D-pad için dikey eksen bildirir', () => {
    const list = new VirtualList({
      items: Array.from({ length: 100 }, (_, index) => index),
      itemHeight: 20,
      height: 200,
      renderItem: (item) => {
        const row = document.createElement('div');
        row.textContent = String(item);
        return row;
      },
    });
    document.body.append(list.element);
    clamp(list.element, { w: 200, h: 2000 });

    expect(list.element.dataset.volArrows).toBe('vertical');
    expect(press(list.element, 'ArrowDown').defaultPrevented).toBe(true);
    expect(list.element.scrollTop).toBe(STEP);
    list.destroy();
  });
});

describe('FocusNavController ile birlikte', () => {
  function place(element: HTMLElement, x: number, y: number): void {
    element.getBoundingClientRect = () =>
      ({
        x,
        y,
        left: x,
        top: y,
        right: x + 100,
        bottom: y + 100,
        width: 100,
        height: 100,
      }) as DOMRect;
  }

  function setup(): { view: ScrollView; below: HTMLButtonElement; nav: FocusNavController } {
    const view = new ScrollView({ size: 200 });
    document.body.append(view.element);
    clamp(view.element);
    place(view.element, 0, 0);
    const below = document.createElement('button');
    document.body.append(below);
    place(below, 0, 300);
    const nav = new FocusNavController();
    nav.start();
    return { view, below, nav };
  }

  it('klavye: ScrollView odaktayken ok tuşu odağı atmaz, içeriği kaydırır', () => {
    const { view, below, nav } = setup();
    view.element.focus();

    const event = press(view.element, 'ArrowDown');

    expect(event.defaultPrevented).toBe(true);
    expect(view.element.scrollTop).toBe(STEP);
    expect(document.activeElement).toBe(view.element);
    expect(document.activeElement).not.toBe(below);
    nav.destroy();
  });

  it('kol D-pad: uca varana dek kaydırır, uçta odak komşu denetime geçer', () => {
    const { view, below, nav } = setup();
    view.element.focus();
    const max = 800 - 200;

    nav.move('down');
    expect(view.element.scrollTop).toBe(STEP);
    expect(document.activeElement).toBe(view.element);

    view.element.scrollTop = max;
    nav.move('down');
    expect(view.element.scrollTop).toBe(max);
    expect(document.activeElement).toBe(below);
    nav.destroy();
  });
});
