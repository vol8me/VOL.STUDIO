import { afterEach, describe, expect, it, vi } from 'vitest';
import { FullscreenController } from '../../src/ui/controls/FullscreenController';

const originalFullscreenElement = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
const originalExitFullscreen = Object.getOwnPropertyDescriptor(document, 'exitFullscreen');
const originalRequestFullscreen = Object.getOwnPropertyDescriptor(
  document.documentElement,
  'requestFullscreen',
);

afterEach(() => {
  if (originalFullscreenElement) {
    Object.defineProperty(document, 'fullscreenElement', originalFullscreenElement);
  } else {
    Reflect.deleteProperty(document, 'fullscreenElement');
  }
  if (originalExitFullscreen) {
    Object.defineProperty(document, 'exitFullscreen', originalExitFullscreen);
  } else {
    Reflect.deleteProperty(document, 'exitFullscreen');
  }
  if (originalRequestFullscreen) {
    Object.defineProperty(document.documentElement, 'requestFullscreen', originalRequestFullscreen);
  } else {
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
  }
});

function setFullscreenElement(element: Element | null): void {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => element,
  });
}

describe('FullscreenController', () => {
  it('F11 basımını tam ekran isteğine yönlendirir ve tekrarları yok sayar', async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    const controller = new FullscreenController({ target: document.documentElement });
    const event = new KeyboardEvent('keydown', { key: 'F11', cancelable: true });

    window.dispatchEvent(event);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', repeat: true }));
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(true);
    expect(requestFullscreen).toHaveBeenCalledOnce();
    controller.destroy();
  });

  it('aktif tam ekranda toggle çıkış API’sini çağırır', async () => {
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    });
    setFullscreenElement(document.documentElement);
    const controller = new FullscreenController();

    await controller.toggle();

    expect(exitFullscreen).toHaveBeenCalledOnce();
    controller.destroy();
  });

  it('setFullscreen aynı durumda API çağırmaz ve istenen durumu uygular', async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    });
    const controller = new FullscreenController();

    setFullscreenElement(null);
    await controller.setFullscreen(false);
    await controller.setFullscreen(true);
    expect(requestFullscreen).toHaveBeenCalledOnce();

    setFullscreenElement(document.documentElement);
    await controller.setFullscreen(true);
    await controller.setFullscreen(false);
    expect(exitFullscreen).toHaveBeenCalledOnce();
    controller.destroy();
  });

  it('haricî toggle sahibi verilirse F11 niyetini ona yönlendirir', async () => {
    const onToggleRequest = vi.fn().mockResolvedValue(undefined);
    const controller = new FullscreenController({ onToggleRequest });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', cancelable: true }));
    await Promise.resolve();

    expect(onToggleRequest).toHaveBeenCalledOnce();
    controller.destroy();
  });

  it('haricî toggle hatasını onError ile sınırlar', async () => {
    const failure = new Error('native fullscreen reddedildi');
    const onError = vi.fn();
    const controller = new FullscreenController({
      onToggleRequest: () => Promise.reject(failure),
      onError,
    });

    await controller.toggle();

    expect(onError).toHaveBeenCalledWith(failure);
    controller.destroy();
  });

  it('API yoksa hatayı callback ile bildirir ve destroy sonrası F11 dinlenmez', async () => {
    const onError = vi.fn();
    const controller = new FullscreenController({ onError });

    await controller.toggle();
    expect(onError).toHaveBeenCalledOnce();

    controller.destroy();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', cancelable: true }));
    expect(onError).toHaveBeenCalledOnce();
  });
});
