// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DisplayModeController,
  type DisplayMode,
  type DisplayModeControllerOptions,
} from '../../src/window/DisplayModeController';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));

function makePreference(initial: DisplayMode) {
  let mode = initial;
  const listeners = new Set<() => void>();
  return {
    getMode: () => mode,
    setMode: vi.fn((next: DisplayMode): Promise<void> => {
      if (next !== mode) {
        mode = next;
        for (const listener of listeners) listener();
      }
      return Promise.resolve();
    }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    listenerCount: () => listeners.size,
  };
}

function makeNativeWindow() {
  let fullscreen = false;
  let nativeListener: ((active: boolean) => void) | null = null;
  const stop = vi.fn();
  const adapter = {
    isAvailable: () => true,
    isFullscreen: vi.fn(() => Promise.resolve(fullscreen)),
    setFullscreen: vi.fn((active: boolean) => {
      fullscreen = active;
      return Promise.resolve();
    }),
    setResolution: vi.fn((_width: number, _height: number) => Promise.resolve()),
    onFullscreenChange: vi.fn((listener: (active: boolean) => void): Promise<() => void> => {
      nativeListener = listener;
      return Promise.resolve(stop);
    }),
  };
  return {
    adapter,
    stop,
    emitNative(active: boolean) {
      fullscreen = active;
      nativeListener?.(active);
    },
  };
}

const WINDOWED_SIZE = () => ({ width: 1280, height: 720 });
const controllers: DisplayModeController[] = [];

function create(options: DisplayModeControllerOptions): DisplayModeController {
  const controller = new DisplayModeController(options);
  controllers.push(controller);
  return controller;
}

afterEach(() => {
  while (controllers.length > 0) controllers.pop()?.destroy();
  Reflect.deleteProperty(document, 'fullscreenElement');
  vi.restoreAllMocks();
});

describe('DisplayModeController — native pencere', () => {
  it('açılış kipini ve pencereli boyutu uygular', async () => {
    const preference = makePreference('windowed');
    const native = makeNativeWindow();
    const controller = create({
      ...preference,
      windowAdapter: native.adapter,
      getWindowedSize: WINDOWED_SIZE,
    });

    await controller.start();

    expect(controller.hasNativeWindow()).toBe(true);
    expect(native.adapter.setFullscreen).not.toHaveBeenCalled();
    expect(native.adapter.setResolution).toHaveBeenCalledWith(1280, 720);
  });

  it('tercih değişince tam ekrana geçer; pencereliye dönünce boyutu yeniden uygular', async () => {
    const preference = makePreference('windowed');
    const native = makeNativeWindow();
    const controller = create({
      ...preference,
      windowAdapter: native.adapter,
      getWindowedSize: WINDOWED_SIZE,
    });
    await controller.start();
    native.adapter.setResolution.mockClear();

    await preference.setMode('fullscreen');
    await controller.flush();
    expect(native.adapter.setFullscreen).toHaveBeenLastCalledWith(true);
    expect(native.adapter.setResolution).not.toHaveBeenCalled();

    await preference.setMode('windowed');
    await controller.flush();
    expect(native.adapter.setFullscreen).toHaveBeenLastCalledWith(false);
    expect(native.adapter.setResolution).toHaveBeenCalledWith(1280, 720);
  });

  it('art arda gelen isteklerde yalnız sonuncusu pencereye dokunur', async () => {
    const preference = makePreference('windowed');
    const native = makeNativeWindow();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    native.adapter.isFullscreen.mockImplementationOnce(async () => {
      await gate;
      return false;
    });
    const controller = create({
      ...preference,
      windowAdapter: native.adapter,
      getWindowedSize: WINDOWED_SIZE,
    });

    const started = controller.start();
    await preference.setMode('fullscreen');
    await preference.setMode('windowed');
    release();
    await started;
    await controller.flush();

    expect(native.adapter.setFullscreen).not.toHaveBeenCalled();
    expect(native.adapter.setResolution).toHaveBeenCalledOnce();
  });

  it('pencereli boyut verilmezse boyuta dokunulmaz', async () => {
    const native = makeNativeWindow();
    const controller = create({ ...makePreference('windowed'), windowAdapter: native.adapter });
    await controller.start();
    expect(native.adapter.setResolution).not.toHaveBeenCalled();
  });

  it('F11 gerçek durumu tersine çevirir ve tercihe yazar', async () => {
    const preference = makePreference('windowed');
    const native = makeNativeWindow();
    const controller = create({ ...preference, windowAdapter: native.adapter });
    await controller.start();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', cancelable: true }));

    await vi.waitFor(() => expect(native.adapter.setFullscreen).toHaveBeenCalledWith(true));
    expect(preference.getMode()).toBe('fullscreen');
  });

  it('pencere yöneticisinden gelen değişimi tercihe yazar; destroy abonelikleri bırakır', async () => {
    const preference = makePreference('windowed');
    const native = makeNativeWindow();
    const controller = create({ ...preference, windowAdapter: native.adapter });
    await controller.start();

    native.emitNative(true);
    expect(preference.getMode()).toBe('fullscreen');

    controller.destroy();
    controller.destroy();
    expect(native.stop).toHaveBeenCalledOnce();
    expect(preference.listenerCount()).toBe(0);

    native.emitNative(false);
    expect(preference.getMode()).toBe('fullscreen');
  });

  it('uygulama hatası sınırlanır ve sonraki istek yine uygulanır', async () => {
    const preference = makePreference('windowed');
    const native = makeNativeWindow();
    native.adapter.setResolution.mockRejectedValueOnce(new Error('WM reddetti'));
    const onError = vi.fn();
    const controller = create({
      ...preference,
      windowAdapter: native.adapter,
      getWindowedSize: WINDOWED_SIZE,
      onError,
    });

    await controller.start();
    await preference.setMode('fullscreen');
    await controller.flush();

    expect(onError).toHaveBeenCalledOnce();
    expect(native.adapter.setFullscreen).toHaveBeenCalledWith(true);
  });

  it('native izleme kurulamazsa hata varsayılan olarak konsola düşer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const native = makeNativeWindow();
    native.adapter.onFullscreenChange.mockRejectedValueOnce(new Error('olay yok'));
    const controller = create({ ...makePreference('windowed'), windowAdapter: native.adapter });

    await controller.start();

    expect(warn).toHaveBeenCalledWith(
      '[DisplayModeController] Görüntü kipi uygulanamadı:',
      expect.any(Error),
    );
  });

  it('izleme kurulurken yok edilirse abonelik hemen bırakılır; start yeniden çalışmaz', async () => {
    const native = makeNativeWindow();
    let resolveWatch!: (stop: () => void) => void;
    native.adapter.onFullscreenChange.mockImplementationOnce(
      () =>
        new Promise<() => void>((resolve) => {
          resolveWatch = resolve;
        }),
    );
    const controller = create({ ...makePreference('windowed'), windowAdapter: native.adapter });

    const started = controller.start();
    await vi.waitFor(() => expect(native.adapter.onFullscreenChange).toHaveBeenCalled());
    controller.destroy();
    resolveWatch(native.stop);
    await started;

    expect(native.stop).toHaveBeenCalledOnce();
    await controller.start();
    expect(native.adapter.onFullscreenChange).toHaveBeenCalledOnce();
  });
});

describe('DisplayModeController — native pencere yokken', () => {
  function fakeDomFullscreen() {
    let element: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => element,
    });
    const target = document.createElement('div');
    target.requestFullscreen = vi.fn(() => {
      element = target;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    return {
      target,
      exitByBrowser() {
        element = null;
        document.dispatchEvent(new Event('fullscreenchange'));
      },
    };
  }

  it('DOM tam ekranını uygular, tarayıcıdan çıkışı tercihe yazar ve native izleme kurmaz', async () => {
    const dom = fakeDomFullscreen();
    const preference = makePreference('fullscreen');
    const native = makeNativeWindow();
    const controller = create({
      ...preference,
      target: dom.target,
      windowAdapter: { ...native.adapter, isAvailable: () => false },
    });

    await controller.start();

    expect(controller.hasNativeWindow()).toBe(false);
    expect(dom.target.requestFullscreen).toHaveBeenCalledOnce();
    expect(native.adapter.onFullscreenChange).not.toHaveBeenCalled();

    dom.exitByBrowser();
    expect(preference.setMode).toHaveBeenLastCalledWith('windowed');
    expect(preference.getMode()).toBe('windowed');
  });

  it('toggle DOM tam ekranına geçer ve tercihi günceller', async () => {
    const dom = fakeDomFullscreen();
    const preference = makePreference('windowed');
    const controller = create({ ...preference, target: dom.target });

    await controller.start();
    await controller.toggle();

    expect(controller.hasNativeWindow()).toBe(false);
    expect(dom.target.requestFullscreen).toHaveBeenCalledOnce();
    expect(preference.getMode()).toBe('fullscreen');
  });
});
