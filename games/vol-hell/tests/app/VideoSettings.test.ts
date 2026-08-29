import { describe, expect, it, vi } from 'vitest';
import type { SaveManager } from '@volstudio/core';
import { VideoSettings } from '@/app/VideoSettings';

function makeStore(initial?: unknown): {
  manager: SaveManager;
  load: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
} {
  const load = vi.fn().mockResolvedValue(initial ?? {});
  const save = vi.fn().mockResolvedValue(undefined);
  return { manager: { load, save } as unknown as SaveManager, load, save };
}

describe('VideoSettings', () => {
  it('varsayılan profil mevcut oyunun kalite ve pencere boyutunu korur', () => {
    const settings = new VideoSettings(makeStore().manager);

    expect(settings.getData()).toEqual({
      displayMode: 'windowed',
      resolution: '1280x720',
      graphicsQuality: 'high',
    });
    expect(settings.getResolution()).toMatchObject({ width: 1280, height: 720 });
    expect(settings.getMaxDpr()).toBe(1.5);
    expect(settings.getParticleScale()).toBe(1);
  });

  it('kalıcı geçerli snapshotı yükler ve dinleyiciyi kopyayla bildirir', async () => {
    const store = makeStore({
      displayMode: 'fullscreen',
      resolution: '1600x900',
      graphicsQuality: 'balanced',
    });
    const settings = new VideoSettings(store.manager);
    const listener = vi.fn();
    settings.onChange(listener);

    await settings.load();

    expect(settings.getDisplayMode()).toBe('fullscreen');
    expect(settings.getResolutionId()).toBe('1600x900');
    expect(settings.getGraphicsQuality()).toBe('balanced');
    expect(settings.getParticleScale()).toBe(0.8);
    expect(listener).toHaveBeenCalledWith(settings.getData());
    expect(listener.mock.calls[0][0]).not.toBe(settings.getData());
  });

  it('bozuk kayıt alanlarını tek tek varsayılana düşürür', async () => {
    const store = makeStore({
      displayMode: 'borderless',
      resolution: '999x1',
      graphicsQuality: 42,
    });
    const settings = new VideoSettings(store.manager);

    await settings.load();

    expect(settings.getData()).toEqual({
      displayMode: 'windowed',
      resolution: '1280x720',
      graphicsQuality: 'high',
    });
  });

  it('değişiklikleri anında yayınlar ve snapshotları sırayla kaydeder', async () => {
    const store = makeStore();
    const settings = new VideoSettings(store.manager);
    const listener = vi.fn();
    settings.onChange(listener);

    await settings.setDisplayMode('fullscreen');
    await settings.setResolution('1920x1080');
    await settings.setGraphicsQuality('low');
    await settings.flush();

    expect(listener).toHaveBeenCalledTimes(3);
    expect(
      store.save.mock.calls.map(
        (call) => call[1] as { displayMode: string; resolution: string; graphicsQuality: string },
      ),
    ).toEqual([
      { displayMode: 'fullscreen', resolution: '1280x720', graphicsQuality: 'high' },
      { displayMode: 'fullscreen', resolution: '1920x1080', graphicsQuality: 'high' },
      { displayMode: 'fullscreen', resolution: '1920x1080', graphicsQuality: 'low' },
    ]);
  });

  it('aynı veya geçersiz değer için bildirim ve yazma üretmez', async () => {
    const store = makeStore();
    const settings = new VideoSettings(store.manager);
    const listener = vi.fn();
    settings.onChange(listener);

    await settings.setDisplayMode('windowed');
    await settings.setResolution('geçersiz');
    await settings.setGraphicsQuality('ultra' as never);

    expect(listener).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('bir dinleyici/yazma hatası sonraki dinleyici ve yazımı engellemez', async () => {
    const store = makeStore();
    store.save.mockRejectedValueOnce(new Error('disk dolu')).mockResolvedValue(undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const settings = new VideoSettings(store.manager);
    const healthy = vi.fn();
    settings.onChange(() => {
      throw new Error('UI bozuk');
    });
    settings.onChange(healthy);

    await settings.setDisplayMode('fullscreen');
    await settings.setResolution('1600x900');

    expect(healthy).toHaveBeenCalledTimes(2);
    expect(store.save).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('dispose sonrası geç yükleme ve setter sonuçlarını yutar', async () => {
    let resolveLoad: (value: unknown) => void = () => {};
    const store = makeStore();
    store.load.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const settings = new VideoSettings(store.manager);
    const listener = vi.fn();
    const unsubscribe = settings.onChange(listener);
    const loading = settings.load();

    settings.dispose();
    settings.dispose();
    unsubscribe();
    resolveLoad({ displayMode: 'fullscreen' });
    await loading;
    await settings.setDisplayMode('fullscreen');

    expect(settings.getDisplayMode()).toBe('windowed');
    expect(listener).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });
});
