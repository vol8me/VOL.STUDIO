import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SaveManager } from '@volstudio/core';
import { VideoSettings } from '@/app/VideoSettings';
import { VideoSettingsController } from '@/app/VideoSettingsController';

function makeSettings(): VideoSettings {
  return new VideoSettings({
    load: vi.fn().mockResolvedValue({}),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as SaveManager);
}

function makeNativeAdapter() {
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
    setResolution: vi.fn().mockResolvedValue(undefined),
    onFullscreenChange: vi.fn((listener: (active: boolean) => void) => {
      nativeListener = listener;
      return Promise.resolve(stop);
    }),
  };
  return {
    adapter,
    stop,
    emitNative: (active: boolean) => {
      fullscreen = active;
      nativeListener?.(active);
    },
  };
}

afterEach(() => {
  document.documentElement.removeAttribute('data-vol-graphics-quality');
});

describe('VideoSettingsController', () => {
  it('başlangıç profilini native pencereye ve render yüzeyine uygular', async () => {
    const settings = makeSettings();
    const native = makeNativeAdapter();
    const resize = vi.fn();
    window.addEventListener('resize', resize);
    const controller = new VideoSettingsController(settings, {
      windowAdapter: native.adapter as never,
    });

    await controller.start();

    expect(native.adapter.setResolution).toHaveBeenCalledWith(1280, 720);
    expect(document.documentElement.dataset.volGraphicsQuality).toBe('high');
    expect(resize).toHaveBeenCalled();
    controller.destroy();
    window.removeEventListener('resize', resize);
  });

  it('ayar değişikliklerinde fullscreen, çözünürlük ve kaliteyi canlı uygular', async () => {
    const settings = makeSettings();
    const native = makeNativeAdapter();
    const controller = new VideoSettingsController(settings, {
      windowAdapter: native.adapter as never,
    });
    await controller.start();
    native.adapter.setResolution.mockClear();

    await settings.setDisplayMode('fullscreen');
    await controller.flush();
    expect(native.adapter.setFullscreen).toHaveBeenCalledWith(true);
    expect(native.adapter.setResolution).not.toHaveBeenCalled();

    await settings.setResolution('1600x900');
    await settings.setGraphicsQuality('low');
    await settings.setDisplayMode('windowed');
    await controller.flush();
    expect(native.adapter.setFullscreen).toHaveBeenCalledWith(false);
    expect(native.adapter.setResolution).toHaveBeenLastCalledWith(1600, 900);
    expect(document.documentElement.dataset.volGraphicsQuality).toBe('low');
    controller.destroy();
  });

  it('F11 native gerçek durumunu tersine çevirir ve ayar modelini günceller', async () => {
    const settings = makeSettings();
    const native = makeNativeAdapter();
    const controller = new VideoSettingsController(settings, {
      windowAdapter: native.adapter as never,
    });
    await controller.start();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', cancelable: true }));
    await Promise.resolve();
    await settings.flush();
    await controller.flush();

    expect(settings.getDisplayMode()).toBe('fullscreen');
    expect(native.adapter.setFullscreen).toHaveBeenCalledWith(true);
    controller.destroy();
  });

  it('native ESC/pencere değişikliğini modele geri yansıtır ve destroy aboneliği kaldırır', async () => {
    const settings = makeSettings();
    const native = makeNativeAdapter();
    const controller = new VideoSettingsController(settings, {
      windowAdapter: native.adapter as never,
    });
    await controller.start();

    native.emitNative(true);
    await settings.flush();
    expect(settings.getDisplayMode()).toBe('fullscreen');

    controller.destroy();
    controller.destroy();
    expect(native.stop).toHaveBeenCalledOnce();
    native.emitNative(false);
    expect(settings.getDisplayMode()).toBe('fullscreen');
  });

  it('native uygulama hatasını sınırlar ve sonraki ayarı kabul eder', async () => {
    const settings = makeSettings();
    const native = makeNativeAdapter();
    native.adapter.setResolution.mockRejectedValueOnce(new Error('WM reddetti'));
    const onError = vi.fn();
    const controller = new VideoSettingsController(settings, {
      windowAdapter: native.adapter as never,
      onError,
    });

    await controller.start();
    await settings.setGraphicsQuality('balanced');
    await controller.flush();

    expect(onError).toHaveBeenCalled();
    expect(document.documentElement.dataset.volGraphicsQuality).toBe('balanced');
    controller.destroy();
  });
});
