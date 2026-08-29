import { describe, expect, it, vi } from 'vitest';
import { TauriWindowAdapter } from '../../src/window/TauriWindowAdapter';

/**
 * Bekleyen promise zincirlerini boşaltır.
 *
 * Testler eskiden sabit sayıda `await Promise.resolve()` ile ilerliyordu; bu,
 * gözlemcinin İÇ mikro-görev sayısına bağımlılıktı — sıralama sertleştirilince
 * (kuyruk + nesil sayacı) davranış aynı kalmasına rağmen testler düştü. Makro
 * göreve düşmek zincirin derinliğinden bağımsızdır.
 */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeWindow() {
  let resized: (() => void) | null = null;
  const unlisten = vi.fn();
  const target = {
    center: vi.fn().mockResolvedValue(undefined),
    isFullscreen: vi.fn().mockResolvedValue(false),
    onResized: vi.fn((handler: () => void) => {
      resized = handler;
      return Promise.resolve(unlisten);
    }),
    setFullscreen: vi.fn().mockResolvedValue(undefined),
    setSize: vi.fn().mockResolvedValue(undefined),
  };

  return {
    target,
    unlisten,
    emitResize: () => resized?.(),
  };
}

describe('TauriWindowAdapter', () => {
  it('native olmayan ortamda pencere çağrılarını güvenli no-op yapar', async () => {
    const adapter = new TauriWindowAdapter({ enabled: false });

    expect(adapter.isAvailable()).toBe(false);
    await expect(adapter.isFullscreen()).resolves.toBe(false);
    await expect(adapter.setFullscreen(true)).resolves.toBeUndefined();
    await expect(adapter.setResolution(1280, 720)).resolves.toBeUndefined();

    const stop = await adapter.onFullscreenChange(vi.fn());
    expect(stop).toEqual(expect.any(Function));
    expect(stop()).toBeUndefined();
  });

  it('tam ekran ve mantıksal çözünürlüğü native pencereye uygular', async () => {
    const { target } = makeWindow();
    const size = { type: 'Logical', width: 1600, height: 900 };
    const adapter = new TauriWindowAdapter({
      enabled: true,
      window: target as never,
      createLogicalSize: () => size as never,
    });

    await adapter.setFullscreen(true);
    await adapter.setResolution(1600, 900);

    expect(adapter.isAvailable()).toBe(true);
    expect(target.setFullscreen).toHaveBeenCalledWith(true);
    expect(target.setSize).toHaveBeenCalledWith(size);
    expect(target.center).toHaveBeenCalledOnce();
  });

  it('geçersiz çözünürlüğü reddeder ve varsayılan LogicalSize üreticisi çalışır', async () => {
    const { target } = makeWindow();
    const adapter = new TauriWindowAdapter({ enabled: true, window: target as never });

    await expect(adapter.setResolution(0, 720)).rejects.toThrow(RangeError);
    await expect(adapter.setResolution(1280.5, 720)).rejects.toThrow(RangeError);
    expect(target.setSize).not.toHaveBeenCalled();

    await adapter.setResolution(1280, 720);
    const sent = target.setSize.mock.calls[0][0] as { type: string; width: number; height: number };
    expect(sent.type).toBe('Logical');
    expect(sent.width).toBe(1280);
    expect(sent.height).toBe(720);
    expect(target.center).toHaveBeenCalledOnce();
  });

  it('resize sonrası yalnız değişen tam ekran durumunu bildirir ve aboneliği kaldırır', async () => {
    const { target, emitResize, unlisten } = makeWindow();
    const listener = vi.fn();
    const adapter = new TauriWindowAdapter({ enabled: true, window: target as never });
    const stop = await adapter.onFullscreenChange(listener);

    emitResize();
    await flushPromises();
    expect(listener).not.toHaveBeenCalled();

    target.isFullscreen.mockResolvedValue(true);
    emitResize();
    await flushPromises();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(true);

    stop();
    stop();
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('resize durum okuması reddedilirse listener zinciri ayakta kalır', async () => {
    const { target, emitResize } = makeWindow();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const listener = vi.fn();
    const adapter = new TauriWindowAdapter({ enabled: true, window: target as never });
    const stop = await adapter.onFullscreenChange(listener);

    target.isFullscreen.mockRejectedValueOnce(new Error('IPC kapandı'));
    emitResize();
    await flushPromises();

    expect(listener).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    stop();
    warn.mockRestore();
  });

  it('taban okunurken gelen resize kaybolmaz', async () => {
    const { target, emitResize } = makeWindow();
    const listener = vi.fn();

    // Taban okuması GEÇ dönsün; tam bu sırada bir resize gelsin. Dinleyici
    // taban okumasından SONRA bağlansaydı bu olay tamamen kaybolurdu.
    let resolveBaseline: ((value: boolean) => void) | undefined;
    target.isFullscreen
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => (resolveBaseline = resolve)))
      .mockResolvedValue(true);

    const adapter = new TauriWindowAdapter({ enabled: true, window: target as never });
    const subscription = adapter.onFullscreenChange(listener);
    await flushPromises();
    emitResize();
    resolveBaseline?.(false);

    const stop = await subscription;
    await flushPromises();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(true);
    stop();
  });

  it('art arda resize sorgularında sonucu sıralar, eski yanıt yenisini ezmez', async () => {
    const { target, emitResize } = makeWindow();
    const listener = vi.fn();
    const adapter = new TauriWindowAdapter({ enabled: true, window: target as never });
    const stop = await adapter.onFullscreenChange(listener);
    await flushPromises();
    listener.mockClear();

    // İlk sorgu GEÇ, ikinci sorgu ERKEN döner. Sıralama olmasaydı geç dönen
    // eski yanıt `lastState`i `true`ya çekip ardından `false` bildirir; yani
    // dinleyici pencere hiç pencere kipine dönmemişken "çıktı" derdi.
    let resolveSlow: ((value: boolean) => void) | undefined;
    target.isFullscreen
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => (resolveSlow = resolve)))
      .mockResolvedValue(false);

    emitResize();
    emitResize();
    resolveSlow?.(true);
    await flushPromises();

    expect(listener).not.toHaveBeenCalled();
    stop();
  });
});
