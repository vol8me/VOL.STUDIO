import { afterEach, describe, expect, it, vi } from 'vitest';
import { backHandlerCount, pushBackHandler } from '../../src/platform/backNavigation';

const disposers: Array<() => void> = [];

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
  expect(backHandlerCount()).toBe(0);
});

describe('Android geri navigasyonu', () => {
  it('son eklenen işleyiciden başlayıp olay tüketilene kadar yürür', () => {
    const lower = vi.fn(() => true);
    const upper = vi.fn(() => false);
    disposers.push(pushBackHandler(lower), pushBackHandler(upper));

    window.dispatchEvent(new Event('vol:androidback'));

    expect(upper).toHaveBeenCalledOnce();
    expect(lower).toHaveBeenCalledOnce();
  });

  it('üst işleyici olayı tüketirse alttaki ekrana sızdırmaz', () => {
    const lower = vi.fn(() => true);
    const upper = vi.fn(() => true);
    disposers.push(pushBackHandler(lower), pushBackHandler(upper));

    window.dispatchEvent(new Event('vol:androidback'));

    expect(upper).toHaveBeenCalledOnce();
    expect(lower).not.toHaveBeenCalled();
  });

  it('son kayıt kalkınca global window listenerını da bırakır', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const handler = vi.fn(() => true);
    const dispose = pushBackHandler(handler);

    dispose();
    dispose();
    window.dispatchEvent(new Event('vol:androidback'));

    expect(handler).not.toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalledWith('vol:androidback', expect.any(Function));
    expect(backHandlerCount()).toBe(0);
  });

  it('işleyici yığını olay sırasında değişse bile aynı handlerı iki kez çağırmaz', () => {
    const bottom = vi.fn(() => true);
    const removeBottom = pushBackHandler(bottom);
    const top = vi.fn(() => {
      removeBottom();
      return false;
    });
    disposers.push(removeBottom, pushBackHandler(top));

    window.dispatchEvent(new Event('vol:androidback'));

    expect(top).toHaveBeenCalledOnce();
    expect(bottom).not.toHaveBeenCalled();
  });

  it('hatalı üst işleyici alttaki güvenli geri yolunu kilitlemez', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const lower = vi.fn(() => true);
    const upper = vi.fn(() => {
      throw new Error('bozuk overlay');
    });
    disposers.push(pushBackHandler(lower), pushBackHandler(upper));

    window.dispatchEvent(new Event('vol:androidback'));

    expect(upper).toHaveBeenCalledOnce();
    expect(lower).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      '[backNavigation] Android geri işleyicisi başarısız:',
      expect.any(Error),
    );
    error.mockRestore();
  });

  it('global listener kaydı reddedilirse hayalet sahiplik bırakmaz ve sonraki deneme çalışır', () => {
    const originalAdd = window.addEventListener.bind(window);
    const add = vi
      .spyOn(window, 'addEventListener')
      .mockImplementationOnce(() => {
        throw new Error('WebView listener rejected');
      })
      .mockImplementation(originalAdd);
    const handler = vi.fn(() => true);

    expect(() => pushBackHandler(handler)).toThrow('WebView listener rejected');
    expect(backHandlerCount()).toBe(0);

    const dispose = pushBackHandler(handler);
    disposers.push(dispose);
    window.dispatchEvent(new Event('vol:androidback'));
    expect(handler).toHaveBeenCalledOnce();
    add.mockRestore();
  });
});
