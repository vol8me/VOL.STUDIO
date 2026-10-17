import {
  DEFAULT_UI_SOUND_PALETTE,
  UI_MAX_VARIANTS,
  UI_SOUND_EVENTS,
  type UiSoundAssets,
  type UiSoundEvent,
  type UiSoundPalette,
} from './events';

/** Varyant son ekleri: `press-a.ogg`, `press-b.ogg`, `press-c.ogg`. */
export const UI_SOUND_VARIANT_KEYS = ['a', 'b', 'c'] as const;

/** Paketin gönderdiği UI sesleri bu dizindedir; palet alt dizinleridir (`ui/steel`, `ui/aurum`). */
export const UI_SOUND_PUBLIC_DIR = 'assets/audio/ui/';

/** Olay kimliği → dosya adı gövdesi (`toggleOn` → `toggle-on`). */
export function uiSoundFileStem(event: UiSoundEvent): string {
  return event.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * CORE'un gönderdiği UI ses setinin URL'leri: her olay için 3 varyant, seçilen paletten.
 * `baseUrl` tüketicinin yayın kökünü verir (vitrin ve oyunlarda `import.meta.env.BASE_URL`);
 * dosyalar `core/public` altından her paketin çıktısına birleşir (`sharedPublic`).
 * Set `audio-synth` ile çevrimdışı üretilir; çalışma zamanında üretici içe aktarılmaz.
 */
export function uiSoundAssets(
  baseUrl = './',
  palette: UiSoundPalette = DEFAULT_UI_SOUND_PALETTE,
): UiSoundAssets {
  const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return Object.fromEntries(
    UI_SOUND_EVENTS.map((event) => [
      event,
      UI_SOUND_VARIANT_KEYS.slice(0, UI_MAX_VARIANTS).map(
        (key) => `${root}${UI_SOUND_PUBLIC_DIR}${palette}/${uiSoundFileStem(event)}-${key}.ogg`,
      ),
    ]),
  );
}
