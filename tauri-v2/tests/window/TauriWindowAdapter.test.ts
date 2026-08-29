import { describe, expect, it, vi } from 'vitest';
import { TauriWindowAdapter } from '../../src/window/TauriWindowAdapter';

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
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();

    target.isFullscreen.mockResolvedValue(true);
    emitResize();
    await Promise.resolve();
    await Promise.resolve();
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
    await Promise.resolve();
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    stop();
    warn.mockRestore();
  });
});
