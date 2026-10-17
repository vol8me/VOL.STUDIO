// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DisplayModeController,
  type DisplayMode,
  type DisplayModeControllerOptions,
} from '../../src/window/DisplayModeController';
import { TauriWindowAdapter } from '../../src/window/TauriWindowAdapter';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

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
  it('başlangıç aboneliği reddedilince F11 sahipliğini bırakır ve yeniden kurulmaz', async () => {
    const native = makeNativeWindow();
    const failure = new Error('tercih aboneliği kurulamadı');
    const subscribe = vi.fn(() => {
      throw failure;
    });
    const controller = create({
      ...makePreference('windowed'),
      subscribe,
      windowAdapter: native.adapter,
    });

    await expect(controller.start()).rejects.toBe(failure);
    const event = new KeyboardEvent('keydown', { key: 'F11', cancelable: true });
    window.dispatchEvent(event);
    await controller.toggle();
    await controller.start();

    expect(event.defaultPrevented).toBe(false);
    expect(subscribe).toHaveBeenCalledOnce();
    expect(native.adapter.isFullscreen).not.toHaveBeenCalled();
    expect(native.adapter.onFullscreenChange).not.toHaveBeenCalled();
  });

  it('eşzamanlı start çağrıları aynı kurulumun tamamlanmasını bekler', async () => {
    const native = makeNativeWindow();
    let release!: (active: boolean) => void;
    native.adapter.isFullscreen.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const controller = create({ ...makePreference('windowed'), windowAdapter: native.adapter });
    const first = controller.start();
    let ready = false;
    const second = controller.start().then(() => {
      ready = true;
    });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect(ready).toBe(false);
    release(false);
    await Promise.all([first, second]);
    expect(native.adapter.onFullscreenChange).toHaveBeenCalledTimes(1);
  });

  it('eski native tam ekran yankısı daha yeni pencere tercihini geri alamaz', async () => {
    const preference = makePreference('windowed');
    const native = makeNativeWindow();
    const controller = create({ ...preference, windowAdapter: native.adapter });
    await controller.start();
    let release!: () => void;
    native.adapter.setFullscreen.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await preference.setMode('fullscreen');
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await preference.setMode('windowed');
    native.emitNative(true);
    release();
    await controller.flush();
    expect(preference.getMode()).toBe('windowed');
    expect(native.adapter.setFullscreen).toHaveBeenLastCalledWith(false);
  });

  it('gerçek adaptörün geç resize probu bekleyen yeni pencere sorgusunu geçersiz kılamaz', async () => {
    const preference = makePreference('windowed');
    const fullscreenWritten = deferred<void>();
    const fullscreenStarted = deferred<void>();
    let active = false;
    let resize!: () => void;
    const target = {
      center: vi.fn().mockResolvedValue(undefined),
      onResized: vi.fn((listener: () => void) => {
        resize = listener;
        return Promise.resolve(vi.fn());
      }),
      setFullscreen: vi.fn((next: boolean) => {
        active = next;
        if (next) {
          fullscreenStarted.resolve();
          return fullscreenWritten.promise;
        }
        return Promise.resolve();
      }),
      setSize: vi.fn().mockResolvedValue(undefined),
    };
    const readFullscreen = vi.fn(() => Promise.resolve(active));
    const adapter = new TauriWindowAdapter({ enabled: true, window: target, readFullscreen });
    const controller = create({ ...preference, windowAdapter: adapter });
    await controller.start();

    await preference.setMode('fullscreen');
    await fullscreenStarted.promise;
    await preference.setMode('windowed');
    const probeStarted = deferred<void>();
    const oldProbe = deferred<boolean>();
    readFullscreen.mockImplementationOnce(() => {
      probeStarted.resolve();
      return oldProbe.promise;
    });
    resize();
    await probeStarted.promise;

    const windowedReadStarted = deferred<void>();
    const windowedRead = deferred<boolean>();
    readFullscreen.mockImplementationOnce(() => {
      windowedReadStarted.resolve();
      return windowedRead.promise;
    });
    fullscreenWritten.resolve();
    await windowedReadStarted.promise;
    oldProbe.resolve(true);
    // Adaptör bu promise'i önce beklemeye başladı; onun bildirimi önce çalışır.
    await oldProbe.promise;
    windowedRead.resolve(true);
    await controller.flush();

    expect(preference.getMode()).toBe('windowed');
    expect(preference.setMode.mock.calls).toEqual([['fullscreen'], ['windowed']]);
    expect(target.setFullscreen.mock.calls).toEqual([[true], [false]]);

    resize();
    await vi.waitFor(() => expect(preference.setMode).toHaveBeenCalledTimes(3));
    await controller.flush();
    active = true;
    resize();
    await vi.waitFor(() => expect(preference.getMode()).toBe('fullscreen'));
    await controller.flush();
    expect(target.setFullscreen.mock.calls).toEqual([[true], [false]]);
  });

  it('henüz başlamayan birleşmiş uygulamaların son niyetini native olay geri alamaz', async () => {
    const preference = makePreference('windowed');
    const native = makeNativeWindow();
    const controller = create({ ...preference, windowAdapter: native.adapter });
    await controller.start();

    const first = preference.setMode('fullscreen');
    const last = preference.setMode('windowed');
    native.emitNative(true);
    await Promise.all([first, last]);
    await controller.flush();

    expect(preference.getMode()).toBe('windowed');
    expect(native.adapter.setFullscreen.mock.calls).toEqual([[false]]);
    native.emitNative(true);
    expect(preference.getMode()).toBe('fullscreen');
    await controller.flush();
  });

  it.each(['sorgu', 'uygulama'] as const)(
    'native %s reddinden sonra boşta gelen pencere yöneticisi değişimi kabul edilir',
    async (stage) => {
      const preference = makePreference('windowed');
      const native = makeNativeWindow();
      const onError = vi.fn();
      const controller = create({ ...preference, windowAdapter: native.adapter, onError });
      await controller.start();
      const started = deferred<void>();
      const operation = deferred<never>();
      const pending = () => {
        started.resolve();
        return operation.promise;
      };
      if (stage === 'sorgu') native.adapter.isFullscreen.mockImplementationOnce(pending);
      else native.adapter.setFullscreen.mockImplementationOnce(pending);

      await preference.setMode('fullscreen');
      await started.promise;
      native.emitNative(false);
      expect(preference.getMode()).toBe('fullscreen');
      const failure = new Error('native pencere reddetti');
      operation.reject(failure);
      await expect(controller.flush()).rejects.toBe(failure);

      native.emitNative(false);
      expect(preference.getMode()).toBe('windowed');
      await expect(controller.flush()).resolves.toBeUndefined();
      expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    },
  );

  it('F11 durum sorgusu beklerken native yankı toggle niyetini iptal edemez', async () => {
    const preference = makePreference('windowed');
    const native = makeNativeWindow();
    const controller = create({ ...preference, windowAdapter: native.adapter });
    await controller.start();
    const started = deferred<void>();
    const read = deferred<boolean>();
    native.adapter.isFullscreen.mockImplementationOnce(() => {
      started.resolve();
      return read.promise;
    });

    const toggled = controller.toggle();
    await started.promise;
    native.emitNative(true);
    read.resolve(true);
    await toggled;

    expect(preference.getMode()).toBe('windowed');
    expect(preference.setMode).toHaveBeenCalledExactlyOnceWith('windowed');
    expect(native.adapter.setFullscreen).toHaveBeenLastCalledWith(false);
  });

  it('native değişimin kalıcılık reddi flush ile görünür ve sonraki başarı toparlar', async () => {
    const native = makeNativeWindow();
    const preference = makePreference('windowed');
    const failure = new Error('kayıt yok');
    const onError = vi.fn();
    const setMode = vi.fn((): Promise<void> => Promise.reject(failure));
    const controller = create({ ...preference, setMode, windowAdapter: native.adapter, onError });
    await controller.start();
    native.emitNative(true);
    await expect(controller.flush()).rejects.toBe(failure);
    expect(onError).toHaveBeenCalledWith(failure);
    setMode.mockResolvedValueOnce();
    native.emitNative(true);
    await expect(controller.flush()).resolves.toBeUndefined();
  });

  it('bir native abonelik kapanışı hata verse de diğer kaynakları bırakır', async () => {
    const native = makeNativeWindow();
    const preference = makePreference('windowed');
    const controller = create({ ...preference, windowAdapter: native.adapter });
    await controller.start();
    native.stop.mockImplementation(() => {
      throw new Error('kapanış');
    });
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      controller.destroy();
    } catch {
      /* Sonraki sahipler yine bırakılmalı. */
    }
    expect(preference.listenerCount()).toBe(0);
    report.mockRestore();
  });

  it('native olayın kayıt hatasından sonra başarılı F11 yazımı flush sonucunu toparlar', async () => {
    const native = makeNativeWindow();
    const preference = makePreference('windowed');
    const failure = new Error('kayıt yok');
    const controller = create({ ...preference, windowAdapter: native.adapter, onError: vi.fn() });
    await controller.start();
    preference.setMode.mockRejectedValueOnce(failure);
    native.emitNative(true);
    await expect(controller.flush()).rejects.toBe(failure);

    await controller.toggle();

    await expect(controller.flush()).resolves.toBeUndefined();
    expect(preference.getMode()).toBe('windowed');
    expect(native.adapter.setFullscreen).toHaveBeenLastCalledWith(false);
  });

  it('eski native kaydın geç reddi daha yeni başarılı F11 yazımını bozamaz', async () => {
    const native = makeNativeWindow();
    const preference = makePreference('windowed');
    let rejectPrevious!: (error: Error) => void;
    const controller = create({ ...preference, windowAdapter: native.adapter, onError: vi.fn() });
    await controller.start();
    preference.setMode.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectPrevious = reject;
        }),
    );
    native.emitNative(true);
    const toggled = controller.toggle();
    await vi.waitFor(() => expect(preference.setMode).toHaveBeenCalledTimes(2));
    rejectPrevious(new Error('eski kayıt'));
    await toggled;

    await expect(controller.flush()).resolves.toBeUndefined();
    expect(preference.getMode()).toBe('windowed');
  });
  it('bekleyen F11 sorgusu bitmeden flush tamamlanmaz ve son tercih uygulanır', async () => {
    const preference = makePreference('windowed');
    const native = makeNativeWindow();
    const controller = create({ ...preference, windowAdapter: native.adapter });
    await controller.start();
    let release!: (active: boolean) => void;
    native.adapter.isFullscreen.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const toggle = controller.toggle();
    let settled = false;
    const flush = controller.flush().then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    release(false);
    await Promise.all([toggle, flush]);
    expect(preference.getMode()).toBe('fullscreen');
    expect(await native.adapter.isFullscreen()).toBe(true);
  });

  it('bekleyen F11 sorgusu destroy sonrasında tercihi değiştiremez', async () => {
    const preference = makePreference('windowed');
    const native = makeNativeWindow();
    const controller = create({ ...preference, windowAdapter: native.adapter });
    await controller.start();
    let release!: (active: boolean) => void;
    native.adapter.isFullscreen.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const toggle = controller.toggle();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    controller.destroy();
    release(false);
    await toggle;
    await controller.flush();
    expect(preference.getMode()).toBe('windowed');
    expect(preference.setMode).not.toHaveBeenCalled();
  });

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

  it('aynı boyut yeniden uygulanmaz: başka bir tercih değişimi pencereyi ortalamaz; boyut değişince uygulanır', async () => {
    const preference = makePreference('windowed');
    const native = makeNativeWindow();
    let size = { width: 1280, height: 720 };
    const listeners = new Set<() => void>();
    const notify = (): void => listeners.forEach((listener) => listener());
    const controller = create({
      ...preference,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      windowAdapter: native.adapter,
      getWindowedSize: () => size,
    });
    await controller.start();
    expect(native.adapter.setResolution).toHaveBeenCalledTimes(1);

    // Başka bir ayarın değişimi de tercih dinleyicisini tetikler (ses kaydırıcısı gibi).
    notify();
    await controller.flush();
    expect(native.adapter.setResolution).toHaveBeenCalledTimes(1);

    size = { width: 1920, height: 1080 };
    notify();
    await controller.flush();
    expect(native.adapter.setResolution).toHaveBeenLastCalledWith(1920, 1080);
    expect(native.adapter.setResolution).toHaveBeenCalledTimes(2);
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
    await expect(controller.flush()).rejects.toThrow('WM reddetti');
    await preference.setMode('fullscreen');
    await controller.flush();

    expect(onError).toHaveBeenCalledOnce();
    expect(native.adapter.setFullscreen).toHaveBeenCalledWith(true);
  });

  it('native toggle sorgu reddi tercihi değiştirmez; flush reddeder ve sonraki istek toparlanır', async () => {
    const preference = makePreference('windowed');
    const native = makeNativeWindow();
    const error = new Error('tam ekran sorgusu reddedildi');
    const onError = vi.fn();
    const controller = create({ ...preference, windowAdapter: native.adapter, onError });
    await controller.start();
    native.adapter.isFullscreen.mockRejectedValueOnce(error);

    await controller.toggle();
    await expect(controller.flush()).rejects.toBe(error);
    expect(preference.setMode).not.toHaveBeenCalled();
    expect(native.adapter.setFullscreen).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(error);

    await controller.toggle();
    await expect(controller.flush()).resolves.toBeUndefined();
    expect(preference.getMode()).toBe('fullscreen');
    expect(native.adapter.setFullscreen).toHaveBeenCalledWith(true);
  });

  it('hata gözlemcisi fırlatsa da uygulama kuyruğu sonraki istekte toparlanır', async () => {
    const preference = makePreference('windowed');
    const native = makeNativeWindow();
    const error = new Error('WM reddetti');
    native.adapter.isFullscreen.mockRejectedValueOnce(error);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const controller = create({
      ...preference,
      windowAdapter: native.adapter,
      onError: () => {
        throw new Error('tanı kapalı');
      },
    });
    await expect(controller.start()).resolves.toBeUndefined();
    await expect(controller.flush()).rejects.toBe(error);
    await preference.setMode('fullscreen');
    await expect(controller.flush()).resolves.toBeUndefined();
    expect(native.adapter.setFullscreen).toHaveBeenCalledWith(true);
    expect(warn).toHaveBeenCalled();
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
  it('DOM tam ekran reddi flush sonucunda görünür ve sonraki istek toparlanır', async () => {
    const target = document.createElement('div');
    const error = new Error('DOM reddetti');
    target.requestFullscreen = vi.fn(() => Promise.reject(error));
    const preference = makePreference('fullscreen');
    const onError = vi.fn();
    const controller = create({ ...preference, target, onError });
    await controller.start();
    await expect(controller.flush()).rejects.toBe(error);
    expect(onError).toHaveBeenCalledWith(error);
    await preference.setMode('windowed');
    await expect(controller.flush()).resolves.toBeUndefined();
  });

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
