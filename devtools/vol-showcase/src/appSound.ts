import type { Disposable } from '@volstudio/core/lifecycle';
import { UiSoundKit, uiSoundAssets } from '@volstudio/core/audio/ui';
import { uiIntentBusFor } from '@volstudio/core/ui';

/**
 * Uygulama genelinde arayüz sesi: kök, niyet veriyolunu paylaşır; bileşenler (düğme, onay,
 * kaydırıcı, seçim...) sesi niyetten alır, fare üzerine gelme ve klavye odağı kökten
 * dinlenir. Ses bağlamı ilk kullanıcı jestine kadar KURULMAZ (tarayıcı kilidi).
 * Ses laboratuvarı kendi kökünde ayrı bir veriyolu kurar; orada çift ses çalmaz.
 */
export function startAppSound(root: HTMLElement): Disposable {
  let kit: UiSoundKit | null = null;
  let disposed = false;
  const { bus, release } = uiIntentBusFor(root);

  const start = (): void => {
    if (kit || disposed || typeof AudioContext !== 'function') return;
    kit = new UiSoundKit({
      assets: uiSoundAssets(import.meta.env.BASE_URL),
      visibilityTarget: document,
      onError: (error) => console.warn('[VOL.UI] Arayüz sesi:', error),
    });
    kit.attach(bus);
    kit.observe(root);
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
      kit?.dispose();
      kit = null;
      release();
    },
  };
}
