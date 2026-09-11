import { describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ value: 'web' as 'web' | 'desktop' | 'android' }));

vi.mock('@volstudio/tauri-v2', () => ({ getRuntimePlatform: () => platform.value }));

import { hasNativeWindow, supportsDisplaySettings } from '@/app/platform';

describe('vol-hell platform yüklemleri', () => {
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
});
