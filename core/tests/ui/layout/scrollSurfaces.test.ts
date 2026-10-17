import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrollView } from '../../../src/ui/layout/ScrollView';
import { VirtualList } from '../../../src/ui/layout/VirtualList';
import { allUiCss, readUiCss } from '../../support/uiCss';

/**
 * Kaydırma yüzeyleri (UI-10.2): ScrollView, VirtualList ve SplitPane tutamağı. jsdom yerleşim hesaplamaz; gerçek
 * piksel ölçümü `devtools/vol-showcase/tests/e2e/scrollSplit.spec.ts` ve cihazdaki `tests/device/scrollSplit.spec.ts`
 * koşusundadır. Burada davranış sözleşmesi ve CSS politikası kilitlenir.
 */
const tracked: Array<{ destroy(): void }> = [];
function track<T extends { destroy(): void }>(instance: T): T {
  tracked.push(instance);
  return instance;
}

afterEach(() => {
  while (tracked.length > 0) tracked.pop()!.destroy();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
});

function stubReducedMotion(reduced: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('ScrollView programatik kaydırma ve hareket azaltma', () => {
  function withScrollTo(view: ScrollView): ReturnType<typeof vi.fn> {
    const scrollTo = vi.fn();
    Object.defineProperty(view.element, 'scrollTo', { configurable: true, value: scrollTo });
    Object.defineProperty(view.element, 'scrollHeight', { configurable: true, value: 900 });
    return scrollTo;
  }

  it('varsayılanda yumuşak kayar', () => {
    stubReducedMotion(false);
    const view = track(new ScrollView({ size: 100 }));
    const scrollTo = withScrollTo(view);
    view.scrollToBottom();
    view.scrollToTop();
    expect(scrollTo).toHaveBeenNthCalledWith(1, { top: 900, behavior: 'smooth' });
    expect(scrollTo).toHaveBeenNthCalledWith(2, { top: 0, behavior: 'smooth' });
  });

  it('hareket azaltmada animasyonsuz (anında) kayar; tarayıcı smooth değerini kendiliğinden kısmaz', () => {
    stubReducedMotion(true);
    const view = track(new ScrollView({ size: 100 }));
    const scrollTo = withScrollTo(view);
    view.scrollToBottom();
    view.scrollToTop();
    expect(scrollTo).toHaveBeenNthCalledWith(1, { top: 900, behavior: 'auto' });
    expect(scrollTo).toHaveBeenNthCalledWith(2, { top: 0, behavior: 'auto' });
  });

  it('tercih her çağrıda okunur (oturum sırasında değişir)', () => {
    const view = track(new ScrollView({ size: 100 }));
    const scrollTo = withScrollTo(view);
    stubReducedMotion(false);
    view.scrollToTop();
    stubReducedMotion(true);
    view.scrollToTop();
    expect(scrollTo.mock.calls.map(([argument]) => (argument as ScrollToOptions).behavior)).toEqual(
      ['smooth', 'auto'],
    );
  });

  it('klavyeyle kaydırılabilir: odaklanabilir kaydırma bölgesidir', () => {
    const view = track(new ScrollView({ size: 100 }));
    expect(view.element.tabIndex).toBe(0);
  });
});

describe('VirtualList pencereleme (5000 satır)', () => {
  const items = Array.from({ length: 5000 }, (_, index) => index);
  const make = (): VirtualList<number> => {
    const list = track(
      new VirtualList({
        items,
        itemHeight: 36,
        height: 260,
        overscan: 6,
        renderItem: (item) => {
          const row = document.createElement('span');
          row.textContent = `Öğe ${item + 1}`;
          return row;
        },
      }),
    );
    document.body.append(list.element);
    return list;
  };
  const rows = (list: VirtualList<number>): HTMLElement[] => [
    ...list.element.querySelectorAll<HTMLElement>('.vol-virtual-list__row'),
  ];

  it('DOM yalnız görünür aralık + taşma kadardır, tam liste bildirilir', () => {
    const list = make();
    expect(list).toBeInstanceOf(VirtualList);
    const rendered = rows(list);
    expect(rendered.length).toBeLessThan(25);
    expect(rendered[0]?.getAttribute('aria-posinset')).toBe('1');
    expect(rendered[0]?.getAttribute('aria-setsize')).toBe('5000');
    expect(list.element.getAttribute('role')).toBe('list');
    expect(list.element.tabIndex).toBe(0);
    const spacer = list.element.querySelector<HTMLElement>('.vol-virtual-list__spacer')!;
    expect(spacer.style.height).toBe(`${5000 * 36}px`);
  });

  it('kaydırınca pencere kayar: eski satırlar kalkar, yenileri gelir, DOM sayısı sabit kalır', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 0),
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    const list = make();
    const before = rows(list).length;

    list.element.scrollTop = 36 * 2500;
    list.element.dispatchEvent(new Event('scroll'));
    vi.runAllTimers();

    const rendered = rows(list);
    // Başta yukarıdaki taşma kırpılır; ortada pencere tam doludur: sayı küçülmez, sınırı da aşmaz.
    expect(rendered.length).toBeGreaterThanOrEqual(before);
    expect(rendered.length).toBeLessThan(25);
    expect(rendered.some((row) => row.textContent === 'Öğe 2501')).toBe(true);
    expect(rendered.some((row) => row.textContent === 'Öğe 1')).toBe(false);
    const viewport = list.element.querySelector<HTMLElement>('.vol-virtual-list__viewport')!;
    const first = Number(rendered[0]?.getAttribute('aria-posinset')) - 1;
    expect(viewport.style.transform).toBe(`translateY(${first * 36}px)`);
  });

  it('son satıra gidilince son öğe render edilir', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 0),
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    const list = make();
    list.scrollToIndex(4999);
    list.element.dispatchEvent(new Event('scroll'));
    vi.runAllTimers();
    expect(rows(list).some((row) => row.textContent === 'Öğe 5000')).toBe(true);
  });
});

describe('Kaydırma yüzeyi CSS politikası', () => {
  it('kaydırma çubuğu kalınlığını yazar küçültmez: ince çubuk ve ::-webkit-scrollbar kalınlığı yok (UA denetimi)', () => {
    const css = allUiCss().replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/scrollbar-width\s*:\s*thin/);
    expect(css).not.toMatch(/::-webkit-scrollbar(?!-)/);
    // Renk serbesttir: kalınlığa dokunmaz.
    const layout = readUiCss('layout/layout.css');
    expect(layout).toMatch(/\.vol-scroll-view\s*\{[^}]*scrollbar-color/);
  });

  it('odaklanabilir kaydırma yüzeyleri temanın odak halkasını taşır (varsayılan tarayıcı halkası değil)', () => {
    const layout = readUiCss('layout/layout.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule =
      /\.vol-scroll-view:focus-visible[^{,]*,\s*\.vol-virtual-list:focus-visible[^{]*\{([^}]*)\}/.exec(
        layout,
      )?.[1] ?? '';
    expect(rule).toMatch(/outline:\s*2px solid var\(--vol-ui-focus-ring\)/);
    expect(rule).toMatch(/outline-offset:\s*-2px/);
  });

  it('SplitPane tutamağı: gerçek kutu 24 px tabanlı, kaba işaretçide/large hedefte --vol-hit-target-min', () => {
    const layout = readUiCss('layout/layout.css');
    const rule = /\.vol-split-pane__separator\s*\{([^}]*)\}/.exec(layout)?.[1] ?? '';
    expect(rule).toMatch(/max\(24px,\s*var\(--vol-hit-target-min,\s*0px\)\)/);
    expect(rule).toMatch(/flex:\s*0 0 var\(--vol-split-handle-size\)/);
    // Kaba işaretçiye özel ikinci bir boyut yok: eski `@media (pointer: coarse) { flex-basis: 12px }` tutamağı 44 px'e
    // çıkaran token'ı eziyordu.
    expect(layout).not.toMatch(/@media \(pointer: coarse\)\s*\{\s*\.vol-split-pane__separator/);
    // Kutu büyür; görünmez taşan overlay değil: sözde elemanlar tutamağın İÇİNDE ortalanır.
    expect(layout).toMatch(
      /\.vol-split-pane--horizontal \.vol-split-pane__separator::after\s*\{[^}]*calc\(50% - 0\.5px\)/,
    );
    expect(layout).toMatch(
      /\.vol-split-pane--vertical \.vol-split-pane__separator::after\s*\{[^}]*calc\(50% - 0\.5px\)/,
    );
  });

  it('SplitPane en küçük bölme boyutları yerleşimde geçerlidir; dar kapta dış panel kayar', () => {
    const layout = readUiCss('layout/layout.css');
    expect(layout).toMatch(
      /\.vol-split-pane--horizontal\s*\{[^}]*flex-direction:\s*row;[^}]*overflow:\s*auto hidden/,
    );
    expect(layout).toMatch(
      /\.vol-split-pane--vertical\s*\{[^}]*flex-direction:\s*column;[^}]*overflow:\s*hidden auto/,
    );
    expect(layout).toMatch(
      /\.vol-split-pane--horizontal \.vol-split-pane__pane--secondary\s*\{[^}]*min-width:\s*var\(--vol-split-secondary-min/,
    );
    expect(layout).toMatch(
      /\.vol-split-pane--vertical \.vol-split-pane__pane--secondary\s*\{[^}]*min-height:\s*var\(--vol-split-secondary-min/,
    );
  });
});
