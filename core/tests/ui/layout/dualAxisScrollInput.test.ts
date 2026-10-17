import { afterEach, describe, expect, it, vi } from 'vitest';
import { UI_SIZE } from '../../../src/constants';
import { i18next } from '../../../src/i18n/I18n';
import { DualAxisScrollPanel } from '../../../src/ui/layout/DualAxisScrollPanel';

/**
 * DualAxisScrollPanel tekerlek ve klavye eşdeğeri (UI-10.2). `overflow: hidden` olduğundan tarayıcı bu kaydırmaları
 * kendisi yapmaz: sürükleme tek yol kalırsa fare tekerleği ve klavye kullanıcısı alana erişemez. Jsdom yerleşim ve
 * kenetleme hesaplamaz; kaydırma konumları burada tarayıcı gibi kenetlenen erişimcilerle taklit edilir. Gerçek
 * tarayıcı sonucu `devtools/vol-showcase/tests/e2e/scrollSplit.spec.ts`tedir.
 */
const STEP = UI_SIZE.SCROLL_KEY_STEP_PX;
const tracked: DualAxisScrollPanel[] = [];

function make(label?: string): DualAxisScrollPanel {
  const panel = new DualAxisScrollPanel({ width: 200, height: 200, ...(label ? { label } : {}) });
  document.body.append(panel.element);
  tracked.push(panel);
  return panel;
}

/** Kaydırma alanını ve kenetlemeyi taklit eder: içerik 600×800, görünür alan 200×200. */
function clampScroll(panel: DualAxisScrollPanel, content = { w: 600, h: 800 }): void {
  const view = { w: 200, h: 200 };
  let left = 0;
  let top = 0;
  const { element } = panel;
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

function key(
  panel: DualAxisScrollPanel,
  name: string,
  init: KeyboardEventInit = {},
  target: Element = panel.element,
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function wheel(panel: DualAxisScrollPanel, init: WheelEventInit): WheelEvent {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  panel.element.dispatchEvent(event);
  return event;
}

afterEach(() => {
  while (tracked.length > 0) tracked.pop()!.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('DualAxisScrollPanel erişilebilirlik', () => {
  it('odaklanabilir, adlı bir gruptur ve kısayollarını bildirir', () => {
    const panel = make();
    expect(panel.element.tabIndex).toBe(0);
    expect(panel.element.getAttribute('role')).toBe('group');
    expect(panel.element.getAttribute('aria-label')).toBe(i18next.t('core:dualAxisScroll.label'));
    expect(panel.element.getAttribute('aria-keyshortcuts')).toBe(
      'ArrowUp ArrowDown ArrowLeft ArrowRight PageUp PageDown Home End',
    );
  });

  it('verilen ad çeviriyle ezilmez; verilmeyen ad dil değişince yenilenir', () => {
    const custom = make('Harita');
    const translated = make();
    i18next.emit('languageChanged', 'en');
    expect(custom.element.getAttribute('aria-label')).toBe('Harita');
    expect(translated.element.getAttribute('aria-label')).toBe(
      i18next.t('core:dualAxisScroll.label'),
    );
  });

  it('destroy dil dinleyicisini bırakır', () => {
    const off = vi.spyOn(i18next, 'off');
    const panel = make();
    panel.destroy();
    expect(off).toHaveBeenCalledWith('languageChanged', expect.any(Function));
    tracked.pop();
  });
});

describe('DualAxisScrollPanel klavye', () => {
  it('oklar görünümü adım adım kaydırır ve olayı iptal eder', () => {
    const panel = make();
    clampScroll(panel);
    expect(key(panel, 'ArrowDown').defaultPrevented).toBe(true);
    expect(panel.element.scrollTop).toBe(STEP);
    key(panel, 'ArrowRight');
    expect(panel.element.scrollLeft).toBe(STEP);
    key(panel, 'ArrowUp');
    expect(panel.element.scrollTop).toBe(0);
    key(panel, 'ArrowLeft');
    expect(panel.element.scrollLeft).toBe(0);
  });

  it('kaydırılacak yer kalmadıysa olay iptal edilmez (ata kaydırıcıya geçer)', () => {
    const panel = make();
    clampScroll(panel);
    expect(key(panel, 'ArrowUp').defaultPrevented).toBe(false);
    expect(key(panel, 'ArrowLeft').defaultPrevented).toBe(false);
    key(panel, 'End');
    expect(key(panel, 'ArrowDown').defaultPrevented).toBe(false);
  });

  it('içerik görünür alana sığıyorsa hiçbir tuş iptal edilmez', () => {
    const panel = make();
    clampScroll(panel, { w: 200, h: 200 });
    for (const name of ['ArrowDown', 'ArrowRight', 'PageDown', 'End']) {
      expect(key(panel, name).defaultPrevented, name).toBe(false);
    }
  });

  it('Page tuşları bir sayfa (görünür alan − adım) kaydırır; Shift yataydır', () => {
    const panel = make();
    clampScroll(panel);
    key(panel, 'PageDown');
    expect(panel.element.scrollTop).toBe(200 - STEP);
    key(panel, 'PageUp');
    expect(panel.element.scrollTop).toBe(0);
    key(panel, 'PageDown', { shiftKey: true });
    expect(panel.element.scrollLeft).toBe(200 - STEP);
    expect(panel.element.scrollTop).toBe(0);
  });

  it('Home/End uca atlar; Shift ile yatay uca', () => {
    const panel = make();
    clampScroll(panel);
    key(panel, 'End');
    expect(panel.element.scrollTop).toBe(600);
    key(panel, 'Home');
    expect(panel.element.scrollTop).toBe(0);
    key(panel, 'End', { shiftKey: true });
    expect(panel.element.scrollLeft).toBe(400);
    key(panel, 'Home', { shiftKey: true });
    expect(panel.element.scrollLeft).toBe(0);
  });

  it('içerideki denetimin tuşunu çalmaz; Ctrl/Meta/Alt ve iptal edilmiş olay işlenmez', () => {
    const panel = make();
    clampScroll(panel);
    const input = document.createElement('input');
    panel.add({ element: input });
    const inside = key(panel, 'ArrowDown', {}, input);
    expect(inside.defaultPrevented).toBe(false);
    expect(panel.element.scrollTop).toBe(0);

    for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(key(panel, 'ArrowDown', init).defaultPrevented).toBe(false);
    }
    const prevented = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    // Daha önce çalışan bir dinleyici (yakalama evresinde) olayı iptal ettiyse yüzey ona dokunmaz.
    const cancelEarly = (event: Event): void => event.preventDefault();
    document.addEventListener('keydown', cancelEarly, true);
    panel.element.dispatchEvent(prevented);
    document.removeEventListener('keydown', cancelEarly, true);
    expect(panel.element.scrollTop).toBe(0);
    expect(key(panel, 'a').defaultPrevented).toBe(false);
  });
});

describe('DualAxisScrollPanel tekerlek', () => {
  it('dikey ve yatay tekerlek kaydırır; kaydırma olduysa olay iptal edilir', () => {
    const panel = make();
    clampScroll(panel);
    expect(wheel(panel, { deltaY: 120 }).defaultPrevented).toBe(true);
    expect(panel.element.scrollTop).toBe(120);
    expect(wheel(panel, { deltaX: 90 }).defaultPrevented).toBe(true);
    expect(panel.element.scrollLeft).toBe(90);
  });

  it('Shift+tekerlek yataydır', () => {
    const panel = make();
    clampScroll(panel);
    wheel(panel, { deltaY: 70, shiftKey: true });
    expect(panel.element.scrollLeft).toBe(70);
    expect(panel.element.scrollTop).toBe(0);
  });

  it('satır ve sayfa modu birimlere çevrilir', () => {
    const panel = make();
    clampScroll(panel);
    wheel(panel, { deltaY: 3, deltaMode: 1 });
    expect(panel.element.scrollTop).toBe(48);
    wheel(panel, { deltaY: 1, deltaMode: 2 });
    expect(panel.element.scrollTop).toBe(48 + 200);
  });

  it('kenarda ve sığan içerikte olay iptal edilmez (sayfa kayabilsin)', () => {
    const panel = make();
    clampScroll(panel);
    expect(wheel(panel, { deltaY: -50 }).defaultPrevented).toBe(false);
    wheel(panel, { deltaY: 9999 });
    expect(wheel(panel, { deltaY: 50 }).defaultPrevented).toBe(false);

    const fitting = make();
    clampScroll(fitting, { w: 100, h: 100 });
    expect(wheel(fitting, { deltaY: 50 }).defaultPrevented).toBe(false);
  });

  it('Ctrl+tekerlek (tarayıcı yakınlaştırması) dokunulmaz', () => {
    const panel = make();
    clampScroll(panel);
    expect(wheel(panel, { deltaY: 120, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(panel.element.scrollTop).toBe(0);
  });
});
