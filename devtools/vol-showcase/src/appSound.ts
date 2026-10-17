import type { Disposable } from '@volstudio/core/lifecycle';
import { UiSoundKit, uiSoundAssets, uiSoundPaletteFor } from '@volstudio/core/audio/ui';
import { uiIntentBusFor, type ThemeController } from '@volstudio/core/ui';
import type { UiAudioSettingsStore } from '@volstudio/core/audio/ui';

/** Ses ayarları bu tarayıcıda kalıcıdır (cihaz kapsamlı anahtar); depolama yoksa/bozuksa varsayılan. */
export function localAudioStore(): UiAudioSettingsStore {
  return {
    load: <T>(key: string, fallback: T): Promise<T> => {
      try {
        const raw = localStorage.getItem(key);
        return Promise.resolve(raw === null ? fallback : (JSON.parse(raw) as T));
      } catch {
        return Promise.resolve(fallback);
      }
    },
    save: <T>(key: string, value: T): Promise<void> => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // depolama kapalı: ayar oturumla sınırlı kalır
      }
      return Promise.resolve();
    },
  };
}

let appKit: UiSoundKit | null = null;

/** Uygulama geneli ses kiti (jestten sonra); ses laboratuvarı ayar değişimini ona da iletir. */
export function getAppSoundKit(): UiSoundKit | null {
  return appKit;
}

/**
 * Uygulama genelinde arayüz sesi: kök, niyet veriyolunu paylaşır; bileşenler (düğme, onay,
 * kaydırıcı, seçim...) sesi niyetten alır, fare üzerine gelme ve klavye odağı kökten
 * dinlenir. Ses bağlamı ilk kullanıcı jestine kadar KURULMAZ (tarayıcı kilidi).
 * Palet temaya bağlıdır (`followTheme`). Ses laboratuvarı kendi kökünde ayrı bir veriyolu kurar; orada çift ses çalmaz.
 */
export function startAppSound(root: HTMLElement, theme: ThemeController): Disposable {
  let kit: UiSoundKit | null = null;
  let disposed = false;
  const { bus, release } = uiIntentBusFor(root);

  const start = (): void => {
    if (kit || disposed || typeof AudioContext !== 'function') return;
    kit = new UiSoundKit({
      assets: uiSoundAssets(import.meta.env.BASE_URL, uiSoundPaletteFor(theme.state.theme)),
      visibilityTarget: document,
      store: localAudioStore(),
      onError: (error) => console.warn('[VOL.UI] Arayüz sesi:', error),
    });
    kit.attach(bus);
    appKit = kit;
    void kit.restore();
    kit.observe(root);
    // Skin değişince ses paleti de değişir (çelik donanım ↔ yaldızlı cam).
    kit.followTheme(theme, (palette) => uiSoundAssets(import.meta.env.BASE_URL, palette));
    // Örnek yükleme ve çözme ilk etkileşimin kareleriyle yarışmasın: boşta zamana ertelenir.
    const preload = (): void => void kit?.preload();
    void kit.unlock().then(() => {
      if (typeof requestIdleCallback === 'function')
        requestIdleCallback(preload, { timeout: 3000 });
      else setTimeout(preload, 1500);
    });
  };
  // Jest yakalama aşaması: bileşenin kendi tıklamasından ÖNCE kit kurulur.
  root.addEventListener('pointerdown', start, { capture: true });
  root.addEventListener('keydown', start, { capture: true });

  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      root.removeEventListener('pointerdown', start, { capture: true });
      root.removeEventListener('keydown', start, { capture: true });
      if (appKit === kit) appKit = null;
      kit?.dispose();
      kit = null;
      release();
    },
  };
}
