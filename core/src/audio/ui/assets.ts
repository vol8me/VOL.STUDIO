import { UI_MAX_VARIANTS, UI_SOUND_EVENTS, type UiSoundAssets } from './events';

/** Varyant son ekleri: `press-a.ogg`, `press-b.ogg`, `press-c.ogg`. */
export const UI_SOUND_VARIANT_KEYS = ['a', 'b', 'c'] as const;

/** Paketin gönderdiği UI sesleri bu dizindedir (`core/public/assets/audio/ui`). */
export const UI_SOUND_PUBLIC_DIR = 'assets/audio/ui/';

/**
 * CORE'un gönderdiği varsayılan UI ses setinin URL'leri: her olay için 3 varyant.
 * `baseUrl` tüketicinin yayın kökünü verir (vitrin ve oyunlarda `import.meta.env.BASE_URL`);
 * dosyalar `core/public` altından her paketin çıktısına birleşir (`sharedPublic`).
 * Set `audio-synth` ile çevrimdışı üretilir; çalışma zamanında üretici içe aktarılmaz.
 */
export function uiSoundAssets(baseUrl = './'): UiSoundAssets {
  const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return Object.fromEntries(
    UI_SOUND_EVENTS.map((event) => [
      event,
      UI_SOUND_VARIANT_KEYS.slice(0, UI_MAX_VARIANTS).map(
        (key) => `${root}${UI_SOUND_PUBLIC_DIR}${event}-${key}.ogg`,
      ),
    ]),
  );
}
