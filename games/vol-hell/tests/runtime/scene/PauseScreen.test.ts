import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { i18n, i18next } from '@volstudio/core';
import { PauseScreen } from '@/runtime/scene/PauseScreen';
import { AudioSettings } from '@/app/AudioSettings';
import { VideoSettings } from '@/app/VideoSettings';
import trResources from '@/i18n/tr.json';

const playSfx = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/app/services', () => ({ gameAudio: { playSfx } }));

/** Kalıcılık testin konusu değil; bellekte tutan sahte depo yeter. */
function makeAudioSettings(): AudioSettings {
  const store = new Map<string, unknown>();
  return new AudioSettings({
    load: <T>(key: string) => Promise.resolve(store.get(key) as T | null),
    save: (key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    },
  } as unknown as ConstructorParameters<typeof AudioSettings>[0]);
}

function makeVideoSettings(): VideoSettings {
  const store = new Map<string, unknown>();
  return new VideoSettings({
    load: <T>(key: string) => Promise.resolve(store.get(key) as T | null),
    save: (key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    },
  } as unknown as ConstructorParameters<typeof VideoSettings>[0]);
}

describe('PauseScreen', () => {
  let parent: HTMLDivElement;
  let screen: PauseScreen;
  let cb: {
    onResume: ReturnType<typeof vi.fn>;
    onRestart: ReturnType<typeof vi.fn>;
    onMainMenu: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    i18n.addResources('tr', 'volhell', trResources);
    await i18n.init();
    await i18next.changeLanguage('tr');

    parent = document.createElement('div');
    document.body.appendChild(parent);
    cb = { onResume: vi.fn(), onRestart: vi.fn(), onMainMenu: vi.fn() };
    screen = new PauseScreen(parent, makeAudioSettings(), makeVideoSettings(), {
      onResume: () => {
        cb.onResume();
      },
      onRestart: () => {
        cb.onRestart();
      },
      onMainMenu: () => {
        cb.onMainMenu();
      },
    });
  });

  afterEach(() => {
    screen.destroy();
    document.body.replaceChildren();
  });

  it('kurulunca gizli ve overlay parent altında', () => {
    expect(screen.isVisible()).toBe(false);
    expect(parent.querySelector('.vol-pause-overlay')).not.toBeNull();
  });

  it('show görünür, hide gizler', () => {
    screen.show();
    expect(screen.isVisible()).toBe(true);
    expect(
      parent.querySelector('.vol-pause-overlay')?.classList.contains('vol-pause-overlay--visible'),
    ).toBe(true);

    screen.hide();
    expect(screen.isVisible()).toBe(false);
    expect(
      parent.querySelector('.vol-pause-overlay')?.classList.contains('vol-pause-overlay--visible'),
    ).toBe(false);
  });

  it('tekrar tekrar açılıp kapanabilir', () => {
    for (let i = 0; i < 3; i++) {
      screen.show();
      expect(screen.isVisible()).toBe(true);
      screen.hide();
      expect(screen.isVisible()).toBe(false);
    }
  });

  it('ses kontrolleri ve sarsıntı anahtarı ekranda var', () => {
    screen.show();
    // master, sfx, music seviyeleri + mute ve sarsıntı anahtarları.
    expect(parent.querySelectorAll('input[type="range"]').length).toBeGreaterThanOrEqual(3);
    expect(parent.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThanOrEqual(2);
  });

  it('pause ayarları X düğmesiyle ana pause paneline döner', async () => {
    screen.show();
    const settingsButton = [
      ...parent.querySelectorAll<HTMLButtonElement>('.pause-panel button'),
    ].find((button) => button.textContent?.includes(trResources.pause.settings));
    settingsButton?.click();
    await Promise.resolve();

    const close = parent.querySelector<HTMLButtonElement>('.pause-settings-close');
    const settingsPanel = parent.querySelector<HTMLElement>('.pause-settings-panel');
    expect(close).not.toBeNull();
    expect(settingsPanel?.inert).toBe(false);

    close?.click();
    await Promise.resolve();
    expect(settingsPanel?.inert).toBe(true);
    expect(screen.isVisible()).toBe(true);
  });

  it('destroy overlay ve dil aboneliğini temizler', () => {
    const offSpy = vi.spyOn(i18next, 'off');
    screen.show();
    screen.destroy();

    expect(parent.querySelector('.vol-pause-overlay')).toBeNull();
    expect(offSpy).toHaveBeenCalledWith('languageChanged', expect.any(Function));
    offSpy.mockRestore();

    screen = new PauseScreen(parent, makeAudioSettings(), makeVideoSettings(), cb);
  });

  it('dil değişince etiketler boş stringe düşmez', async () => {
    screen.show();
    await i18next.changeLanguage('tr');
    const labels = [...parent.querySelectorAll('button')].map((b) => b.textContent ?? '');
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
  });
});
