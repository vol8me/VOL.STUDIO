import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SaveManager } from '@volstudio/core';
import { LifePreferences } from '@/app/LifePreferences';

const KEY = 'vol-life:preferences';

function memorySaveManager(initial?: unknown) {
  const data = new Map<string, unknown>();
  if (initial !== undefined) data.set(KEY, initial);
  const manager = {
    load: vi.fn((key: string, fallback: unknown) =>
      Promise.resolve(data.has(key) ? data.get(key) : fallback),
    ),
    save: vi.fn((key: string, value: unknown) => {
      data.set(key, structuredClone(value));
      return Promise.resolve();
    }),
  };
  return { manager, saveManager: manager as unknown as SaveManager, data };
}

afterEach(() => vi.restoreAllMocks());

describe('LifePreferences', () => {
  it('kayıt yokken erişilebilir varsayılanlarla başlar', async () => {
    const preferences = new LifePreferences(memorySaveManager().saveManager);
    await preferences.load();

    expect(preferences.get()).toEqual({
      displayMode: 'windowed',
      showFps: false,
      hapticsEnabled: false,
    });
  });

  it('geçerli alanları okur, eksik ve bozuk alanları ayrı ayrı varsayılana döndürür', async () => {
    const preferences = new LifePreferences(
      memorySaveManager({
        displayMode: 'fullscreen',
        showFps: true,
        hapticsEnabled: 'evet',
      }).saveManager,
    );

    await preferences.load();

    expect(preferences.get()).toEqual({
      displayMode: 'fullscreen',
      showFps: true,
      hapticsEnabled: false,
    });
  });

  it('değişimi bütün snapshot ile bildirir ve tek anahtara kalıcı yazar', async () => {
    const { manager, saveManager, data } = memorySaveManager();
    const preferences = new LifePreferences(saveManager);
    const listener = vi.fn();
    const stop = preferences.subscribe(listener);

    await preferences.setShowFps(true);

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      displayMode: 'windowed',
      showFps: true,
      hapticsEnabled: false,
    });
    expect(manager.save).toHaveBeenCalledExactlyOnceWith(KEY, preferences.get());
    expect(data.get(KEY)).toEqual(preferences.get());

    stop();
    await preferences.setHapticsEnabled(true);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('aynı değer tekrar bildirilmez; ardışık yazımlar sırayı korur', async () => {
    const { manager, saveManager } = memorySaveManager();
    const releases: Array<() => void> = [];
    manager.save.mockImplementation(() => new Promise<void>((resolve) => releases.push(resolve)));
    const preferences = new LifePreferences(saveManager);
    const listener = vi.fn();
    preferences.subscribe(listener);

    const first = preferences.setDisplayMode('fullscreen');
    const duplicate = preferences.setDisplayMode('fullscreen');
    const second = preferences.setShowFps(true);
    await Promise.resolve();
    expect(manager.save).toHaveBeenCalledTimes(1);

    releases.shift()?.();
    await first;
    await duplicate;
    await Promise.resolve();
    expect(manager.save).toHaveBeenCalledTimes(2);
    releases.shift()?.();
    await second;
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('okuma/yazma hatasını uyarır; oturum değerini ve sonraki yazımı korur', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { manager, saveManager } = memorySaveManager();
    manager.load.mockRejectedValueOnce(new Error('okuma'));
    manager.save.mockRejectedValueOnce(new Error('yazma'));
    const preferences = new LifePreferences(saveManager);

    await preferences.load();
    await preferences.setHapticsEnabled(true);
    await preferences.setShowFps(true);

    expect(preferences.get()).toMatchObject({ hapticsEnabled: true, showFps: true });
    expect(manager.save).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('yazma hatasını kullanıcı yüzeyine taşıyacak abonelere bildirir', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { manager, saveManager } = memorySaveManager();
    const failure = new Error('disk dolu');
    manager.save.mockRejectedValueOnce(failure);
    const preferences = new LifePreferences(saveManager);
    const listener = vi.fn();
    const stop = preferences.subscribeSaveErrors(listener);

    await preferences.setShowFps(true);

    expect(listener).toHaveBeenCalledExactlyOnceWith(failure);
    stop();
    manager.save.mockRejectedValueOnce(new Error('ikinci hata'));
    await preferences.setHapticsEnabled(true);
    expect(listener).toHaveBeenCalledOnce();
  });
});
