import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAppVisibility,
  observeAppVisibility,
  type AppVisibilityState,
} from '../../src/lifecycle/appVisibility';

/** jsdom'da `document.hidden` salt okunur; testler onu açıkça yeniden tanımlar. */
function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
}

const disposers: Array<() => void> = [];

function observe(
  onChange: (state: AppVisibilityState) => void,
  options?: { includeWindowFocus?: boolean },
): void {
  disposers.push(observeAppVisibility(onChange, options));
}

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
  setHidden(false);
});

describe('observeAppVisibility', () => {
  it('belge gizlenince arka plan bildirir', () => {
    const seen: AppVisibilityState[] = [];
    observe((state) => seen.push(state));

    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(seen).toEqual(['background']);
  });

  it('pencere odağı kaybı da arka plan sayılır — belge gizlenmese bile', () => {
    // Android'de bildirim gölgesini açmak çoğu cihazda blur üretir ama
    // visibilitychange üretmez; yalnızca birine abone olan tüketici kaçırır.
    const seen: AppVisibilityState[] = [];
    observe((state) => seen.push(state));

    window.dispatchEvent(new Event('blur'));

    expect(seen).toEqual(['background']);
    expect(document.hidden).toBe(false);
  });

  it('aynı geçişte gelen blur + visibilitychange TEK bildirim üretir', () => {
    const seen: AppVisibilityState[] = [];
    observe((state) => seen.push(state));

    window.dispatchEvent(new Event('blur'));
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(seen).toEqual(['background']);
  });

  it('geri dönüşte ön plan bildirir', () => {
    const seen: AppVisibilityState[] = [];
    observe((state) => seen.push(state));

    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(seen).toEqual(['background', 'foreground']);
  });

  it('odak geri gelse de belge hâlâ gizliyse ön plan denmez', () => {
    const seen: AppVisibilityState[] = [];
    observe((state) => seen.push(state));

    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));

    expect(seen).toEqual(['background']);
  });

  it('includeWindowFocus false iken blur yok sayılır', () => {
    const onChange = vi.fn();
    observe(onChange, { includeWindowFocus: false });

    window.dispatchEvent(new Event('blur'));
    expect(onChange).not.toHaveBeenCalled();

    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onChange).toHaveBeenCalledWith('background');
  });

  it('abonelik kaldırılınca dinleyici çağrılmaz', () => {
    const onChange = vi.fn();
    const stop = observeAppVisibility(onChange);
    stop();

    window.dispatchEvent(new Event('blur'));
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('listener kurulumu yarıda hata verirse daha önce eklenenleri geri bırakır', () => {
    const originalWindowAdd = window.addEventListener.bind(window);
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const removeDocument = vi.spyOn(document, 'removeEventListener');
    const addWindow = vi.spyOn(window, 'addEventListener').mockImplementation(((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean,
    ) => {
      if (type === 'focus') throw new Error('host listener rejected');
      originalWindowAdd(type, listener, options);
    }) as typeof window.addEventListener);

    expect(() => observeAppVisibility(vi.fn())).toThrow('host listener rejected');
    expect(removeWindow).toHaveBeenCalledWith('blur', expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    addWindow.mockRestore();
    removeWindow.mockRestore();
    removeDocument.mockRestore();
  });

  it('getAppVisibility belgenin anlık durumunu yansıtır', () => {
    expect(getAppVisibility()).toBe('foreground');
    setHidden(true);
    expect(getAppVisibility()).toBe('background');
  });
});
