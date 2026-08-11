import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SaveManager, type IStorageAdapter } from '@volstudio/core';
import { AudioSettings, type AudioSettingsData } from '@/app/AudioSettings';
import { audioConfig } from '@/config/audio';

function makeFailingAdapter(failKey?: string): IStorageAdapter {
  return {
    get: vi.fn(() => Promise.resolve(undefined)),
    set: vi.fn((key: string) => {
      if (!failKey || key === failKey) {
        return Promise.reject(new Error('storage failed'));
      }
      return Promise.resolve();
    }),
    remove: vi.fn(() => Promise.resolve()),
  } as unknown as IStorageAdapter;
}

function makeAdapter(initial: Record<string, unknown> = {}): IStorageAdapter {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key))),
    set: vi.fn((_key: string, value: unknown) => {
      store.set(_key, value);
      return Promise.resolve();
    }),
    remove: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  } as unknown as IStorageAdapter;
}

describe('AudioSettings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('load — boş depoda varsayılan değerleri kullanır', async () => {
    const settings = new AudioSettings(new SaveManager(makeAdapter()));
    await settings.load();

    expect(settings.getMasterVolume()).toBe(audioConfig.masterVolume);
    expect(settings.getSfxVolume()).toBe(audioConfig.sfxVolume);
    expect(settings.getMusicVolume()).toBe(audioConfig.musicVolume);
    expect(settings.getAmbientVolume()).toBe(audioConfig.ambientVolume);
    expect(settings.isMuted()).toBe(audioConfig.muted);
    expect(settings.isScreenShakeEnabled()).toBe(audioConfig.screenShakeEnabled);
  });

  it('load — eksik alanları varsayılanlarla tamamlar', async () => {
    const settings = new AudioSettings(
      new SaveManager(
        makeAdapter({
          'vol-hell:audio-settings': { masterVolume: 0.2 },
        }),
      ),
    );
    await settings.load();

    expect(settings.getMasterVolume()).toBe(0.2);
    expect(settings.getSfxVolume()).toBe(audioConfig.sfxVolume);
  });

  it('setMasterVolume — 0-1 aralığına kısar ve değişiklik bildirimi gönderir', async () => {
    const settings = new AudioSettings(new SaveManager(makeAdapter()));
    await settings.load();

    const listener = vi.fn();
    const unsubscribe = settings.onChange(listener);

    await settings.setMasterVolume(1.5);
    expect(settings.getMasterVolume()).toBe(1);
    expect(listener).toHaveBeenCalled();
    const last = listener.mock.calls[listener.mock.calls.length - 1][0] as AudioSettingsData;
    expect(last.masterVolume).toBe(1);

    unsubscribe();
    await settings.setMasterVolume(0.3);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setMuted — durumu değiştirir ve persist eder', async () => {
    const settings = new AudioSettings(new SaveManager(makeAdapter()));
    await settings.load();

    await settings.setMuted(true);
    expect(settings.isMuted()).toBe(true);
  });

  it('setScreenShakeIntensity — değeri 0-1 aralığına kısar', async () => {
    const settings = new AudioSettings(new SaveManager(makeAdapter()));
    await settings.load();

    await settings.setScreenShakeIntensity(-0.5);
    expect(settings.getScreenShakeIntensity()).toBe(0);

    await settings.setScreenShakeIntensity(2);
    expect(settings.getScreenShakeIntensity()).toBe(1);
  });

  it('persist hatası — bildirimi engellemez ve rejection fırlatmaz', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const settings = new AudioSettings(new SaveManager(makeFailingAdapter()));
    await settings.load();

    const listener = vi.fn();
    settings.onChange(listener);

    await expect(settings.setMasterVolume(0.5)).resolves.toBeUndefined();
    expect(listener).toHaveBeenCalled();
    expect(settings.getMasterVolume()).toBe(0.5);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('K5: geçersiz tipler ve aralık dışı değerler varsayılana/kelepçeye düşer', async () => {
    const settings = new AudioSettings(
      new SaveManager(
        makeAdapter({
          'vol-hell:audio-settings': {
            masterVolume: 'yüksek',
            sfxVolume: Number.NaN,
            musicVolume: 5,
            ambientVolume: -2,
            muted: 'evet',
            screenShakeIntensity: null,
          },
        }),
      ),
    );
    await settings.load();

    expect(settings.getMasterVolume()).toBe(audioConfig.masterVolume);
    expect(settings.getSfxVolume()).toBe(audioConfig.sfxVolume);
    expect(settings.getMusicVolume()).toBe(1);
    expect(settings.getAmbientVolume()).toBe(0);
    expect(settings.isMuted()).toBe(audioConfig.muted);
    expect(settings.getScreenShakeIntensity()).toBe(audioConfig.screenShakeIntensity);
  });

  it('K8: hızlı ardışık yazmalar tek bir depo yazmasında birleşir', async () => {
    const adapter = makeAdapter();
    const settings = new AudioSettings(new SaveManager(adapter));
    await settings.load();

    const setSpy = vi.mocked(adapter.set);
    setSpy.mockClear();

    await Promise.all([
      settings.setMasterVolume(0.1),
      settings.setMasterVolume(0.2),
      settings.setMasterVolume(0.3),
      settings.setMasterVolume(0.4),
    ]);

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(settings.getMasterVolume()).toBe(0.4);
  });
});
