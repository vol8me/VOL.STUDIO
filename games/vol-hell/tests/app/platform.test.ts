import { describe, expect, it, vi, afterEach } from 'vitest';

const platform = vi.hoisted(() => ({ value: 'web' as 'web' | 'desktop' | 'android' }));

vi.mock('@volstudio/tauri-v2', () => ({ getRuntimePlatform: () => platform.value }));

import {
  displayCapabilities,
  hasNativeWindow,
  initialInputMode,
  setSessionKind,
  supportsDisplaySettings,
} from '@/app/platform';

describe('vol-hell platform yüklemleri', () => {
  afterEach(() => setSessionKind('desktop'));

  /*
   * İki soru aynı kabuk cevabından türer ama farklı sonuç verir: tarayıcıda
   * görüntü ayarları vardır (DOM tam ekranı) ama pencere boyutu yoktur; Android
   * kabuğunda ikisi de yoktur.
   */
  it.each([
    ['web', false, true],
    ['desktop', true, true],
    ['android', false, false],
  ] as const)('%s kabuğunda native pencere %s, görüntü ayarları %s', (shell, native, display) => {
    platform.value = shell;
    expect(hasNativeWindow()).toBe(native);
    expect(supportsDisplaySettings()).toBe(display);
  });

  it('gamescope oturumunda pencere/çözünürlük yeteneği kapanır, kalite bölümü kalır', () => {
    platform.value = 'desktop';
    setSessionKind('gamescope');

    expect(displayCapabilities()).toEqual({ windowMode: false, resolution: false });
    expect(hasNativeWindow()).toBe(false);
    expect(supportsDisplaySettings()).toBe(true);
    expect(initialInputMode()).toBe('gamepad');
  });

  it('masaüstü oturumunda yetenekler açık, başlangıç kipi belirsizdir', () => {
    platform.value = 'desktop';
    setSessionKind('desktop');

    expect(displayCapabilities()).toEqual({ windowMode: true, resolution: true });
    expect(hasNativeWindow()).toBe(true);
    expect(initialInputMode()).toBeUndefined();
  });
});
