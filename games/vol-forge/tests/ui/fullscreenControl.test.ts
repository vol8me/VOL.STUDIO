import { describe, expect, it, vi } from 'vitest';
import { FullscreenControl } from '../../src/ui/FullscreenControl';

describe('tam ekran kontrolü', () => {
  it('görünür düğme ve F11 aynı Fullscreen API akışını kullanır, listener temizlenir', async () => {
    const root = document.documentElement;
    const original = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
    let active = false;
    const request = vi.fn(() => {
      active = true;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    const exit = vi.fn(() => {
      active = false;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    Object.defineProperty(root, 'requestFullscreen', { configurable: true, value: request });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => (active ? root : null),
    });

    const control = new FullscreenControl(root);
    expect(control.element.disabled).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', bubbles: true }));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(control.element.getAttribute('aria-pressed')).toBe('true');

    control.element.click();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledTimes(1));
    expect(control.element.getAttribute('aria-pressed')).toBe('false');

    control.destroy();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', bubbles: true }));
    expect(request).toHaveBeenCalledTimes(1);

    Reflect.deleteProperty(root, 'requestFullscreen');
    Reflect.deleteProperty(document, 'exitFullscreen');
    if (original) Object.defineProperty(document, 'fullscreenElement', original);
  });
});
