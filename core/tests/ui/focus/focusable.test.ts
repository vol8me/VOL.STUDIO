import { afterEach, describe, expect, it, vi } from 'vitest';
import { FOCUSABLE_SELECTOR, listFocusable } from '../../../src/ui/focus/focusable';

/**
 * Odaklanabilir eleman sözleşmesi: tek seçici hem `Modal` focus-trap'ine hem kol gezinmesine hizmet eder.
 * jsdom yerleşim hesaplamaz; gezinilebilirlik için sıfırdan büyük kutu taklit edilir.
 */
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const withBoxes = (): void => {
  const rect = { width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10, x: 0, y: 0 };
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);
};

function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

describe('FOCUSABLE_SELECTOR', () => {
  it('etkin düğme/giriş/seçim/bağlantı ve tabindex’li öğeleri eşler; devre dışı, tabindex=-1 ve ikon href’i eşlemez', () => {
    const host = mount(`
      <button id="a">a</button>
      <button id="b" disabled>b</button>
      <a id="c" href="#x">c</a>
      <a id="d">d</a>
      <input id="e" />
      <input id="f" disabled />
      <select id="g"></select>
      <textarea id="h"></textarea>
      <div id="i" tabindex="0"></div>
      <div id="j" tabindex="-1"></div>
      <svg><use id="k" href="#icon"></use></svg>
    `);
    const matched = [...host.querySelectorAll(FOCUSABLE_SELECTOR)].map((element) => element.id);
    expect(matched).toEqual(['a', 'c', 'e', 'g', 'h', 'i']);
  });
});

describe('listFocusable', () => {
  it('kutusu olmayan (görünmez) ve inert atalı öğeleri dışarıda bırakır', () => {
    withBoxes();
    const host = mount(`
      <button id="a">a</button>
      <div inert><button id="b">b</button></div>
      <button id="c">c</button>
    `);
    expect(listFocusable(host).map((element) => element.id)).toEqual(['a', 'c']);

    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 0,
      height: 0,
    } as DOMRect);
    expect(listFocusable(host)).toEqual([]);
  });

  it('açık modal diyalog varsa adaylar onun alt ağacıyla sınırlanır; kapalı (inert) diyalog sayılmaz', () => {
    withBoxes();
    const host = mount(`
      <button id="page">sayfa</button>
      <div role="dialog" aria-modal="true" id="open"><button id="inside">içeride</button></div>
    `);
    expect(listFocusable(host).map((element) => element.id)).toEqual(['inside']);

    host.querySelector('#open')!.setAttribute('inert', '');
    expect(listFocusable(host).map((element) => element.id)).toEqual(['page']);
  });
});
