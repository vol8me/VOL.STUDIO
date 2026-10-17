import type { ScopedKey } from '../../persistence/scopedStorage';

/**
 * UI ses ayarları: CİHAZ kapsamlıdır (ekran ve hoparlör başınadır, Steam Cloud'a
 * gitmez). Seviyeler [0,1] doğrusal kazançtır; `muted` hepsini susturur. Kit yalnız
 * UI yolunu (`master × ui`) uygular; `sfx`, `music` ve `speech` seviyeleri aynı
 * kaynakta durur ki ürün kendi otobüslerine `channelGain` ile uygulasın ve dört
 * ayar tek yerden gelsin.
 */
export const UI_AUDIO_CHANNELS = ['ui', 'sfx', 'music', 'speech'] as const;
export type UiAudioChannel = (typeof UI_AUDIO_CHANNELS)[number];

export interface UiAudioSettings {
  readonly master: number;
  readonly ui: number;
  readonly sfx: number;
  readonly music: number;
  readonly speech: number;
  /** Tek anahtarla bütün kanalları susturur (seviyeler korunur). */
  readonly muted: boolean;
}

export const DEFAULT_UI_AUDIO_SETTINGS: UiAudioSettings = {
  master: 1,
  ui: 0.8,
  sfx: 1,
  music: 0.8,
  speech: 1,
  muted: false,
};

/** Cihaz kapsamlı kalıcılık anahtarı. */
export const UI_AUDIO_STORAGE_KEY: ScopedKey = 'device.volui:audio';

/** `ScopedSaveManager`ın okuma/yazma yüzü. */
export interface UiAudioSettingsStore {
  load<T>(key: ScopedKey, defaultValue: T): Promise<T>;
  save<T>(key: ScopedKey, value: T): Promise<void>;
}

const LEVEL_KEYS = ['master', 'ui', 'sfx', 'music', 'speech'] as const;

/**
 * Bilinmeyen/bozuk değeri sessizce varsayılana indirir: kalıcı kayıt elle
 * düzenlenmiş ya da eski bir sürümden kalmış olabilir. Sonlu olmayan seviye
 * varsayılana, aralık dışı değer [0,1]'e kırpılır.
 */
export function normalizeUiAudioSettings(
  value: unknown,
  base: UiAudioSettings = DEFAULT_UI_AUDIO_SETTINGS,
): UiAudioSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return base;
  const raw = value as Record<string, unknown>;
  const levels = { ...base } as Record<string, number | boolean>;
  for (const key of LEVEL_KEYS) {
    const candidate = raw[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      levels[key] = Math.min(1, Math.max(0, candidate));
    }
  }
  if (typeof raw.muted === 'boolean') levels.muted = raw.muted;
  return levels as unknown as UiAudioSettings;
}

/** Bir kanalın etkin kazancı: sessizse 0, değilse `master × kanal`. */
export function channelGain(settings: UiAudioSettings, channel: UiAudioChannel): number {
  return settings.muted ? 0 : settings.master * settings[channel];
}
